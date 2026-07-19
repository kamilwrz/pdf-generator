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
    db:Session = Depends(get_db)):

    #username from JWT Token
    username = payload.get("sub")
    #this user row from table users
    db_user = get_user_by_username(db, username=username)

    #AWS request, with helper function from s3_storage
    if USE_S3:
        #CREATE A KEY (LIKE A PATH FOR S3_STORAGE)
        key = f"uploads/{username}/{file.filename}"
        #READ THE FILE
        data = await file.read()
        #RETURN THE PATH / URL IN THE S3_STORAGE FOR UPLOADING TO THE DATABASE
        file_path = s3_storage.upload_bytes(
            key, data, content_type=file.content_type or "application/octet-stream"
        )
    
    else:
        #UPLOAD TO DIRECOTY WITH UNIQUE USERNAME
        user_upload_dir = IMAGES_UPLOAD_DIR / username
        #mkdir if not exist
        user_upload_dir.mkdir(parents=True, exist_ok=True)
        #the Path
        file_path_str = str(user_upload_dir / file.filename)
        #read and write (create) the file
        data = await file.read()
        with open(file_path, "wb") as f:
            f.write(data)
        file_path = file_path_str
    #insert record to DB
    create_image(db=db, image=file, owner_id=db_user.id, file_path=file_path)
    return {"message": "Image upload was successfull!"}



@router.get("/fetch_images", status_code=status.HTTP_200_OK)
async def fetch_user_images(
    payload: dict = Depends(verify_token),
    db:Session = Depends(get_db)
    ):
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    images = request_images_by_user_id(db, db_user.id)

    if not images:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No images uploaded yet.",
        )
    return images

@router.delete("/delete_image", status_code=status.HTTP_202_ACCEPTED)
async def delete_user_image(
    payload: dict = Depends(verify_token),
    db:Session = Depends(get_db),
    img_id = Body()):

    image = request_image_by_id(db, img_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found.")
    # IDOR guard: only the owner may delete their image.
    db_user = get_user_by_username(db, username=payload.get("sub"))
    if db_user is None or image.owner_id != db_user.id:
        raise HTTPException(status_code=403, detail="This image does not belong to you.")
    pdf_element = db.query(PdfElements).filter(PdfElements.img_id==img_id).first()
    if pdf_element is not None:
        pdf_row = db.query(Pdf).filter(Pdf.id == pdf_element.pdf_id).first()
        return {
            "message": f"Image is used in a created PDF. Please delete the PDF - {pdf_row.title} first (created at: {pdf_row.created_at}) to delete the image."
        }
    db.query(Image).filter(Image.id==img_id).delete()
    db.commit()
    if USE_S3:
        key = s3_storage.key_from_file_path(image.file_path)
        if key:
            try:
                s3_storage.delete_object(key)
            except Exception:
                pass
    else:
        try: 
            os.remove(image.file_path)
        except FileNotFoundError:
            pass
    return {"deleted_image": img_id}


