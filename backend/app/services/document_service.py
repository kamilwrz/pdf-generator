"""Secure PDF rendering and Storage V2 document lifecycle orchestration."""
from __future__ import annotations

import datetime
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from urllib.parse import unquote, urlparse

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import (
    BACKEND_URL,
    IMAGES_UPLOAD_DIR,
    PDF_UPLOAD_DIR,
    TEMPLATE_ASSETS_DIR,
    USE_S3,
)
from app.crud.pdfs import (
    create_new_pdf,
    delete_pdf_by_id,
    elements_from_rows,
    enqueue_storage_cleanup,
    request_pdf_by_id,
    request_pdf_elements_by_element_id,
    serialize_spacing_px,
    update_pdf_elements,
)
from app.models.models import Image, Pdf
from app.services.image_storage import (
    S3_BACKEND as IMAGE_S3_BACKEND,
    local_path_for_target as local_image_path_for_target,
    target_for_image,
)
from app.services.pdf_storage import (
    REQUEST_CLEANUP_LIMIT,
    StorageTarget,
    configured_backend,
    delete_v2_object,
    make_pdf_key,
    process_cleanup_jobs,
    put_pdf_bytes,
    read_pdf_bytes,
    target_for_pdf,
)
from app.utils.build_pdf import build_pdf_to_buffer
from app.utils.image_src_to_path import image_src_to_local_path
from app.utils.document_integrity import (
    canonical_title_key,
    create_request_hash,
    current_template_id,
    normalize_idempotency_key,
)


_IMAGE_CONTENT_PATH_RE = re.compile(r"^/images/(?P<image_id>[1-9]\d*)/content/?$")


def _image_not_found() -> HTTPException:
    """Return one non-enumerating error for missing and foreign image ids."""

    return HTTPException(
        status_code=404,
        detail={"code": "image_not_found", "message": "Nie znaleziono obrazu."},
    )


def _invalid_image_source() -> HTTPException:
    """Return the stable validation error for a disallowed image locator."""

    return HTTPException(
        status_code=422,
        detail={
            "code": "invalid_image_source",
            "message": "Nieprawidłowe źródło obrazu.",
        },
    )


def _element_value(element, name: str, default=None):
    """Read one canvas field from a Pydantic object or assistant JSON dict."""

    return element.get(name, default) if isinstance(element, dict) else getattr(element, name, default)


def _image_id_from_src(src: str | None) -> int | None:
    """Extract an image id only from the authenticated content-route shape."""
    raw = str(src or "").replace("\\", "/")
    if not raw or "?" in raw or "#" in raw:
        return None
    parsed = urlparse(raw)
    # New clients persist deployment-neutral application paths. During the N-1
    # window, accept an older absolute URL only when its origin exactly matches
    # this API's configured public origin. Arbitrary HTTP(S), protocol-relative,
    # file, and local-path locators never cross the allowlist boundary.
    path = raw
    if parsed.scheme or parsed.netloc:
        trusted = urlparse(str(BACKEND_URL or "").rstrip("/"))
        if (
            parsed.scheme not in {"http", "https"}
            or parsed.scheme != trusted.scheme
            or parsed.netloc != trusted.netloc
        ):
            return None
        path = parsed.path
    match = _IMAGE_CONTENT_PATH_RE.fullmatch(path)
    return int(match.group("image_id")) if match is not None else None


def _resolve_template_asset(src: str | None) -> str | None:
    """Resolve an allowlisted template asset while preventing prefix traversal."""
    raw = str(src or "").replace("\\", "/")
    if not raw or "?" in raw or "#" in raw:
        return None
    parsed = urlparse(raw)
    path = raw
    if parsed.scheme or parsed.netloc:
        trusted = urlparse(str(BACKEND_URL or "").rstrip("/"))
        if (
            parsed.scheme not in {"http", "https"}
            or parsed.scheme != trusted.scheme
            or parsed.netloc != trusted.netloc
        ):
            return None
        path = parsed.path
    normalized = unquote(path).lstrip("/")
    if not normalized.startswith("template-assets/"):
        return None
    relative = normalized.removeprefix("template-assets/")
    root = Path(TEMPLATE_ASSETS_DIR).resolve()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise _invalid_image_source() from exc
    if not candidate.is_file():
        raise _image_not_found()
    return str(candidate)


