"""Self-service access and erasure operations for an authenticated account.

The export deliberately excludes authentication secrets, verification-token
hashes, Google subject identifiers, and private storage locators. Erasure
removes every user-owned database record in one transaction and stages private
PDF/image deletion in the existing durable cleanup outbox.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import IMAGES_UPLOAD_DIR, PDF_UPLOAD_DIR
from app.crud.pdfs import enqueue_storage_cleanup
from app.models.models import (
    AiCreditReservation,
    BioCvDraft,
    CareerProfile,
    InterviewSession,
    CvImportSnapshot,
    EmailVerificationToken,
    Image,
    Payment,
    Pdf,
    PdfElements,
    UsageCounter,
    User,
    UserSubscription,
)
from app.services.image_storage import target_for_image
from app.services.pdf_storage import (
    IMAGE_RESOURCE,
    PDF_RESOURCE,
    process_cleanup_jobs,
    target_for_pdf,
)

logger = logging.getLogger(__name__)


def _fields(row, names: tuple[str, ...]) -> dict:
    """Copy an explicit allowlist of columns from one ORM row."""

    return {name: getattr(row, name) for name in names}


def build_account_export(db: Session, *, user: User) -> dict:
    """Build a portable JSON snapshot of personal data held by CV Studio.

    The snapshot contains account, CV, import, usage, AI-response and payment
    data. Password hashes, verification hashes, provider subject identifiers,
    private storage locators, and operational rate-limit digests are excluded
    because disclosing them would weaken account or infrastructure security.

    Side effects: database reads only.
    """

    user_id = int(user.id)
    documents = db.query(Pdf).filter(Pdf.owner_id == user_id).order_by(Pdf.id).all()
    document_ids = [int(document.id) for document in documents]
    element_rows = (
        db.query(PdfElements)
        .filter(PdfElements.pdf_id.in_(document_ids))
        .order_by(PdfElements.pdf_id, PdfElements.id)
        .all()
        if document_ids
        else []
    )
    elements_by_pdf: dict[int, list[dict]] = {document_id: [] for document_id in document_ids}
    for element in element_rows:
        elements_by_pdf[int(element.pdf_id)].append(
            _fields(
                element,
                (
                    "element_id", "category", "page", "left", "top", "width",
                    "height", "content", "fontSize", "fontFamily", "color", "src",
                    "backgroundColor", "extra_properties", "img_id",
                ),
            )
        )

    images = db.query(Image).filter(Image.owner_id == user_id).order_by(Image.id).all()
    imports = (
        db.query(CvImportSnapshot)
        .filter(CvImportSnapshot.owner_id == user_id)
        .order_by(CvImportSnapshot.id)
        .all()
    )
    drafts = db.query(BioCvDraft).filter(BioCvDraft.owner_id == user_id).all()
    subscriptions = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).all()
    usage = (
        db.query(UsageCounter)
        .filter(UsageCounter.user_id == user_id)
        .order_by(UsageCounter.period_key)
        .all()
    )
    ai_operations = (
        db.query(AiCreditReservation)
        .filter(AiCreditReservation.user_id == user_id)
        .order_by(AiCreditReservation.created_at)
        .all()
    )
    payments = (
        db.query(Payment)
        .filter(Payment.user_id == user_id)
        .order_by(Payment.created_at)
        .all()
    )

    return {
        "exported_at": datetime.now(timezone.utc),
        "service": "CV Studio",
        "account": {
            "id": user_id,
            "username": user.username,
            "email": user.email,
            "email_verified_at": user.email_verified_at,
            "google_login_connected": bool(user.google_sub),
            "created_at": user.created_at,
            "is_active": bool(user.is_active),
        },
        "documents": [
            {
                **_fields(
                    document,
                    (
                        "id", "title", "created_at", "updated_at", "revision", "pages",
                        "page_width", "page_height", "editor_mode", "template_id",
                        "origin_template_id", "spacing_px", "cv_data", "watermarked",
                        "source_import_id",
                    ),
                ),
                "elements": elements_by_pdf[int(document.id)],
            }
            for document in documents
        ],
        "images": [
            _fields(image, ("id", "filename", "file_size", "mime_type", "uploaded_at"))
            for image in images
        ],
        "bio_cv_drafts": [
            _fields(draft, ("id", "cv_data", "created_at", "updated_at")) for draft in drafts
        ],
        "cv_imports": [
            _fields(
                snapshot,
                (
                    "id", "source_filename", "source_size_bytes", "status", "cv_data",
                    "error_code", "created_at", "completed_at", "deleted_at",
                ),
            )
            for snapshot in imports
        ],
        "subscriptions": [
            _fields(
                subscription,
                (
                    "plan_slug", "status", "current_period_start", "current_period_end",
                    "stripe_customer_id", "stripe_subscription_id", "updated_at",
                    "free_import_used",
                ),
            )
            for subscription in subscriptions
        ],
        "monthly_usage": [
            _fields(
                counter,
                (
                    "period_key", "exports_count", "cv_imports_count", "ai_actions_count",
                    "ai_credits_reserved",
                ),
            )
            for counter in usage
        ],
        "ai_operations": [
            _fields(
                operation,
                (
                    "id", "period_key", "action", "reserved_credits", "charged_credits",
                    "status", "response_json", "created_at", "expires_at", "settled_at",
                ),
            )
            for operation in ai_operations
        ],
        "payments": [
            _fields(
                payment,
                (
                    "id", "provider", "provider_ref", "provider_event_id", "plan_slug",
                    "amount_cents", "currency", "status", "raw", "created_at", "paid_at",
                ),
            )
            for payment in payments
        ],
        "career_profile": [
            _fields(row, ("revision", "facts", "updated_at"))
            for row in db.query(CareerProfile).filter_by(owner_id=user_id).all()
        ],
        "interviews": [
            _fields(row, ("id", "revision", "state", "created_at", "updated_at"))
            for row in db.query(InterviewSession).filter_by(owner_id=user_id).all()
        ],
        "not_included": [
            "password hashes, access tokens and email-verification token hashes",
            "Google provider subject identifier",
            "private storage paths and object keys",
            "PDF and image binary files; download saved PDFs separately before deletion",
            "short-lived abuse-prevention digests that cannot be mapped back reliably",
        ],
    }


def delete_account_data(db: Session, *, user_id: int) -> None:
    """Permanently erase an account and stage deletion of its private files.

    All database deletion and cleanup-outbox inserts commit atomically. Physical
    storage removal runs after the commit and is retryable; a temporary S3 or
    disk failure therefore cannot restore database access to deleted records.

    @raises LookupError: when the account no longer exists.
    @raises ValueError: when a stored file locator fails containment checks.
    """

    user = (
        db.query(User)
        .filter(User.id == int(user_id))
        .populate_existing()
        .with_for_update()
        .one_or_none()
    )
    if user is None:
        raise LookupError("Account does not exist.")

    documents = db.query(Pdf).filter(Pdf.owner_id == user.id).order_by(Pdf.id).all()
    images = db.query(Image).filter(Image.owner_id == user.id).order_by(Image.id).all()

    # Resolve every locator before mutating the database. A corrupt locator is
    # an operator-visible failure rather than a silent orphaned personal file.
    pdf_targets = [
        target_for_pdf(document, root=PDF_UPLOAD_DIR, legacy_owner_segment=str(user.username))
        for document in documents
        if document.storage_key or document.file_path
    ]
    image_targets = [
        target_for_image(image, root=IMAGES_UPLOAD_DIR)
        for image in images
        if image.file_path
    ]
    document_ids = [int(document.id) for document in documents]

    if document_ids:
        db.query(PdfElements).filter(PdfElements.pdf_id.in_(document_ids)).delete(
            synchronize_session=False
        )
        db.query(Pdf).filter(Pdf.id.in_(document_ids)).delete(synchronize_session=False)
    db.query(Image).filter(Image.owner_id == user.id).delete(synchronize_session=False)
    # Import snapshots are referenced by Pdf.source_import_id, so they can be
    # removed only after all owned documents have been deleted.
    db.query(BioCvDraft).filter(BioCvDraft.owner_id == user.id).delete(synchronize_session=False)
    db.query(InterviewSession).filter_by(owner_id=user.id).delete(synchronize_session=False)
    db.query(CareerProfile).filter_by(owner_id=user.id).delete(synchronize_session=False)
    db.query(CvImportSnapshot).filter(CvImportSnapshot.owner_id == user.id).delete(
        synchronize_session=False
    )
    db.query(AiCreditReservation).filter(AiCreditReservation.user_id == user.id).delete(
        synchronize_session=False
    )
    db.query(Payment).filter(Payment.user_id == user.id).delete(synchronize_session=False)
    db.query(UsageCounter).filter(UsageCounter.user_id == user.id).delete(synchronize_session=False)
    db.query(UserSubscription).filter(UserSubscription.user_id == user.id).delete(
        synchronize_session=False
    )
    db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).delete(
        synchronize_session=False
    )

    cleanup_jobs = []
    for target in pdf_targets:
        cleanup_jobs.append(
            enqueue_storage_cleanup(
                db,
                (target.backend, target.key),
                resource_kind=PDF_RESOURCE,
            )
        )
    for target in image_targets:
        cleanup_jobs.append(
            enqueue_storage_cleanup(
                db,
                (target.backend, target.key),
                resource_kind=IMAGE_RESOURCE,
            )
        )

    db.delete(user)
    db.flush()
    job_ids = [int(job.id) for job in cleanup_jobs]
    db.commit()

    try:
        process_cleanup_jobs(db, job_ids=job_ids, root=PDF_UPLOAD_DIR, image_root=IMAGES_UPLOAD_DIR)
    except Exception:
        # The durable outbox owns later retries. Do not turn a completed account
        # erasure into an apparent failure that encourages duplicate requests.
        db.rollback()
        logger.exception("account_erasure storage_cleanup=deferred user_id=%s", user_id)
