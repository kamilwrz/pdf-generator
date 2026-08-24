"""Owner-scoped persistence helpers for PDF extraction snapshots."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import CvImportSnapshot, Pdf


def create_snapshot(db: Session, *, owner_id: int, filename: str, size_bytes: int) -> CvImportSnapshot:
    """Persist a processing snapshot before the external extraction call begins."""
    snapshot = CvImportSnapshot(
        owner_id=owner_id,
        source_filename=filename[:255] or "cv.pdf",
        source_size_bytes=size_bytes,
        status="processing",
        created_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def get_owned_snapshot(db: Session, *, owner_id: int, snapshot_id: int) -> CvImportSnapshot | None:
    """Return a non-deleted snapshot only when it belongs to the caller."""
    return db.query(CvImportSnapshot).filter(
        CvImportSnapshot.id == snapshot_id,
        CvImportSnapshot.owner_id == owner_id,
        CvImportSnapshot.deleted_at.is_(None),
    ).first()


def list_owned_snapshots(db: Session, *, owner_id: int) -> list[CvImportSnapshot]:
    """Return the caller's newest active imports first."""
    return db.query(CvImportSnapshot).filter(
        CvImportSnapshot.owner_id == owner_id,
        CvImportSnapshot.deleted_at.is_(None),
    ).order_by(CvImportSnapshot.created_at.desc()).all()


def mark_snapshot_succeeded(db: Session, snapshot: CvImportSnapshot, cv_data: dict) -> CvImportSnapshot:
    snapshot.status = "succeeded"
    snapshot.cv_data = cv_data
    snapshot.error_code = None
    snapshot.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def mark_snapshot_failed(db: Session, snapshot: CvImportSnapshot, error_code: str) -> CvImportSnapshot:
    snapshot.status = "failed"
    snapshot.cv_data = None
    snapshot.error_code = error_code
    snapshot.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def soft_delete_snapshot(db: Session, snapshot: CvImportSnapshot) -> None:
    """Erase personal extraction data while retaining a tombstone for linked CVs."""
    snapshot.status = "deleted"
    snapshot.cv_data = None
    snapshot.deleted_at = datetime.now(timezone.utc)
    db.commit()


def linked_pdfs(db: Session, *, snapshot_id: int, owner_id: int) -> list[Pdf]:
    """Return only documents that the snapshot owner created from this import."""
    return db.query(Pdf).filter(
        Pdf.source_import_id == snapshot_id,
        Pdf.owner_id == owner_id,
    ).order_by(Pdf.updated_at.desc()).all()