def validate_and_resolve_image_elements(
    db: Session,
    elements: list,
    *,
    owner_id: int,
    resolve_paths: bool = True,
    temporary_image_dir: str | None = None,
) -> dict[str, str]:
    """Batch-authorize every live image element and return renderer paths.

    ``src`` and ``img_id`` are both client controlled. The authenticated owner
    therefore scopes one batched Image query, and when both identifiers are
    present they must agree. Sources without an owned image id are accepted only
    when they resolve below the immutable template-assets directory. Autosave
    passes ``resolve_paths=False`` because it needs authorization but must not
    download S3 objects that are not being rendered.
    """
    image_elements = [
        element
        for element in elements
        if _element_value(element, "category") == "image"
        and _element_value(element, "deleted", False) is not True
    ]
    requested_by_element: dict[int, int | None] = {}
    requested_ids: set[int] = set()

    for position, element in enumerate(image_elements):
        body_id = _element_value(element, "img_id")
        body_id = int(body_id) if body_id is not None else None
        src_id = _image_id_from_src(_element_value(element, "src"))
        if body_id is not None:
            # An owned database id never authorizes a second, arbitrary source.
            # Require the canonical authenticated route first, before querying
            # ownership, so malformed and cross-origin locators cannot become a
            # browser tracking URL merely by accompanying a valid ``img_id``.
            if src_id is None:
                raise _invalid_image_source()
            if body_id != src_id:
                raise _image_not_found()
        requested_id = body_id if body_id is not None else src_id
        requested_by_element[position] = requested_id
        if requested_id is not None:
            requested_ids.add(requested_id)

    owned_by_id: dict[int, Image] = {}
    if requested_ids:
        rows = db.query(Image).filter(
            Image.id.in_(requested_ids),
            Image.owner_id == int(owner_id),
        ).all()
        owned_by_id = {int(row.id): row for row in rows}
        if set(owned_by_id) != requested_ids:
            raise _image_not_found()

    resolved: dict[str, str] = {}
    resolved_owned_paths: dict[int, str] = {}
    for position, element in enumerate(image_elements):
        src = str(_element_value(element, "src") or "")
        requested_id = requested_by_element[position]
        if requested_id is not None:
            if requested_id in resolved_owned_paths:
                resolved[src] = resolved_owned_paths[requested_id]
                continue
            image = owned_by_id[requested_id]
            path = str(image.file_path or "")
            if not path:
                raise _image_not_found()
            try:
                storage_target = target_for_image(
                    image,
                    root=IMAGES_UPLOAD_DIR,
                )
            except (FileNotFoundError, ValueError) as exc:
                raise _image_not_found() from exc
            if resolve_paths:
                if storage_target.backend == IMAGE_S3_BACKEND:
                    resolved[src] = image_src_to_local_path(
                        path,
                        temporary_directory=temporary_image_dir,
                    )
                else:
                    local_path = local_image_path_for_target(
                        storage_target,
                        root=IMAGES_UPLOAD_DIR,
                    )
                    if not local_path.is_file():
                        raise _image_not_found()
                    resolved[src] = str(local_path)
            else:
                resolved[src] = path
            resolved_owned_paths[requested_id] = resolved[src]
            continue
        if not src:
            raise _invalid_image_source()
        template_path = _resolve_template_asset(src)
        if template_path is None:
            raise _invalid_image_source()
        resolved[src] = template_path
    return resolved


def resolve_image_src_for_pdf(
    db: Session,
    src: str,
    owner_id: int | None = None,
    temporary_image_dir: str | None = None,
) -> str:
    """Resolve one template asset or an owner-scoped uploaded image."""
    template_path = _resolve_template_asset(src)
    if template_path is not None:
        return template_path
    if owner_id is None:
        raise _image_not_found()
    image_id = _image_id_from_src(src)
    if image_id is None:
        raise _invalid_image_source()
    image = db.query(Image).filter(
        Image.id == image_id,
        Image.owner_id == int(owner_id),
    ).first()
    if image is None or not image.file_path:
        raise _image_not_found()
    path = str(image.file_path)
    try:
        storage_target = target_for_image(image, root=IMAGES_UPLOAD_DIR)
    except (FileNotFoundError, ValueError) as exc:
        raise _image_not_found() from exc
    if storage_target.backend == IMAGE_S3_BACKEND:
        return image_src_to_local_path(
            path,
            temporary_directory=temporary_image_dir,
        )
    local_path = local_image_path_for_target(
        storage_target,
        root=IMAGES_UPLOAD_DIR,
    )
    if not local_path.is_file():
        raise _image_not_found()
    return str(local_path)


