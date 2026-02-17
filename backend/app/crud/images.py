from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.models.models import Image
from datetime import datetime, timezone

def request_image_by_id(db:Session, id: int):
    return db.query(Image).filter(Image.id == id).first()

def request_images_by_user_id(db: Session, id:int):
    return db.query(Image).filter(Image.owner_id==id).all()

def create_image(db:Session, image: UploadFile, owner_id: int, file_path: str):
    db_image = Image(
        filename = image.filename,
        file_size = image.size,
        file_path = file_path,
        mime_type = image.content_type,
        owner_id = owner_id,
        uploaded_at = datetime.now(timezone.utc)
    )

    db.add(db_image)
    db.commit()
    