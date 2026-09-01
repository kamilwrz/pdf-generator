"""
Image upload, listing, and deletion for canvas assets.

Files are stored under immutable server-generated owner-id keys, either in the
private local image root or in S3 when `USE_S3` is enabled. Database rows record
the server-side locator so PDF elements can reference images by `img_id`.

Uploads pass through the trust boundary in `app.utils.upload_security`: the
real image format is verified from bytes (not the client-declared type), the
object key is server-generated (blocking traversal), the body is size-capped,
and a per-user count guards against storage abuse. Publication is a saga: a DB
failure compensation-deletes the new object, while failed cleanup is retained
in the durable private-storage outbox.

Deletion is ownership-checked (IDOR guard) and blocked while any PDF element
still references the image, so exports cannot lose their bitmap mid-document.
"""

from fastapi import APIRouter, Depends, UploadFile, HTTPException, Body
from fastapi.responses import FileResponse, Response
from sqlalchemy import exists
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette import status
from app.core.config import (
    IMAGES_UPLOAD_DIR,
    USE_S3,
    MAX_UPLOAD_BYTES,
    MAX_IMAGES_PER_USER,
)
from app.core.security import resolve_user_from_payload, verify_token
from app.crud.images import (
    create_image,
    reconcile_image_slots,
    request_owned_image,
    request_images_by_user_id,
    reserve_image_slot,
)
from app.crud.pdfs import enqueue_storage_cleanup
from app.models.models import Image, PdfElements
from app.dependencies import get_db
from app.services.image_storage import (
    S3_BACKEND,
    configured_backend,
    delete_image_object,
    local_path_for_target,
    make_image_key,
    put_image_bytes,
    target_for_image,
)
from app.services.pdf_storage import IMAGE_RESOURCE, process_cleanup_jobs
from app.utils.upload_security import (
    IMAGE_SNIFF_BYTES,
    sniff_image_type,
)
import os

router = APIRouter(
    prefix="/images",
    tags=["images"]
)


def _image_in_use_response() -> dict[str, str]:
    """Return one non-enumerating response for any persisted image reference."""

    return {
        "message": (
            "Obraz jest używany w zapisanym dokumencie. Usuń go najpierw "
            "z dokumentu, a następnie ponów próbę."
        )
    }