def make_image_resolver(
    db: Session,
    owner_id: int | None = None,
    elements: list | None = None,
    temporary_image_dir: str | None = None,
):
    """Return a resolver backed by one owner-scoped batch validation."""
    resolved = (
        validate_and_resolve_image_elements(
            db,
            elements,
            owner_id=int(owner_id),
            temporary_image_dir=temporary_image_dir,
        )
        if elements is not None and owner_id is not None
        else None
    )

    def _resolve(src: str) -> str:
        if resolved is not None:
            key = str(src or "")
            if key not in resolved:
                raise _invalid_image_source()
            return resolved[key]
        return resolve_image_src_for_pdf(
            db,
            src,
            owner_id,
            temporary_image_dir=temporary_image_dir,
        )

    return _resolve


def _render_bytes(db: Session, *, user, pdf_data, elements: list) -> bytes:
    """Render only after every image reference belongs to ``user``."""
    # Remote image bodies are artifacts of this one render. A unique directory
    # prevents cross-request filename collisions and is removed on success or
    # any renderer/provider exception.
    with TemporaryDirectory(prefix="cv-studio-render-") as temporary_image_dir:
        resolver = make_image_resolver(
            db,
            int(user.id),
            elements,
            temporary_image_dir=temporary_image_dir,
        )
        return build_pdf_to_buffer(pdf_data, elements, resolver, watermark=False)


def _require_starter_name(elements: list) -> None:
    """Reject output for a starter document whose semantic name is untouched.

    Legacy/imported documents have no starter binding and remain compatible.
    The server check backs up the accessible client focus flow so a handcrafted
    request cannot persist or export a nameless starter.
    """
    name_fields = [
        element for element in elements
        if any(
            binding.get("path") == ["name"]
            for binding in (getattr(element, "cvDataBindings", None) or [])
            if isinstance(binding, dict)
        )
    ]
    if name_fields and not any(str(element.content or "").strip() for element in name_fields):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "starter_name_required",
                "message": "Uzupełnij imię i nazwisko przed zapisem lub eksportem CV.",
            },
        )


def render_document_bytes(db: Session, *, user, pdf_data) -> bytes:
    """Render the authenticated caller's live canvas without persisting it."""
    _require_starter_name(pdf_data.root)
    elements = getattr(pdf_data, "render_root", None) or pdf_data.root
    if not elements:
        raise HTTPException(status_code=400, detail="Brakuje części danych.")
    return _render_bytes(db, user=user, pdf_data=pdf_data, elements=elements)


def _queue_old_target(db: Session, target: StorageTarget | None) -> None:
    """Persist cleanup for an obsolete object inside the current DB transaction."""
    if target is None:
        return
    enqueue_storage_cleanup(db, (target.backend, target.key))


def _safe_old_target(pdf_row, *, username: str | None) -> StorageTarget | None:
    """Return a validated old target, skipping unsafe historic locators."""
    try:
        return target_for_pdf(
            pdf_row,
            root=PDF_UPLOAD_DIR,
            legacy_owner_segment=username,
        )
    except (FileNotFoundError, ValueError):
        return None


def _compensate_v2_object(db: Session, backend: str, key: str) -> None:
    """Remove an uncommitted object or durably record the failed compensation.

    The original database/storage exception remains authoritative. Cleanup
    errors must not replace it, but silently dropping both the pointer and the
    cleanup request would retain a private orphan forever.
    """
    try:
        delete_v2_object(backend, key, root=PDF_UPLOAD_DIR)
        return
    except Exception as cleanup_error:
        try:
            cleanup_job = enqueue_storage_cleanup(db, (backend, key))
            cleanup_job.attempts = int(cleanup_job.attempts or 0) + 1
            cleanup_job.last_error = (
                f"{type(cleanup_error).__name__}: {cleanup_error}"
            )[:1000]
            db.add(cleanup_job)
            db.commit()
        except Exception:
            # A database outage can make even the durable fallback unavailable.
            # Roll back so callers never inherit a poisoned session; the
            # original saga exception is re-raised by the caller.
            db.rollback()


def _drain_cleanup_best_effort(db: Session) -> None:
    """Process a bounded cleanup slice without delaying the current request."""
    try:
        process_cleanup_jobs(
            db,
            root=PDF_UPLOAD_DIR,
            limit=REQUEST_CLEANUP_LIMIT,
        )
    except Exception:
        # Physical deletion is idempotent. If the cleanup-job commit failed,
        # rolling back retains the job and a later lifecycle request can retry.
        db.rollback()


def _idempotency_mismatch() -> HTTPException:
    """Return the stable API error for key reuse with another payload."""
    return HTTPException(
        status_code=409,
        detail={
            "code": "idempotency_payload_mismatch",
            "message": "Ten Idempotency-Key został już użyty z innym żądaniem.",
        },
    )


