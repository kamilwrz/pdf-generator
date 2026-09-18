"""Shared source eligibility for interview intake and account-profile editing."""
from app.models.models import CvImportSnapshot, Pdf


def has_interview_source(cv_data):
    """Require a structured candidate name, the minimum needed to generate a CV.

    Template metadata, empty starter sections and free-form notes do not qualify.
    Work experience is deliberately optional: students can enrich education or
    skills. This predicate never reads or substitutes the account owner's name.
    """
    return isinstance(cv_data, dict) and isinstance(cv_data.get("name"), str) and bool(cv_data["name"].strip())


def available_interview_sources(db, owner_id):
    """Return owner-scoped source choices without exposing their career content.

    Failed, processing, deleted and empty imports are ineligible. Query all
    source metadata so an older usable import is not hidden by a recent page of
    failed uploads. No profile/session writes or external requests occur here.
    """
    documents = db.query(Pdf.id, Pdf.title, Pdf.cv_data).filter(Pdf.owner_id == owner_id).order_by(Pdf.updated_at.desc()).all()
    imports = db.query(CvImportSnapshot.id, CvImportSnapshot.source_filename, CvImportSnapshot.cv_data).filter(
        CvImportSnapshot.owner_id == owner_id, CvImportSnapshot.status == "succeeded",
        CvImportSnapshot.deleted_at.is_(None),
    ).order_by(CvImportSnapshot.created_at.desc()).all()
    return {
        "documents": [{"id": row.id, "title": row.title} for row in documents if has_interview_source(row.cv_data)],
        "imports": [{"id": row.id, "filename": row.source_filename} for row in imports if has_interview_source(row.cv_data)],
    }
