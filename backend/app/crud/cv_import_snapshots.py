"""Owner-scoped persistence helpers for PDF extraction snapshots."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import and_, or_
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


def list_owned_snapshots(
    db: Session,
    *,
    owner_id: int,
    limit: int,
    cursor_created_at: datetime | None = None,
    cursor_id: int | None = None,
) -> list[CvImportSnapshot]:
    """Return one stable newest-first page of the caller's active imports.

    The ``created_at, id`` tuple forms a deterministic cursor. Using both
    values prevents duplicate or skipped rows when multiple imports share the
    same timestamp, while owner scoping remains part of the database query.
    The caller requests one extra row to determine whether a next cursor is
    needed without running a separate count query.
    """
    query = db.query(CvImportSnapshot).filter(
        CvImportSnapshot.owner_id == owner_id,
        CvImportSnapshot.deleted_at.is_(None),
    )
    if cursor_created_at is not None and cursor_id is not None:
        query = query.filter(or_(
            CvImportSnapshot.created_at < cursor_created_at,
            and_(
                CvImportSnapshot.created_at == cursor_created_at,
                CvImportSnapshot.id < cursor_id,
            ),
        ))
    return query.order_by(
        CvImportSnapshot.created_at.desc(),
        CvImportSnapshot.id.desc(),
    ).limit(limit + 1).all()


def mark_snapshot_succeeded(
    db: Session,
    snapshot: CvImportSnapshot,
    cv_data: dict,
    *,
    commit: bool = True,
) -> CvImportSnapshot:
    """Stage or persist a successful normalized extraction result.

    ``commit=False`` is reserved for the extraction route, which commits this
    state together with its conditional monthly quota claim. Other callers keep
    the historical self-contained commit behaviour.
    """
    snapshot.status = "succeeded"
    snapshot.cv_data = cv_data
    snapshot.error_code = None
    snapshot.completed_at = datetime.now(timezone.utc)
    db.add(snapshot)
    if not commit:
        return snapshot
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


def linked_pdfs_for_snapshots(
    db: Session,
    *,
    snapshot_ids: Sequence[int],
    owner_id: int,
) -> dict[int, list[Pdf]]:
    """Load documents for an import-history page in one owner-scoped query."""
    if not snapshot_ids:
        return {}
    documents = db.query(Pdf).filter(
        Pdf.source_import_id.in_(snapshot_ids),
        Pdf.owner_id == owner_id,
    ).order_by(Pdf.updated_at.desc()).all()
    grouped: dict[int, list[Pdf]] = {snapshot_id: [] for snapshot_id in snapshot_ids}
    for document in documents:
        if document.source_import_id in grouped:
            grouped[document.source_import_id].append(document)
    return grouped