def _title_conflict() -> HTTPException:
    """Return the stable API error for a canonical per-owner title collision."""
    return HTTPException(
        status_code=409,
        detail={
            "code": "title_conflict",
            "message": "Dokument o tej nazwie już istnieje.",
        },
    )


def _revision_conflict(db: Session, pdf_id: int, expected_revision: int) -> HTTPException:
    """Build a conflict response from the committed revision after rollback."""
    current_revision = db.query(Pdf.revision).filter(Pdf.id == int(pdf_id)).scalar()
    return HTTPException(
        status_code=409,
        detail={
            "code": "document_conflict",
            "message": "Dokument został zmieniony w innej sesji.",
            "expected_revision": int(expected_revision),
            "current_revision": int(current_revision or 0),
        },
    )


def resolve_create_replay(
    db: Session,
    *,
    owner_id: int,
    pdf_data,
    idempotency_key: str | None,
) -> dict | None:
    """Return an existing create result or reject unsafe key reuse.

    Routes call this before project/template checks so retrying a committed
    request does not consume quota or fail after the user's plan has changed.
    The create service repeats it to close the gap for direct callers.
    """
    if idempotency_key is None:
        return None
    try:
        normalized_key = normalize_idempotency_key(idempotency_key)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_idempotency_key",
                "message": "Nagłówek Idempotency-Key jest nieprawidłowy.",
            },
        ) from exc
    request_hash = create_request_hash(pdf_data)
    existing = db.query(Pdf).filter(
        Pdf.owner_id == int(owner_id),
        Pdf.create_idempotency_key == normalized_key,
    ).first()
    if existing is None:
        return None
    if existing.create_request_hash != request_hash:
        raise _idempotency_mismatch()
    return {
        "created": "Utworzono plik PDF.",
        "pdf_id": int(existing.id),
        "revision": int(existing.revision or 1),
        "replayed": True,
    }


def _has_title_conflict(
    db: Session,
    *,
    owner_id: int,
    title_key: str,
    excluding_pdf_id: int | None = None,
) -> bool:
    """Check the named uniqueness rule without trusting display casing."""
    query = db.query(Pdf.id).filter(
        Pdf.owner_id == int(owner_id),
        Pdf.title_key == title_key,
    )
    if excluding_pdf_id is not None:
        query = query.filter(Pdf.id != int(excluding_pdf_id))
    return query.first() is not None


class _AtomicRevisionConflict(RuntimeError):
    """Internal marker converted to the public 409 after transaction rollback."""


_TRANSIENT_ELEMENT_FIELDS = frozenset({"deleted", "pdf_id", "resolvedLines", "title"})


def _element_persistence_snapshot(element) -> dict:
    """Return exactly the canvas fields represented by ``PdfElements`` rows.

    Browser line measurements and selection/deletion transport markers are not
    durable canvas state. Excluding them prevents a title edit from being
    misclassified as a render change merely because the client prepared a PDF
    export or sent an update tombstone field at its default value.
    """

    if hasattr(element, "model_dump"):
        payload = element.model_dump(
            mode="json",
            exclude=_TRANSIENT_ELEMENT_FIELDS,
        )
    else:
        payload = {
            key: value
            for key, value in dict(element).items()
            if key not in _TRANSIENT_ELEMENT_FIELDS
        }
    # VARCHAR is retained for historic width/height values. Normalize numeric
    # strings so a DB round trip does not turn an unchanged 100 into "100.0".
    for field in ("width", "height"):
        value = payload.get(field)
        if value is not None:
            try:
                payload[field] = float(value)
            except (TypeError, ValueError):
                payload[field] = str(value)
    return payload


def _is_title_only_update(db: Session, pdf_row, pdf_data) -> bool:
    """Prove that every persisted field except the display title is unchanged."""

    if pdf_data.pdf_title == pdf_row.title:
        return False
    try:
        storage_target = target_for_pdf(pdf_row, root=PDF_UPLOAD_DIR)
    except (FileNotFoundError, ValueError):
        return False
    # A legacy row must take the full render/publish saga on its first write,
    # even when the visible edit is only a rename. Otherwise the compatibility
    # dual-read pointer would survive indefinitely and skip the V2 backfill.
    if not storage_target.is_v2:
        return False
    rows = request_pdf_elements_by_element_id(db, int(pdf_row.id))
    persisted_elements = elements_from_rows(list(rows.values()))
    if [
        _element_persistence_snapshot(element) for element in pdf_data.root
    ] != [
        _element_persistence_snapshot(element) for element in persisted_elements
    ]:
        return False

    editor_mode = (
        "template"
        if getattr(pdf_data, "editor_mode", "freeform") == "template"
        else "freeform"
    )
    return all((
        int(pdf_data.pages or 1) == int(pdf_row.pages or 1),
        float(pdf_data.page_width or 595) == float(pdf_row.page_width or 595),
        float(pdf_data.page_height or 842) == float(pdf_row.page_height or 842),
        editor_mode == (pdf_row.editor_mode or "freeform"),
        current_template_id(editor_mode, getattr(pdf_data, "template_id", None))
        == pdf_row.template_id,
        serialize_spacing_px(getattr(pdf_data, "spacing_px", None))
        == pdf_row.spacing_px,
        getattr(pdf_data, "cv_data", None) == pdf_row.cv_data,
    ))


