"""
Image upload, listing, and deletion for canvas assets.

Files are stored either under a per-user local directory or in S3 when
`USE_S3` is enabled. Database rows always record the resulting `file_path`
so PDF elements can reference images by `img_id`.

Deletion is ownership-checked (IDOR guard) and blocked while any PDF element
still references the image, so exports cannot lose their bitmap mid-document.
"""

from fastapi import APIRouter, Depends, UploadFile, HTTPException, Body
from sqlalchemy.orm import Session
from starlette import status
from app.core.config import IMAGES_UPLOAD_DIR, USE_S3
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.crud.images import create_image, request_image_by_id, request_images_by_user_id
from app.models.models import Image, Pdf, PdfElements
from app.dependencies import get_db
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
    """Persist an uploaded image for the authenticated user.

    Side effects: writes bytes to S3 or the local uploads directory, then
    inserts an `images` row. Filename collisions overwrite the object at the
    same key/path; the DB still gets a new row unless callers reuse ids.
    """
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)

    if USE_S3:
        key = f"uploads/{username}/{file.filename}"
        data = await file.read()
        file_path = s3_storage.upload_bytes(
            key, data, content_type=file.content_type or "application/octet-stream"
        )
    else:
        user_upload_dir = IMAGES_UPLOAD_DIR / username
        user_upload_dir.mkdir(parents=True, exist_ok=True)
        file_path_str = str(user_upload_dir / file.filename)
        data = await file.read()
        with open(file_path_str, "wb") as f:
            f.write(data)
        file_path = file_path_str

    create_image(db=db, image=file, owner_id=db_user.id, file_path=file_path)
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
