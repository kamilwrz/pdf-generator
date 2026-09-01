"""Private PDF storage with immutable server-generated keys.

Storage V2 deliberately separates a document's display title from its physical
locator. Local files and S3 objects use the same logical key shape; ``file_path``
is dual-read only for rows created before the V2 migration.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import IMAGES_UPLOAD_DIR, PDF_UPLOAD_DIR
from app.models.models import StorageCleanupJob


LOCAL_BACKEND = "local"
S3_BACKEND = "s3"
PDF_RESOURCE = "pdf"
IMAGE_RESOURCE = "image"
PENDING_CLEANUP = "pending"
DEAD_LETTER_CLEANUP = "dead_letter"
MAX_CLEANUP_ATTEMPTS = 8
REQUEST_CLEANUP_LIMIT = 10
_BACKENDS = frozenset({LOCAL_BACKEND, S3_BACKEND})
_STORAGE_KEY_RE = re.compile(
    r"^pdfs/(?P<owner_id>[1-9]\d*)/(?P<pdf_id>[1-9]\d*)/"
    r"(?P<object_id>[0-9a-f]{32})\.pdf$"
)


class UnsafeStorageLocator(ValueError):
    """Raised when a DB locator escapes its configured private storage root."""


@dataclass(frozen=True)
class StorageTarget:
    """Validated backend/key pair used for reads and cleanup."""

    backend: str
    key: str
    is_v2: bool


def configured_backend(use_s3: bool) -> str:
    """Return the persisted backend label for the active deployment mode."""
    return S3_BACKEND if use_s3 else LOCAL_BACKEND


def make_pdf_key(owner_id: int, pdf_id: int) -> str:
    """Create an unguessable V2 key without using username or document title."""
    if int(owner_id) <= 0 or int(pdf_id) <= 0:
        raise ValueError("Storage keys require persisted positive owner and PDF ids.")
    return f"pdfs/{int(owner_id)}/{int(pdf_id)}/{uuid4().hex}.pdf"


def validate_pdf_key(
    key: str,
    *,
    owner_id: int | None = None,
    pdf_id: int | None = None,
) -> str:
    """Validate the exact V2 key grammar and optional row ownership binding."""
    normalized = str(key or "")
    if "\\" in normalized:
        raise UnsafeStorageLocator("Invalid PDF storage key.")
    match = _STORAGE_KEY_RE.fullmatch(normalized)
    if match is None:
        raise UnsafeStorageLocator("Invalid PDF storage key.")
    if owner_id is not None and int(match.group("owner_id")) != int(owner_id):
        raise UnsafeStorageLocator("PDF storage key owner does not match the row.")
    if pdf_id is not None and int(match.group("pdf_id")) != int(pdf_id):
        raise UnsafeStorageLocator("PDF storage key id does not match the row.")
    return normalized


def _contained_path(root: Path, relative_key: str) -> Path:
    """Resolve a relative key and prove that it remains below ``root``."""
    root_path = Path(root).resolve()
    candidate = (root_path / relative_key).resolve()
    try:
        candidate.relative_to(root_path)
    except ValueError as exc:
        raise UnsafeStorageLocator("PDF path escapes the private storage root.") from exc
    return candidate


def local_path_for_key(
    key: str,
    *,
    root: Path = PDF_UPLOAD_DIR,
    owner_id: int | None = None,
    pdf_id: int | None = None,
) -> Path:
    """Return the contained local path for a validated V2 key."""
    normalized = validate_pdf_key(key, owner_id=owner_id, pdf_id=pdf_id)
    return _contained_path(root, normalized)


def put_pdf_bytes(
    backend: str,
    key: str,
    body: bytes,
    *,
    root: Path = PDF_UPLOAD_DIR,
    owner_id: int | None = None,
    pdf_id: int | None = None,
) -> str:
    """Atomically publish bytes and return a legacy-compatible server locator."""
    normalized = validate_pdf_key(key, owner_id=owner_id, pdf_id=pdf_id)
    if backend == S3_BACKEND:
        from app.services import s3_storage

        return s3_storage.upload_bytes(
            normalized,
            body,
            content_type="application/pdf",
        )
    if backend != LOCAL_BACKEND:
        raise UnsafeStorageLocator("Unsupported PDF storage backend.")

    destination = local_path_for_key(
        normalized,
        root=root,
        owner_id=owner_id,
        pdf_id=pdf_id,
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("wb") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
    return str(destination)


def _safe_legacy_owner_segment(value: str | None) -> str | None:
    """Accept a historic username directory only when it is one path segment."""
    segment = str(value or "")
    if not segment or segment in {".", ".."}:
        return None
    if "/" in segment or "\\" in segment or "\x00" in segment:
        return None
    return segment


def _legacy_local_key(
    locator: str,
    *,
    root: Path,
    owner_segment: str | None,
) -> str:
    """Convert a historic local locator to a contained root-relative key."""
    root_path = Path(root).resolve()
    raw = Path(str(locator))
    candidate = raw.resolve() if raw.is_absolute() else raw.resolve()
    try:
        relative = candidate.relative_to(root_path)
    except ValueError as exc:
        raise UnsafeStorageLocator("Legacy PDF path escapes the private storage root.") from exc

    safe_owner = _safe_legacy_owner_segment(owner_segment)
    if owner_segment is not None and safe_owner is None:
        raise UnsafeStorageLocator("Legacy PDF owner directory is unsafe.")
    if safe_owner is not None:
        owner_root = (root_path / safe_owner).resolve()
        try:
            candidate.relative_to(owner_root)
        except ValueError as exc:
            raise UnsafeStorageLocator(
                "Legacy PDF path does not belong to the authenticated user."
            ) from exc
    return relative.as_posix()


def _legacy_s3_key(locator: str, *, owner_segment: str | None) -> str:
    """Extract an owner-bound private PDF key from a historic S3 locator."""
    parsed = urlparse(str(locator))
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname.endswith(".amazonaws.com"):
        raise UnsafeStorageLocator("Legacy S3 locator is not an AWS HTTPS URL.")
    key = unquote(parsed.path.lstrip("/"))
    segments = key.split("/")
    if (
        len(segments) < 3
        or segments[0] != "pdfs"
        or any(segment in {"", ".", ".."} for segment in segments)
        or "\\" in key
        or "\x00" in key
    ):
        raise UnsafeStorageLocator("Legacy S3 locator is outside the PDF prefix.")
    safe_owner = _safe_legacy_owner_segment(owner_segment)
    if owner_segment is not None and safe_owner is None:
        raise UnsafeStorageLocator("Legacy PDF owner directory is unsafe.")
    if safe_owner is not None and segments[1] != safe_owner:
        raise UnsafeStorageLocator("Legacy PDF key does not belong to the authenticated user.")
    return key


def target_for_pdf(
    pdf_row,
    *,
    root: Path = PDF_UPLOAD_DIR,
    legacy_owner_segment: str | None = None,
) -> StorageTarget:
    """Resolve a V2 pointer or safely fall back to the historic ``file_path``."""
    backend = getattr(pdf_row, "storage_backend", None)
    key = getattr(pdf_row, "storage_key", None)
    if backend or key:
        if backend not in _BACKENDS or not key:
            raise UnsafeStorageLocator("Incomplete PDF Storage V2 pointer.")
        normalized = validate_pdf_key(
            key,
            owner_id=getattr(pdf_row, "owner_id", None),
            pdf_id=getattr(pdf_row, "id", None),
        )
        return StorageTarget(backend=backend, key=normalized, is_v2=True)

    locator = str(getattr(pdf_row, "file_path", None) or "")
    if not locator:
        raise FileNotFoundError("PDF has no storage locator.")
    if locator.startswith("https://"):
        return StorageTarget(
            backend=S3_BACKEND,
            key=_legacy_s3_key(locator, owner_segment=legacy_owner_segment),
            is_v2=False,
        )
    return StorageTarget(
        backend=LOCAL_BACKEND,
        key=_legacy_local_key(
            locator,
            root=root,
            owner_segment=legacy_owner_segment,
        ),
        is_v2=False,
    )


def read_pdf_bytes(
    pdf_row,
    *,
    root: Path = PDF_UPLOAD_DIR,
    legacy_owner_segment: str | None = None,
) -> bytes:
    """Read V2 or safely-contained legacy bytes without exposing the locator."""
    target = target_for_pdf(
        pdf_row,
        root=root,
        legacy_owner_segment=legacy_owner_segment,
    )
    if target.backend == S3_BACKEND:
        from app.services import s3_storage

        try:
            return s3_storage.download_bytes(target.key)
        except Exception as exc:
            # Keep provider-specific exceptions inside the storage boundary.
            # The API maps this generic read failure without exposing bucket
            # names, keys, credentials, or SDK diagnostics to the caller.
            raise OSError("Could not read the private PDF object.") from exc
    path = (
        local_path_for_key(
            target.key,
            root=root,
            owner_id=getattr(pdf_row, "owner_id", None),
            pdf_id=getattr(pdf_row, "id", None),
        )
        if target.is_v2
        else _contained_path(root, target.key)
    )
    return path.read_bytes()


def delete_storage_target(
    target: StorageTarget,
    *,
    root: Path = PDF_UPLOAD_DIR,
) -> None:
    """Delete one validated target; missing local files count as success."""
    if target.backend == S3_BACKEND:
        from app.services import s3_storage

        s3_storage.delete_object(target.key)
        return
    if target.backend != LOCAL_BACKEND:
        raise UnsafeStorageLocator("Unsupported cleanup backend.")
    path = (
        local_path_for_key(target.key, root=root)
        if target.is_v2
        else _contained_path(root, target.key)
    )
    path.unlink(missing_ok=True)


def delete_v2_object(
    backend: str,
    key: str,
    *,
    root: Path = PDF_UPLOAD_DIR,
) -> None:
    """Compensate a failed DB transaction by deleting its newly written object."""
    normalized = validate_pdf_key(key)
    delete_storage_target(
        StorageTarget(backend=backend, key=normalized, is_v2=True),
        root=root,
    )


def process_cleanup_jobs(
    db: Session,
    *,
    job_ids: list[int] | None = None,
    root: Path = PDF_UPLOAD_DIR,
    image_root: Path = IMAGES_UPLOAD_DIR,
    limit: int | None = None,
) -> int:
    """Best-effort drain durable cleanup jobs with a finite retry policy.

    Returns the number of jobs attempted. The scheduled worker passes a bound
    so one large backlog cannot exceed its cron execution window; request-time
    drains use a small fixed bound. After ``MAX_CLEANUP_ATTEMPTS`` a failed row
    becomes a retained dead letter so an irrecoverable locator cannot consume
    worker capacity forever.
    """
    now = datetime.now(timezone.utc)
    query = db.query(StorageCleanupJob).filter(
        StorageCleanupJob.status == PENDING_CLEANUP,
    )
    if job_ids is not None:
        if not job_ids:
            return 0
        query = query.filter(StorageCleanupJob.id.in_(job_ids))
    else:
        # Apply the retry schedule before LIMIT. Filtering future retries in
        # Python would let a full first page of backed-off rows permanently
        # starve every newer cleanup job behind it.
        query = query.filter(
            or_(
                StorageCleanupJob.next_attempt_at.is_(None),
                StorageCleanupJob.next_attempt_at <= now,
            ),
        )
    query = query.order_by(StorageCleanupJob.id)
    if limit is not None:
        query = query.limit(max(1, int(limit)))
    jobs = query.all()
    attempted = 0
    for job in jobs:
        if int(job.attempts or 0) >= MAX_CLEANUP_ATTEMPTS:
            job.status = DEAD_LETTER_CLEANUP
            job.next_attempt_at = None
            job.terminal_at = now
            db.add(job)
            continue
        attempted += 1
        try:
            resource_kind = str(job.resource_kind or PDF_RESOURCE)
            if resource_kind == IMAGE_RESOURCE:
                from app.services.image_storage import delete_image_object

                delete_image_object(
                    job.storage_backend,
                    job.storage_key,
                    root=image_root,
                )
            elif resource_kind == PDF_RESOURCE:
                is_v2 = _STORAGE_KEY_RE.fullmatch(str(job.storage_key)) is not None
                delete_storage_target(
                    StorageTarget(
                        backend=job.storage_backend,
                        key=job.storage_key,
                        is_v2=is_v2,
                    ),
                    root=root,
                )
            else:
                raise UnsafeStorageLocator("Unsupported cleanup resource kind.")
            db.delete(job)
        except Exception as exc:
            job.attempts = int(job.attempts or 0) + 1
            job.last_error = f"{type(exc).__name__}: {exc}"[:1000]
            if job.attempts >= MAX_CLEANUP_ATTEMPTS:
                job.status = DEAD_LETTER_CLEANUP
                job.next_attempt_at = None
                job.terminal_at = now
            else:
                delay = min(3600, 30 * (2 ** min(job.attempts - 1, 7)))
                job.next_attempt_at = now + timedelta(seconds=delay)
            db.add(job)
    db.commit()
    return attempted