def _commit_title_only_update(
    db: Session,
    *,
    pdf_id: int,
    owner_id: int,
    expected_revision: int,
    title: str,
    title_key: str,
) -> dict:
    """Atomically rename a document without publishing or rotating PDF bytes."""

    next_revision = expected_revision + 1
    try:
        updated = db.query(Pdf).filter(
            Pdf.id == pdf_id,
            Pdf.owner_id == owner_id,
            Pdf.revision == expected_revision,
        ).update(
            {
                Pdf.title: title,
                Pdf.title_key: title_key,
                Pdf.updated_at: datetime.datetime.now(datetime.timezone.utc),
                Pdf.revision: next_revision,
            },
            synchronize_session=False,
        )
        if updated != 1:
            raise _AtomicRevisionConflict()
        db.commit()
    except Exception as exc:
        db.rollback()
        if isinstance(exc, _AtomicRevisionConflict):
            raise _revision_conflict(db, pdf_id, expected_revision) from exc
        if isinstance(exc, IntegrityError) and _has_title_conflict(
            db,
            owner_id=owner_id,
            title_key=title_key,
            excluding_pdf_id=pdf_id,
        ):
            raise _title_conflict() from exc
        raise
    return {
        "updated": "Pomyślnie zaktualizowano plik PDF.",
        "pdf_id": pdf_id,
        "revision": next_revision,
    }


def create_pdf_document(
    db: Session,
    *,
    user,
    username: str,
    pdf_data,
    idempotency_key: str | None = None,
) -> dict:
    """Render and persist one idempotent Storage V2 create saga."""
    elements = pdf_data.root
    title = pdf_data.pdf_title
    if not elements:
        raise HTTPException(status_code=400, detail="Brakuje części danych.")
    _require_starter_name(elements)

    replay = resolve_create_replay(
        db,
        owner_id=user.id,
        pdf_data=pdf_data,
        idempotency_key=idempotency_key,
    )
    if replay is not None:
        return replay
    normalized_key = (
        normalize_idempotency_key(idempotency_key)
        if idempotency_key is not None
        else None
    )
    request_hash = create_request_hash(pdf_data) if normalized_key is not None else None
    title_key = canonical_title_key(title)
    if _has_title_conflict(db, owner_id=user.id, title_key=title_key):
        raise _title_conflict()

    render_elements = getattr(pdf_data, "render_root", None) or elements
    pdf_bytes = _render_bytes(db, user=user, pdf_data=pdf_data, elements=render_elements)
    backend = configured_backend(USE_S3)
    key: str | None = None
    try:
        pdf_id = create_new_pdf(
            db,
            title,
            user.id,
            None,
            elements,
            pdf_data.pages,
            pdf_data.page_width,
            pdf_data.page_height,
            getattr(pdf_data, "editor_mode", "freeform"),
            getattr(pdf_data, "template_id", None),
            getattr(pdf_data, "spacing_px", None),
            cv_data=getattr(pdf_data, "cv_data", None),
            watermarked=False,
            source_import_id=getattr(pdf_data, "source_import_id", None),
            commit=False,
            origin_template_id=getattr(pdf_data, "template_id", None),
            create_idempotency_key=normalized_key,
            create_request_hash=request_hash,
            revision=1,
        )
        key = make_pdf_key(user.id, pdf_id)
        locator = put_pdf_bytes(
            backend,
            key,
            pdf_bytes,
            root=PDF_UPLOAD_DIR,
            owner_id=user.id,
            pdf_id=pdf_id,
        )
        pdf_row = request_pdf_by_id(db, pdf_id)
        pdf_row.storage_backend = backend
        pdf_row.storage_key = key
        pdf_row.file_path = locator
        db.add(pdf_row)
        db.commit()
    except Exception as exc:
        db.rollback()
        if key is not None:
            _compensate_v2_object(db, backend, key)
        if isinstance(exc, IntegrityError):
            replay = resolve_create_replay(
                db,
                owner_id=user.id,
                pdf_data=pdf_data,
                idempotency_key=normalized_key,
            )
            if replay is not None:
                return replay
            if _has_title_conflict(db, owner_id=user.id, title_key=title_key):
                raise _title_conflict() from exc
        raise
    _drain_cleanup_best_effort(db)
    return {
        "created": "Utworzono plik PDF.",
        "pdf_id": pdf_id,
        "revision": 1,
        "replayed": False,
    }


