from fastapi import APIRouter, Depends, UploadFile, HTTPException, Body
from sqlalchemy.orm import Session
from starlette import status
from app.models.database import SessionLocal
from app.core.config import IMAGES_UPLOAD_DIR, USE_S3
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.crud.images import create_image, request_image_by_id, request_images_by_user_id
from app.models.models import Image, Pdf, PdfElements
import os

if USE_S3:
    from app.services import s3_storage

router = APIRouter(
    prefix="/images",
    tags=["images"]
)

def get_db():
    db = SessionLocal()  
    try:
        yield db  
    finally:
        db.close()  


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
        key = f"uploads/{username}/{file.filename}"
        data = await file.read()
        file_path = s3_storage.upload_bytes(
            key, data, content_type=file.content_type or "application/octet-stream"
        )
    
    else:
        #UPLOAD TO DIRECOTY WITH UNIQUE USERNAME
        user_upload_dir = IMAGES_UPLOAD_DIR / username
        #mkdir if not exist
        user_upload_dir.mkdir(parents=True, exist_ok=True)
        #the oath
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
    pdf_element = db.query(PdfElements).filter(PdfElements.img_id==img_id).first()

    if pdf_element is None:
        db.query(Image).filter(Image.id==img_id).delete()
        db.commit()
        
        try: 
            os.remove(image.file_path)
        except:
            FileNotFoundError: print(f"File '{image.file_path}' not found.")

        return {"deleted_image": img_id}

    else:
        pdf = db.query(Pdf).filter(Pdf.id==pdf_element.pdf_id).first()
        return {"message": f"Image is used in a created PDF. Please delete the PDF - {pdf.title} first (created at: {pdf.created_at}) to delete the image."}