@router.post("/upload_image")
def create_upload_image(
    file: UploadFile,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Validate and persist an uploaded image for the authenticated user.

    The upload is trusted only after four checks, in order: the caller owns an
    account, the body is within the size cap, the bytes match a supported raster
    format, and an atomic per-user slot is reserved. The stored object
    name is server-generated, so the client-supplied filename can never reach a
    filesystem path or S3 key.

    Side effects: publishes immutable bytes, then commits the `images` row
    (original filename kept for display only). A metadata failure removes the
    new object or records durable compensation when storage is unavailable.

    @raises HTTPException 401 - No account matches the authenticated username.
    @raises HTTPException 403 - The per-user profile-photo library is full.
    @raises HTTPException 413 - The upload exceeds ``MAX_UPLOAD_BYTES``.
    @raises HTTPException 400 - The upload is empty or the username is unsafe.
    @raises HTTPException 415 - The bytes are not a supported raster image.
    """
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    owner_id = int(db_user.id)
    # End the authentication lookup transaction before the atomic write. This
    # avoids SQLite read-to-write lock upgrades while retaining PostgreSQL's
    # normal per-row update serialization.
    db.rollback()

    # Read at most one byte past the limit so an oversized body is detected
    # without ever loading the whole payload into memory.
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        max_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Plik jest za duży. Maksymalny rozmiar to {max_mb} MB.",
        )
    if not data:
        raise HTTPException(status_code=400, detail="Przesłany plik jest pusty.")

    # Trust the bytes, not the client: derive the real format (and therefore the
    # stored extension and MIME) from the file signature. This rejects HTML/SVG
    # payloads disguised as images. Bytes are only served through the ownership-
    # checked `/images/{id}/content` route (the public `/uploads` mount is gone).
    sniffed = sniff_image_type(data[:IMAGE_SNIFF_BYTES])
    if sniffed is None:
        raise HTTPException(
            status_code=415,
            detail="Nieobsługiwany format pliku. Dozwolone są obrazy PNG, JPEG, WEBP lub GIF.",
        )
    mime_type, extension = sniffed
    # Reserve immediately before storage publication. The conditional UPDATE
    # remains uncommitted until the Image row commits, so every validation,
    # provider, or metadata failure releases the slot through the saga rollback.
    if not reserve_image_slot(
        db,
        owner_id=owner_id,
        limit=MAX_IMAGES_PER_USER,
    ):
        db.rollback()
        raise HTTPException(
            status_code=403,
            detail=(
                f"Osiągnięto limit {MAX_IMAGES_PER_USER} zdjęć profilowych. "
                "Usuń jedno lub więcej zdjęć w galerii, aby dodać nowe."
            ),
        )
    backend = configured_backend(USE_S3)
    key = make_image_key(owner_id, extension)

    # Keep the original name (basename only) for display; it is never used to
    # locate the object on disk or in S3.
    display_name = os.path.basename(file.filename or key.rsplit("/", 1)[-1])[:255]
    object_may_exist = False
    try:
        # S3 may accept a body before the client sees an error, so every put is
        # treated as ambiguous until the metadata transaction commits.
        object_may_exist = True
        file_path = put_image_bytes(
            backend,
            key,
            data,
            content_type=mime_type,
            root=IMAGES_UPLOAD_DIR,
            owner_id=owner_id,
        )
        row = create_image(
            db=db,
            filename=display_name,
            file_size=len(data),
            file_path=file_path,
            mime_type=mime_type,
            owner_id=owner_id,
            commit=False,
        )
        response_payload = {
            "id": row.id,
            "filename": row.filename,
            "mime_type": row.mime_type,
            "message": "Zdjęcie profilowe zostało pomyślnie przesłane.",
        }
        db.commit()
    except Exception as storage_or_database_error:
        db.rollback()
        if object_may_exist:
            try:
                delete_image_object(backend, key, root=IMAGES_UPLOAD_DIR)
            except Exception as cleanup_error:
                # Retain a durable compensation request when storage deletion
                # fails after the image row transaction has rolled back.
                try:
                    cleanup_job = enqueue_storage_cleanup(
                        db,
                        (backend, key),
                        resource_kind=IMAGE_RESOURCE,
                    )
                    cleanup_job.attempts = int(cleanup_job.attempts or 0) + 1
                    cleanup_job.last_error = f"{type(cleanup_error).__name__}"[:1000]
                    db.add(cleanup_job)
                    db.commit()
                except Exception:
                    db.rollback()
        raise storage_or_database_error
    # Return the new row id so the gallery can fill a slot immediately without
    # waiting for a full library refetch.
    return response_payload


@router.get("/fetch_images", status_code=status.HTTP_200_OK)
def fetch_user_images(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List profile photos owned by the caller (empty list when none yet)."""
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    return [
        {
            "id": image.id,
            "filename": image.filename,
            "file_size": image.file_size,
            "mime_type": image.mime_type,
            "uploaded_at": image.uploaded_at,
        }
        for image in request_images_by_user_id(db, db_user.id)
    ]


@router.get("/{img_id}/content")
def get_image_content(
    img_id: int,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Stream image bytes for an owned library row.

    Replaces the former public ``/uploads`` StaticFiles mount. The gallery and
    canvas fetch this URL with a Bearer token; ReportLab resolves the same path
    pattern via ``document_service.resolve_image_src_for_pdf``.
    """
    db_user = resolve_user_from_payload(db, payload)
    image = request_owned_image(db, image_id=img_id, owner_id=db_user.id) if db_user else None
    if image is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "image_not_found", "message": "Nie znaleziono obrazu."},
        )

    media_type = image.mime_type or "application/octet-stream"
    try:
        target = target_for_image(image, root=IMAGES_UPLOAD_DIR)
        if target.backend == S3_BACKEND:
            from app.services import s3_storage

            return Response(
                content=s3_storage.download_bytes(target.key),
                media_type=media_type,
            )
        path = local_path_for_target(target, root=IMAGES_UPLOAD_DIR)
    except Exception:
        raise HTTPException(status_code=404, detail="Nie znaleziono pliku obrazu.")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Nie znaleziono pliku obrazu.")
    return FileResponse(path, media_type=media_type)


@router.delete("/delete_image", status_code=status.HTTP_202_ACCEPTED)
def delete_user_image(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    img_id=Body(),
):
    """Delete an owned image when no PDF element still references it.

    Returns non-enumerating Polish guidance when any document still references
    the image. Otherwise the row deletion and cleanup job commit atomically;
    physical deletion is idempotent and retried by the bounded worker.
    """
    db_user = resolve_user_from_payload(db, payload)
    owner_id = int(db_user.id) if db_user is not None else None
    # End the authentication read before acquiring the owner-scoped image lock.
    # PostgreSQL then serializes this delete against FK key-share locks, while
    # SQLite relies on the conditional delete plus its database write lock.
    db.rollback()
    image = (
        db.query(Image)
        .filter(Image.id == img_id, Image.owner_id == owner_id)
        .populate_existing()
        .with_for_update()
        .one_or_none()
        if owner_id is not None
        else None
    )
    if image is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "image_not_found", "message": "Nie znaleziono obrazu."},
        )
    try:
        target = target_for_image(image, root=IMAGES_UPLOAD_DIR)
        is_sqlite = db.get_bind().dialect.name == "sqlite"
        if is_sqlite:
            # SQLite has no row-level FOR UPDATE. End the locator-read snapshot
            # so the conditional DELETE below is the transaction's first write
            # and observes every canvas reference committed before it.
            db.rollback()
        else:
            referenced = db.query(PdfElements.id).filter(
                PdfElements.img_id == img_id
            ).first()
            if referenced is not None:
                # Do not include a document title or timestamp. Historic/corrupt
                # rows could reference an image across owners.
                db.rollback()
                return _image_in_use_response()

        # Recheck in the DELETE statement itself. On SQLite, a canvas write
        # committed after the earlier friendly check makes this CAS affect zero
        # rows. If it starts after this statement, the writer lock and enforced
        # FK make its insert fail instead of creating an orphan reference.
        referenced_now = exists().where(PdfElements.img_id == Image.id)
        deleted = db.query(Image).filter(
            Image.id == img_id,
            Image.owner_id == owner_id,
            ~referenced_now,
        ).delete(synchronize_session=False)
        if deleted != 1:
            db.rollback()
            current = request_owned_image(
                db,
                image_id=img_id,
                owner_id=owner_id,
            )
            if current is not None:
                db.rollback()
                return _image_in_use_response()
            raise LookupError("Owned image disappeared before deletion committed.")
        cleanup_job = enqueue_storage_cleanup(
            db,
            (target.backend, target.key),
            resource_kind=IMAGE_RESOURCE,
        )
        cleanup_job_id = int(cleanup_job.id)
        reconcile_image_slots(db, owner_id=owner_id)
        db.commit()
    except IntegrityError:
        # A PostgreSQL FK insert may have acquired its key-share lock just before
        # this transaction's row lock. Keep the image/outbox transaction intact
        # and return the same non-enumerating in-use response.
        db.rollback()
        return _image_in_use_response()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail={
                "code": "image_delete_failed",
                "message": "Nie udało się bezpiecznie usunąć obrazu.",
            },
        )
    try:
        process_cleanup_jobs(
            db,
            job_ids=[cleanup_job_id],
            image_root=IMAGES_UPLOAD_DIR,
        )
    except Exception:
        # The committed outbox row remains the source of truth for the bounded
        # scheduled retry worker.
        db.rollback()
    return {"deleted_image": img_id}