def update_pdf_document(db: Session, *, pdf_row, user, username: str, pdf_data) -> dict:
    """Publish bytes, then atomically claim the expected document revision.

    The new immutable object is compensation-deleted if another writer wins or
    the database transaction fails. Only the winning transaction queues the old
    object for cleanup, so a stale writer can never delete current bytes.
    """
    elements = pdf_data.root
    if not elements:
        raise HTTPException(status_code=400, detail="Brakuje części danych.")
    _require_starter_name(elements)
    pdf_id = int(pdf_row.id)
    owner_id = int(user.id)
    expected_revision = int(pdf_data.expected_revision)
    if int(pdf_row.revision or 1) != expected_revision:
        raise _revision_conflict(db, pdf_id, expected_revision)

    title_changed = pdf_data.pdf_title != pdf_row.title
    title_key = (
        canonical_title_key(pdf_data.pdf_title)
        if title_changed
        else (pdf_row.title_key or canonical_title_key(pdf_row.title))
    )
    if _has_title_conflict(
        db,
        owner_id=owner_id,
        title_key=title_key,
        excluding_pdf_id=pdf_id,
    ):
        raise _title_conflict()

    if _is_title_only_update(db, pdf_row, pdf_data):
        return _commit_title_only_update(
            db,
            pdf_id=pdf_id,
            owner_id=owner_id,
            expected_revision=expected_revision,
            title=pdf_data.pdf_title,
            title_key=title_key,
        )

    render_elements = getattr(pdf_data, "render_root", None) or elements
    pdf_bytes = _render_bytes(db, user=user, pdf_data=pdf_data, elements=render_elements)
    old_target = _safe_old_target(pdf_row, username=username)
    backend = configured_backend(USE_S3)
    key = make_pdf_key(owner_id, pdf_id)
    object_may_exist = False
    next_revision = expected_revision + 1
    incoming_template_id = getattr(pdf_data, "template_id", None)
    editor_mode = (
        "template"
        if getattr(pdf_data, "editor_mode", "freeform") == "template"
        else "freeform"
    )
    active_template_id = current_template_id(editor_mode, incoming_template_id)
    origin_template_id = (
        pdf_row.origin_template_id
        or pdf_row.template_id
        or incoming_template_id
    )
    try:
        # Treat an upload exception as ambiguous: S3 may have accepted the body
        # before the client lost the response, so the same compensation path is
        # required as for a later database failure.
        object_may_exist = True
        locator = put_pdf_bytes(
            backend,
            key,
            pdf_bytes,
            root=PDF_UPLOAD_DIR,
            owner_id=owner_id,
            pdf_id=pdf_id,
        )
        updated = db.query(Pdf).filter(
            Pdf.id == pdf_id,
            Pdf.owner_id == owner_id,
            Pdf.revision == expected_revision,
        ).update(
            {
                Pdf.title: pdf_data.pdf_title,
                Pdf.title_key: title_key,
                Pdf.pages: pdf_data.pages,
                Pdf.page_width: pdf_data.page_width,
                Pdf.page_height: pdf_data.page_height,
                Pdf.editor_mode: editor_mode,
                Pdf.template_id: active_template_id,
                Pdf.origin_template_id: origin_template_id,
                Pdf.spacing_px: serialize_spacing_px(getattr(pdf_data, "spacing_px", None)),
                Pdf.cv_data: getattr(pdf_data, "cv_data", None),
                Pdf.storage_backend: backend,
                Pdf.storage_key: key,
                Pdf.file_path: locator,
                Pdf.watermarked: False,
                Pdf.updated_at: datetime.datetime.now(datetime.timezone.utc),
                Pdf.revision: next_revision,
            },
            synchronize_session=False,
        )
        if updated != 1:
            raise _AtomicRevisionConflict()
        existing_by_id = request_pdf_elements_by_element_id(db, pdf_id)
        update_pdf_elements(
            db,
            elements,
            existing_by_id,
            pdf_id,
            owner_id=owner_id,
        )
        if old_target is not None and (old_target.backend, old_target.key) != (backend, key):
            _queue_old_target(db, old_target)
        db.commit()
    except Exception as exc:
        db.rollback()
        if object_may_exist:
            _compensate_v2_object(db, backend, key)
        if isinstance(exc, _AtomicRevisionConflict):
            raise _revision_conflict(db, pdf_id, expected_revision) from exc
        if isinstance(exc, IntegrityError) and _has_title_conflict(
            db,
            owner_id=owner_id,
            title_key=title_key,
            excluding_pdf_id=pdf_id,
        ):
            raise _title_conflict() from exc
        raise

    _drain_cleanup_best_effort(db)
    return {
        "updated": "Pomyślnie zaktualizowano plik PDF.",
        "pdf_id": pdf_id,
        "revision": next_revision,
    }


