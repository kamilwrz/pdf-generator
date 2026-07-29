"""One private, resumable bio/CV profile draft per user."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import BioCvDraft


def get_bio_cv_draft(db: Session, owner_id: int) -> BioCvDraft | None:
    """Return the caller's draft row, or None when none exists yet."""
    return db.query(BioCvDraft).filter(BioCvDraft.owner_id == owner_id).first()


def upsert_bio_cv_draft(db: Session, owner_id: int, cv_data: dict) -> BioCvDraft:
    """Create or replace the draft JSON for `owner_id` and refresh timestamps.

    Side effects: commit + refresh. Assumes `cv_data` was already normalised
    by the route layer.
    """
    now = datetime.now(timezone.utc)
    draft = get_bio_cv_draft(db, owner_id)
    if draft is None:
        draft = BioCvDraft(
            owner_id=owner_id,
            cv_data=cv_data,
            created_at=now,
            updated_at=now,
        )
        db.add(draft)
    else:
        draft.cv_data = cv_data
        draft.updated_at = now
    db.commit()
    db.refresh(draft)
    return draft


def delete_bio_cv_draft(db: Session, owner_id: int) -> bool:
    """Delete the draft if present. Returns whether a row was removed."""
    draft = get_bio_cv_draft(db, owner_id)
    if draft is None:
        return False
    db.delete(draft)
    db.commit()
    return True
