"""
Image upload, listing, and deletion for canvas assets.

Files are stored either under a per-user local directory or in S3 when
`USE_S3` is enabled. Database rows always record the resulting `file_path`
so PDF elements can reference images by `img_id`.

Uploads pass through the trust boundary in `app.utils.upload_security`: the
real image format is verified from the file's bytes (not the client-declared
type), the stored name is server-generated (blocking path traversal), the body
is size-capped (bounding memory use), and a per-user count guards against
storage abuse.

Deletion is ownership-checked (IDOR guard) and blocked while any PDF element
still references the image, so exports cannot lose their bitmap mid-document.
"""

from fastapi import APIRouter, Depends, UploadFile, HTTPException, Body
from sqlalchemy.orm import Session
from starlette import status
from app.core.config import (
    IMAGES_UPLOAD_DIR,
    USE_S3,
    MAX_UPLOAD_BYTES,
    MAX_IMAGES_PER_USER,
)
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.crud.images import (
    create_image,
    request_image_by_id,
    request_images_by_user_id,
    count_images_by_user_id,
)
from app.models.models import Image, Pdf, PdfElements
from app.dependencies import get_db
from app.utils.upload_security import (
    IMAGE_SNIFF_BYTES,
    sniff_image_type,
    safe_object_name,
    is_safe_path_segment,
)
import os

if USE_S3:
    from app.services import s3_storage

router = APIRouter(
    prefix="/images",
    tags=["images"]
)


@router.post("/upload_image")
async def create_upload_image(
    file: UploadFile,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Validate and persist an uploaded image for the authenticated user.

    The upload is trusted only after four checks, in order: the caller owns an
    account, the per-user image count is under the limit, the body is within the
    size cap, and the bytes match a supported raster format. The stored object
    name is server-generated, so the client-supplied filename can never reach a
    filesystem path or S3 key.

    Side effects: writes bytes to S3 or the local uploads directory, then
    inserts an `images` row (original filename kept for display only).

    @raises HTTPException 401 - No account matches the authenticated username.
    @raises HTTPException 403 - The per-user image limit is reached.
    @raises HTTPException 413 - The upload exceeds ``MAX_UPLOAD_BYTES``.
    @raises HTTPException 400 - The upload is empty or the username is unsafe.
    @raises HTTPException 415 - The bytes are not a supported raster image.
    """
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")

    # `username` comes from the JWT and is not format-validated at registration,
    # so it must be treated as untrusted before it becomes a path/key segment.
    if not is_safe_path_segment(username):
        raise HTTPException(status_code=400, detail="Nieprawidłowa nazwa użytkownika.")

    # Coarse anti-abuse guard: cap the number of stored images per account.
    if count_images_by_user_id(db, db_user.id) >= MAX_IMAGES_PER_USER:
        raise HTTPException(
            status_code=403,
            detail=f"Osiągnięto limit {MAX_IMAGES_PER_USER} obrazów. Usuń nieużywane obrazy, aby dodać nowe.",
        )

    # Read at most one byte past the limit so an oversized body is detected
    # without ever loading the whole payload into memory.
    data = await file.read(MAX_UPLOAD_BYTES + 1)
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
    # payloads disguised as images, which would otherwise be served back from
    # the /uploads mount and execute as stored XSS.
    sniffed = sniff_image_type(data[:IMAGE_SNIFF_BYTES])
    if sniffed is None:
        raise HTTPException(
            status_code=415,
            detail="Nieobsługiwany format pliku. Dozwolone są obrazy PNG, JPEG, WEBP lub GIF.",
        )
    mime_type, extension = sniffed
    object_name = safe_object_name(extension)

    if USE_S3:
        key = f"uploads/{username}/{object_name}"
        file_path = s3_storage.upload_bytes(key, data, content_type=mime_type)
    else:
        user_upload_dir = IMAGES_UPLOAD_DIR / username
        user_upload_dir.mkdir(parents=True, exist_ok=True)
        # Stored path stays relative so the frontend can build the /uploads URL
        # as `${API_BASE}/${file_path}` (see Gallery.jsx and image_src_to_path).
        file_path_str = str(user_upload_dir / object_name)
        with open(file_path_str, "wb") as f:
            f.write(data)
        file_path = file_path_str

    # Keep the original name (basename only) for display; it is never used to
    # locate the object on disk or in S3.
    display_name = os.path.basename(file.filename or object_name)[:255]
    create_image(
        db=db,
        filename=display_name,
        file_size=len(data),
        file_path=file_path,
        mime_type=mime_type,
        owner_id=db_user.id,
    )
    return {"message": "Obraz został pomyślnie przesłany."}


@router.get("/fetch_images", status_code=status.HTTP_200_OK)
async def fetch_user_images(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List images owned by the caller, or 404 when the library is empty."""
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    images = request_images_by_user_id(db, db_user.id)

    if not images:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nie przesłano jeszcze żadnych obrazów.",
        )
    return images


@router.delete("/delete_image", status_code=status.HTTP_202_ACCEPTED)
async def delete_user_image(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    img_id=Body(),
):
    """Delete an owned image when no PDF element still references it.

    Returns a Polish guidance message (without deleting) when the image is
    still used by a document. Storage cleanup best-effort ignores missing
    files so stale DB rows can still be removed.
    """
    image = request_image_by_id(db, img_id)
    if not image:
        raise HTTPException(status_code=404, detail="Nie znaleziono obrazu.")
    # IDOR guard: only the owner may delete their image.
    db_user = get_user_by_username(db, username=payload.get("sub"))
    if db_user is None or image.owner_id != db_user.id:
        raise HTTPException(status_code=403, detail="Ten obraz nie należy do Ciebie.")
    pdf_element = db.query(PdfElements).filter(PdfElements.img_id == img_id).first()
    if pdf_element is not None:
        pdf_row = db.query(Pdf).filter(Pdf.id == pdf_element.pdf_id).first()
        return {
            "message": (
                f"Obraz jest używany w utworzonym pliku PDF. Aby usunąć obraz, najpierw "
                f"usuń plik PDF „{pdf_row.title}” (utworzony: {pdf_row.created_at})."
            )
        }
    db.query(Image).filter(Image.id == img_id).delete()
    db.commit()
    if USE_S3:
        key = s3_storage.key_from_file_path(image.file_path)
        if key:
            try:
                s3_storage.delete_object(key)
            except Exception:
                # DB row is already gone; orphaned S3 objects are cleaned operationally.
                pass
    else:
        try:
            os.remove(image.file_path)
        except FileNotFoundError:
            pass
    return {"deleted_image": img_id}