def save_pdf_elements_document(db: Session, *, pdf_row, user, pdf_data) -> dict:
    """Atomically autosave canvas rows and advance one expected revision."""
    pdf_id = int(pdf_row.id)
    owner_id = int(user.id)
    expected_revision = int(pdf_data.expected_revision)
    if int(pdf_row.revision or 1) != expected_revision:
        raise _revision_conflict(db, pdf_id, expected_revision)

    validate_and_resolve_image_elements(
        db,
        pdf_data.root,
        owner_id=owner_id,
        resolve_paths=False,
    )
    title_changed = pdf_data.pdf_title != pdf_row.title
    title_key = (
        canonical_title_key(pdf_data.pdf_title)
        if title_changed
        else (pdf_row.title_key or canonical_title_key(pdf_row.title))
    )
    if _has_title_conflict(
        db,
        owner_id=owner_id,
        title_key=title_key,
        excluding_pdf_id=pdf_id,
    ):
        raise _title_conflict()

    editor_mode = (
        "template"
        if getattr(pdf_data, "editor_mode", "freeform") == "template"
        else "freeform"
    )
    incoming_template_id = getattr(pdf_data, "template_id", None)
    next_revision = expected_revision + 1
    try:
        updated = db.query(Pdf).filter(
            Pdf.id == pdf_id,
            Pdf.owner_id == owner_id,
            Pdf.revision == expected_revision,
        ).update(
            {
                Pdf.title: pdf_data.pdf_title,
                Pdf.title_key: title_key,
                Pdf.pages: pdf_data.pages,
                Pdf.page_width: pdf_data.page_width,
                Pdf.page_height: pdf_data.page_height,
                Pdf.editor_mode: editor_mode,
                Pdf.template_id: current_template_id(editor_mode, incoming_template_id),
                Pdf.origin_template_id: (
                    pdf_row.origin_template_id
                    or pdf_row.template_id
                    or incoming_template_id
                ),
                Pdf.spacing_px: serialize_spacing_px(getattr(pdf_data, "spacing_px", None)),
                Pdf.cv_data: getattr(pdf_data, "cv_data", None),
                Pdf.updated_at: datetime.datetime.now(datetime.timezone.utc),
                Pdf.revision: next_revision,
            },
            synchronize_session=False,
        )
        if updated != 1:
            raise _AtomicRevisionConflict()
        existing_by_id = request_pdf_elements_by_element_id(db, pdf_id)
        update_pdf_elements(
            db,
            pdf_data.root,
            existing_by_id,
            pdf_id,
            owner_id=owner_id,
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        if isinstance(exc, _AtomicRevisionConflict):
            raise _revision_conflict(db, pdf_id, expected_revision) from exc
        if isinstance(exc, IntegrityError) and _has_title_conflict(
            db,
            owner_id=owner_id,
            title_key=title_key,
            excluding_pdf_id=pdf_id,
        ):
            raise _title_conflict() from exc
        raise
    return {"saved": True, "pdf_id": pdf_id, "revision": next_revision}


def render_pdf_for_download(
    db: Session,
    pdf_row,
    *,
    user=None,
    username: str | None = None,
) -> Pdf:
    """Rebuild a legacy watermarked PDF without overwriting a newer revision.

    Rendering happens outside the final compare-and-swap. The Storage V2
    pointer is published only while the row still has the revision whose
    elements were rendered. A concurrent autosave causes one bounded retry;
    a concurrent full update that already published clean bytes is returned
    immediately. Every losing object is compensation-deleted.
    """
    owner_id = int(user.id) if user is not None else int(pdf_row.owner_id)
    pdf_id = int(pdf_row.id)
    latest = pdf_row
    expected_revision = int(latest.revision or 1)

    for _attempt in range(2):
        if not bool(latest.watermarked):
            return latest
        expected_revision = int(latest.revision or 1)
        rows = request_pdf_elements_by_element_id(db, pdf_id)
        elements = elements_from_rows(list(rows.values()))
        render_data = SimpleNamespace(
            page_width=latest.page_width,
            page_height=latest.page_height,
            pdf_title=latest.title,
            pages=latest.pages or 1,
        )
        with TemporaryDirectory(prefix="cv-studio-render-") as temporary_image_dir:
            resolver = make_image_resolver(
                db,
                owner_id,
                elements,
                temporary_image_dir=temporary_image_dir,
            )
            pdf_bytes = build_pdf_to_buffer(
                render_data,
                elements,
                resolver,
                watermark=False,
            )

        old_target = _safe_old_target(latest, username=username)
        backend = configured_backend(USE_S3)
        key = make_pdf_key(owner_id, pdf_id)
        object_may_exist = False
        try:
            object_may_exist = True
            locator = put_pdf_bytes(
                backend,
                key,
                pdf_bytes,
                root=PDF_UPLOAD_DIR,
                owner_id=owner_id,
                pdf_id=pdf_id,
            )
            updated = db.query(Pdf).filter(
                Pdf.id == pdf_id,
                Pdf.owner_id == owner_id,
                Pdf.revision == expected_revision,
                Pdf.watermarked.is_(True),
            ).update(
                {
                    Pdf.storage_backend: backend,
                    Pdf.storage_key: key,
                    Pdf.file_path: locator,
                    Pdf.watermarked: False,
                },
                synchronize_session=False,
            )
            if updated != 1:
                raise _AtomicRevisionConflict()
            if old_target is not None and (old_target.backend, old_target.key) != (
                backend,
                key,
            ):
                _queue_old_target(db, old_target)
            db.commit()
        except Exception as exc:
            db.rollback()
            if object_may_exist:
                _compensate_v2_object(db, backend, key)
            if not isinstance(exc, _AtomicRevisionConflict):
                raise

            # Reload after rollback; the winning transaction is now the only
            # source of truth. Retry only when it changed elements but retained
            # the legacy watermark marker.
            db.expire_all()
            latest = request_pdf_by_id(db, pdf_id)
            if latest is None:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "code": "pdf_not_found",
                        "message": "Nie znaleziono pliku PDF.",
                    },
                ) from exc
            continue

        db.expire_all()
        latest = request_pdf_by_id(db, pdf_id)
        _drain_cleanup_best_effort(db)
        return latest

    raise _revision_conflict(db, pdf_id, expected_revision)


