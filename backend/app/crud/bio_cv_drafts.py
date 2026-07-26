from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import BioCvDraft


def get_bio_cv_draft(db: Session, owner_id: int) -> BioCvDraft | None:
    return db.query(BioCvDraft).filter(BioCvDraft.owner_id == owner_id).first()


def upsert_bio_cv_draft(db: Session, owner_id: int, cv_data: dict) -> BioCvDraft:
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
    draft = get_bio_cv_draft(db, owner_id)
    if draft is None:
        return False
    db.delete(draft)
    db.commit()
    return True
