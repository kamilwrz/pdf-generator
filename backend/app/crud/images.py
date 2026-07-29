"""Image metadata CRUD for canvas uploads."""

from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.models.models import Image
from datetime import datetime, timezone


def request_image_by_id(db: Session, id: int):
    """Return an Image row by primary key, or None."""
    return db.query(Image).filter(Image.id == id).first()


def request_images_by_user_id(db: Session, id: int):
    """Return every Image owned by the given user id."""
    return db.query(Image).filter(Image.owner_id == id).all()


def create_image(db: Session, image: UploadFile, owner_id: int, file_path: str) -> None:
    """Insert metadata for a file that was already written to disk or S3.

    Side effect: commits immediately. `file_path` must already point at the
    stored object; this helper does not move bytes.
    """
    db_image = Image(
        filename=image.filename,
        file_size=image.size,
        file_path=file_path,
        mime_type=image.content_type,
        owner_id=owner_id,
        uploaded_at=datetime.now(timezone.utc),
    )

    db.add(db_image)
    db.commit()
