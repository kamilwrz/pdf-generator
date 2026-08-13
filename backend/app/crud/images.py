"""Image metadata CRUD for canvas uploads."""

from sqlalchemy.orm import Session
from app.models.models import Image
from datetime import datetime, timezone


def request_image_by_id(db: Session, id: int):
    """Return an Image row by primary key, or None."""
    return db.query(Image).filter(Image.id == id).first()


def request_images_by_user_id(db: Session, id: int):
    """Return every Image owned by the given user id."""
    return db.query(Image).filter(Image.owner_id == id).all()


def count_images_by_user_id(db: Session, id: int) -> int:
    """Return how many images the given user owns (for the upload quota gate)."""
    return db.query(Image).filter(Image.owner_id == id).count()


def create_image(
    db: Session,
    *,
    filename: str,
    file_size: int,
    file_path: str,
    mime_type: str,
    owner_id: int,
) -> Image:
    """Insert metadata for a file that was already written to disk or S3.

    The caller passes verified values explicitly rather than a raw upload:
    `mime_type` is the format detected from the bytes, `file_size` is the number
    of bytes actually stored, and `filename` is the original name kept for
    display only. `file_path` must already point at the stored object; this
    helper does not move bytes.

    Side effect: commits immediately. Returns the persisted row (with id).
    """
    db_image = Image(
        filename=filename,
        file_size=file_size,
        file_path=file_path,
        mime_type=mime_type,
        owner_id=owner_id,
        uploaded_at=datetime.now(timezone.utc),
    )

    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image
