"""Image metadata CRUD and atomic per-owner upload-slot accounting."""

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session
from app.models.models import Image, User
from datetime import datetime, timezone


def request_image_by_id(db: Session, id: int):
    """Return an Image row by primary key, or None."""
    return db.query(Image).filter(Image.id == id).first()


def request_owned_image(db: Session, *, image_id: int, owner_id: int):
    """Resolve an image and its owner in one non-enumerating query."""
    return db.query(Image).filter(
        Image.id == image_id,
        Image.owner_id == owner_id,
    ).first()


def request_images_by_user_id(db: Session, id: int):
    """Return every Image owned by the given user id."""
    return db.query(Image).filter(Image.owner_id == id).all()


def count_images_by_user_id(db: Session, id: int) -> int:
    """Return how many image metadata rows the given user owns."""
    return db.query(Image).filter(Image.owner_id == id).count()


def reserve_image_slot(db: Session, *, owner_id: int, limit: int) -> bool:
    """Atomically reserve one upload slot without committing the transaction.

    The counter is reconciled upward with the live image-row count inside the
    same SQL statement. That compatibility rule covers images written by an
    N-1 worker which does not know the counter column. PostgreSQL serializes the
    owner-row update; SQLite serializes the conditional write, so concurrent
    requests cannot cross the storage boundary beyond ``limit``.

    The caller must keep this transaction open through object publication and
    metadata insertion. Commit turns the reservation into a used slot; rollback
    releases it together with any failed metadata write.
    """

    bounded_limit = max(0, int(limit))
    actual_count = (
        select(func.count(Image.id))
        .where(Image.owner_id == int(owner_id))
        .scalar_subquery()
    )
    effective_count = case(
        (User.image_slots_used > actual_count, User.image_slots_used),
        else_=actual_count,
    )
    reserved = db.query(User).filter(
        User.id == int(owner_id),
        User.is_active.is_(True),
        effective_count < bounded_limit,
    ).update(
        {User.image_slots_used: effective_count + 1},
        synchronize_session=False,
    )
    return reserved == 1


def reconcile_image_slots(db: Session, *, owner_id: int) -> None:
    """Align the owner counter with image rows after a transactional delete."""

    actual_count = (
        select(func.count(Image.id))
        .where(Image.owner_id == int(owner_id))
        .scalar_subquery()
    )
    db.query(User).filter(User.id == int(owner_id)).update(
        {User.image_slots_used: actual_count},
        synchronize_session=False,
    )


def create_image(
    db: Session,
    *,
    filename: str,
    file_size: int,
    file_path: str,
    mime_type: str,
    owner_id: int,
    commit: bool = True,
) -> Image:
    """Insert metadata for a file that was already written to disk or S3.

    The caller passes verified values explicitly rather than a raw upload:
    `mime_type` is the format detected from the bytes, `file_size` is the number
    of bytes actually stored, and `filename` is the original name kept for
    display only. `file_path` must already point at the stored object; this
    helper does not move bytes.

    By default this helper commits for compatibility with existing callers.
    Storage sagas pass ``commit=False`` so object publication and metadata can
    be compensated as one operation when the final transaction fails.
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
    if commit:
        db.commit()
        db.refresh(db_image)
    else:
        db.flush()
    return db_image