def read_pdf_document_bytes(pdf_row, *, username: str | None = None) -> bytes:
    """Dual-read V2 or a safely-contained legacy PDF for the download route."""
    return read_pdf_bytes(
        pdf_row,
        root=PDF_UPLOAD_DIR,
        legacy_owner_segment=username,
    )


def delete_pdf_document(db: Session, *, pdf_row, username: str | None = None) -> None:
    """Lock/CAS the latest pointer, then delete DB state and enqueue cleanup.

    The route's ownership lookup may be stale by the time deletion starts. A
    fresh row lock protects PostgreSQL, while the complete snapshot CAS also
    protects SQLite and any race that commits before the lock is acquired.
    """

    pdf_id = int(pdf_row.id)
    owner_id = int(pdf_row.owner_id)
    last_expected_revision = int(getattr(pdf_row, "revision", 1) or 1)
    # End the transaction opened by the route's preliminary ownership read so
    # the lock query observes a concurrently committed update.
    db.rollback()
    for _attempt in range(3):
        latest = (
            db.query(Pdf)
            .filter(Pdf.id == pdf_id, Pdf.owner_id == owner_id)
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )
        if latest is None:
            # Another authorized delete already completed this idempotent goal.
            db.rollback()
            return
        last_expected_revision = int(latest.revision or 1)
        target = _safe_old_target(latest, username=username)
        _cleanup_job_id, deleted = delete_pdf_by_id(
            db,
            pdf_id,
            owner_id=owner_id,
            expected_revision=last_expected_revision,
            expected_storage_backend=latest.storage_backend,
            expected_storage_key=latest.storage_key,
            expected_file_path=latest.file_path,
            cleanup_target=(
                (target.backend, target.key) if target is not None else None
            ),
            commit=False,
        )
        if deleted:
            try:
                db.commit()
            except Exception:
                db.rollback()
                raise
            _drain_cleanup_best_effort(db)
            return
        # The CAS lost after the SQLite no-op row lock. Restore elements and
        # retry from the newly committed pointer instead of orphaning it.
        db.rollback()
        db.expire_all()

    raise _revision_conflict(db, pdf_id, last_expected_revision)
