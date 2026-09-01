"""
ORM models and database bootstrap for CV Studio.

Tables cover authenticated users, canvas documents (Pdf + PdfElements),
uploaded images, resumable bio/CV drafts, and the billing entitlement catalog
(plans, subscriptions, monthly usage, future payments).

`init_db` must only run from the app lifespan (not at import time): Render
Postgres often fails the first SSL handshake during cold start, and import-
time create_all used to crash uvicorn before it could listen for /health.
"""

import logging
import time
import unicodedata

from sqlalchemy import (
    VARCHAR,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Index,
    event,
    inspect as sqlalchemy_inspect,
)
from .database import Base, engine
from app.utils.document_integrity import canonical_title_key

logger = logging.getLogger(__name__)


class User(Base):
    """Registered account used for auth, ownership, and plan entitlements."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    # Nullable for the two-release N-1 window: an old worker can still insert a
    # user without knowing this column. New code always populates it, and the
    # unique index continues to protect every non-null canonical identity.
    username_canonical = Column(String(32), unique=True, nullable=True, index=True)
    email = Column(String, unique=True)
    email_canonical = Column(String(320), unique=True, nullable=True, index=True)
    # ``hashed_password`` remains the legacy bcrypt slot during the two-release
    # compatibility window. Old workers know only this column, so replacing it
    # with Argon2id would make newly registered accounts unreadable after a
    # rollback. Current workers authenticate against ``argon2_password_hash``
    # whenever it is present and never fall back to a stale legacy password.
    hashed_password = Column(String)
    argon2_password_hash = Column(String, nullable=True)
    created_at = Column(DateTime)
    is_active = Column(Boolean)
    # Counts committed images plus the upload currently reserved by this user.
    # A conditional UPDATE owns quota allocation so concurrent workers cannot
    # all pass an independent COUNT(*) check before publishing private bytes.
    image_slots_used = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )


def _canonical_identity_or_none(value: str | None) -> str | None:
    """Return a canonical identity while retaining N-1-compatible nulls."""
    canonical = unicodedata.normalize("NFKC", value or "").strip().casefold()
    return canonical or None


@event.listens_for(User, "before_insert")
def _populate_user_canonical_keys_on_insert(_mapper, _connection, user: User) -> None:
    """Populate canonical keys for every insert performed by the current app."""
    user.username_canonical = _canonical_identity_or_none(user.username)
    user.email_canonical = _canonical_identity_or_none(user.email)


@event.listens_for(User, "before_update")
def _populate_user_canonical_keys_on_update(_mapper, _connection, user: User) -> None:
    """Keep populated keys aligned without upgrading legacy rows accidentally.

    A user inserted by an N-1 worker can legitimately have null canonical keys.
    A password-only update must retain those nulls until a dedicated finalizing
    migration can detect cross-worker collisions. Identity edits, and ordinary
    updates of already-migrated users, still keep both keys synchronized.
    """
    state = sqlalchemy_inspect(user)
    if user.username_canonical is not None or state.attrs.username.history.has_changes():
        user.username_canonical = _canonical_identity_or_none(user.username)
    if user.email_canonical is not None or state.attrs.email.history.has_changes():
        user.email_canonical = _canonical_identity_or_none(user.email)


class AuthRateLimit(Base):
    """Database-backed fixed-window counter for authentication abuse controls."""

    __tablename__ = "auth_rate_limits"
    __table_args__ = (
        UniqueConstraint(
            "scope",
            "key_hash",
            "window_start",
            name="uq_auth_rate_limit_window",
        ),
        Index("ix_auth_rate_limits_window_end", "window_end"),
    )

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String(32), nullable=False)
    # HMAC digest; raw usernames, emails and IP addresses are never retained.
    key_hash = Column(String(64), nullable=False)
    window_start = Column(DateTime, nullable=False)
    window_end = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)


class Image(Base):
    """Metadata for a user-uploaded image referenced by canvas image elements."""

    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    # Local path or S3 key depending on USE_S3.
    file_path = Column(String)
    file_size = Column(Integer)
    mime_type = Column(String)
    uploaded_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))


class Pdf(Base):
    """A saved CV canvas document owned by one user.

    Page size defaults are A4 portrait in points (595×842), matching the
    frontend canvas coordinate system 1:1.
    """

    __tablename__ = "pdfs"
    __table_args__ = (
        UniqueConstraint("owner_id", "title_key", name="uq_pdf_owner_title_key"),
        UniqueConstraint(
            "owner_id",
            "create_idempotency_key",
            name="uq_pdf_owner_create_idempotency",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    # Nullable only while N-1 workers may create documents without this field.
    # The per-owner unique constraint still rejects duplicate non-null keys.
    title_key = Column(String(140), nullable=True)
    # Generated export path when present; canvas documents may omit it until export.
    file_path = Column(String, nullable=True)
    # Storage V2 keeps the backend and immutable server-generated object key
    # separate from the user-facing title. ``file_path`` remains during the
    # rolling migration so older rows and workers can still be read safely.
    storage_backend = Column(String(16), nullable=True)
    storage_key = Column(String(255), nullable=True, unique=True, index=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))
    # The server default keeps an N-1 mapper (which does not name this column)
    # insert-compatible; migration triggers materialize its title key and then
    # advance the compatibility write to revision 2.
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    create_idempotency_key = Column(String(128), nullable=True)
    create_request_hash = Column(String(64), nullable=True)
    pages = Column(Integer, default=1)
    page_width = Column(Float, default=595)
    page_height = Column(Float, default=842)
    # "template" = constrained layout; "freeform" = free positioning.
    editor_mode = Column(String, default="freeform")
    # Active constrained-layout template. Freeform unlock clears this field.
    template_id = Column(String, nullable=True)
    # Immutable provenance survives template unlocks and plan downgrades.
    origin_template_id = Column(String, nullable=True)
    # Per-document vertical rhythm override ({stack,record,section,after_rule}).
    # Null means generator/editor defaults (SPACE_* constants).
    spacing_px = Column(JSON, nullable=True)
    # Normalized profile used to regenerate this document in another template.
    # Canvas elements preserve the current layout; this snapshot preserves the
    # semantic CV content required by `/ai/fill_template` after a reload.
    cv_data = Column(JSON, nullable=True)
    # What is CURRENTLY baked into the stored file at file_path — not the
    # account's current plan. download_pdf compares this against the live
    # entitlement and only re-renders when they differ (e.g. right after an
    # upgrade), so an unchanged plan never pays a re-render cost.
    watermarked = Column(Boolean, nullable=False, default=False)
    # Nullable because manually created documents have no import provenance.
    source_import_id = Column(Integer, ForeignKey("cv_import_snapshots.id"), nullable=True, index=True)


@event.listens_for(Pdf, "before_insert")
def _populate_pdf_title_key_on_insert(_mapper, _connection, pdf: Pdf) -> None:
    """Populate a missing key while preserving migration-assigned keys."""
    if not pdf.title_key:
        pdf.title_key = canonical_title_key(pdf.title)


@event.listens_for(Pdf, "before_update")
def _populate_pdf_title_key_on_update(_mapper, _connection, pdf: Pdf) -> None:
    """Re-key only real title changes, not unrelated document updates.

    Migration 0012 gives duplicate legacy titles stable suffixed keys. Rewriting
    one of those keys during an autosave would collide with the first document,
    even though its display title did not change.
    """
    title_changed = sqlalchemy_inspect(pdf).attrs.title.history.has_changes()
    if not pdf.title_key or title_changed:
        pdf.title_key = canonical_title_key(pdf.title)


class StorageCleanupJob(Base):
    """Durable request to remove an obsolete private PDF or image object.

    Metadata deletion/pointer replacement is committed with this outbox row
    before cleanup is attempted. A finite retry budget ends in a retained dead
    letter, preventing one corrupt locator from consuming worker capacity
    forever while preserving enough state for an operator to investigate.
    """

    __tablename__ = "storage_cleanup_jobs"
    __table_args__ = (
        UniqueConstraint(
            "storage_backend",
            "storage_key",
            name="uq_storage_cleanup_backend_key",
        ),
        Index(
            "ix_storage_cleanup_jobs_status_next_attempt",
            "status",
            "next_attempt_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    storage_backend = Column(String(16), nullable=False)
    storage_key = Column(String(255), nullable=False)
    # ``pdf`` and ``image`` select separate validated private-storage roots.
    resource_kind = Column(
        String(16),
        nullable=False,
        default="pdf",
        server_default="pdf",
    )
    # pending | dead_letter. Terminal rows remain available for operator audit
    # but are excluded from automatic and request-scoped retry processing.
    status = Column(
        String(16),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)
    terminal_at = Column(DateTime, nullable=True)


class PdfElements(Base):
    """One canvas element belonging to a Pdf document.

    Geometry (left/top/width/height) uses the same top-left origin as the
    React canvas. Style flags that do not have dedicated columns (bold,
    fixedToPage, connectors, etc.) live in `extra_properties` JSON so older
    rows stay loadable without schema churn for every new editor field.
    """

    __tablename__ = "pdf_elements"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer, ForeignKey("pdfs.id"))
    img_id = Column(Integer, ForeignKey("images.id"), nullable=True)
    # Client-generated nanoid; stable across autosaves so the editor can match rows.
    element_id = Column(String)
    category = Column(String)
    page = Column(Integer, default=1)
    left = Column(Float)
    top = Column(Float)
    # Stored as VARCHAR historically because the canvas sometimes sent CSS strings.
    width = Column(VARCHAR, nullable=True)
    height = Column(VARCHAR, nullable=True)
    content = Column(Text, nullable=True)
    fontSize = Column(Float, nullable=True)
    fontFamily = Column(String, nullable=True)
    color = Column(String, nullable=True)
    src = Column(String, nullable=True)
    backgroundColor = Column(String, nullable=True)
    extra_properties = Column(JSON, nullable=True)


class MaintenanceMarker(Base):
    """Records one-off operational migrations that must never run twice."""

    __tablename__ = "maintenance_markers"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    completed_at = Column(DateTime, nullable=False)


class BioCvDraft(Base):
    """One resumable, private CV-profile draft per user."""

    __tablename__ = "bio_cv_drafts"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    cv_data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class CvImportSnapshot(Base):
    """Private normalized result of one PDF CV extraction attempt.

    Original PDF bytes are deliberately never retained. The snapshot lets its
    owner inspect and reuse extracted structured data without another AI call.
    """

    __tablename__ = "cv_import_snapshots"
    __table_args__ = (
        Index("ix_cv_import_snapshots_owner_created", "owner_id", "created_at"),
        Index("ix_cv_import_snapshots_owner_status", "owner_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_filename = Column(String(255), nullable=False)
    source_size_bytes = Column(Integer, nullable=False)
    # processing | succeeded | failed | deleted
    status = Column(String(24), nullable=False, default="processing")
    cv_data = Column(JSON, nullable=True)
    # Stable user-safe failure category; never a provider exception.
    error_code = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)


class Plan(Base):
    """Catalog of subscription entitlements (Free / Pro)."""

    __tablename__ = "plans"

    slug = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    # None = unlimited
    max_projects = Column(Integer, nullable=True)
    max_exports_per_month = Column(Integer, nullable=True)
    max_ai_actions_per_month = Column(Integer, nullable=True)
    # Successful provider-backed CV imports per UTC calendar month.
    max_cv_imports_per_month = Column(Integer, nullable=True)
    ai_assistant = Column(Boolean, nullable=False, default=False)
    extract_cv = Column(Boolean, nullable=False, default=False)
    # "starter" | "all"
    template_tier = Column(String, nullable=False, default="starter")
    # Filled when Stripe products are wired
    stripe_price_id_monthly = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)


class UserSubscription(Base):
    """Current plan assignment for a user. Stripe fields stay null until billing lands."""

    __tablename__ = "user_subscriptions"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    plan_slug = Column(String, ForeignKey("plans.slug"), nullable=False, index=True)
    # active | canceled | past_due | trialing (Stripe-ready)
    status = Column(String, nullable=False, default="active")
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    updated_at = Column(DateTime, nullable=False)
    # Legacy one-time trial marker retained for migration compatibility. New
    # imports use UsageCounter.cv_imports_count and ignore this value.
    free_import_used = Column(Boolean, nullable=False, default=False)


class UsageCounter(Base):
    """Per-user monthly meters for exports, CV imports, and AI actions."""

    __tablename__ = "usage_counters"
    __table_args__ = (
        UniqueConstraint("user_id", "period_key", name="uq_usage_user_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # YYYY-MM (UTC)
    period_key = Column(String, nullable=False, index=True)
    exports_count = Column(Integer, nullable=False, default=0)
    cv_imports_count = Column(Integer, nullable=False, default=0)
    ai_actions_count = Column(Integer, nullable=False, default=0)
    # Credits temporarily claimed before a provider request starts. Keeping
    # reservations separate from settled usage makes the quota invariant
    # enforceable even when concurrent requests reach different workers.
    ai_credits_reserved = Column(Integer, nullable=False, default=0)


class AiCreditReservation(Base):
    """Idempotent, durable claim for one external AI assistant operation.

    Assistant calls reserve their maximum credit cost atomically and therefore
    do not use ``active_slot``. CV imports use ``active_slot=1`` until their
    provider call settles or is released because the separate monthly import
    allowance has no reserved-counter column. The unique user/slot key permits
    historical rows while allowing only one active CV import per user.
    """

    __tablename__ = "ai_credit_reservations"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_ai_reservation_user_idempotency",
        ),
        UniqueConstraint(
            "user_id",
            "active_slot",
            name="uq_ai_reservation_user_active_slot",
        ),
        Index("ix_ai_reservation_user_status", "user_id", "status"),
        Index("ix_ai_reservation_expires_at", "expires_at"),
    )

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    period_key = Column(String(7), nullable=False, index=True)
    action = Column(String(32), nullable=False)
    idempotency_key = Column(String(128), nullable=False)
    request_hash = Column(String(64), nullable=False)
    reserved_credits = Column(Integer, nullable=False)
    charged_credits = Column(Integer, nullable=False, default=0)
    # pending | settled | failed | released | expired
    status = Column(String(16), nullable=False)
    # Legacy column name retained for migration compatibility. Value 1 is an
    # active CV-import lease; assistant reservations always store NULL.
    active_slot = Column(Integer, nullable=True)
    response_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    settled_at = Column(DateTime, nullable=True)


class Payment(Base):
    """Ledger for future Stripe (and other) payment events."""

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, default="stripe")
    provider_ref = Column(String, nullable=True, index=True)
    plan_slug = Column(String, nullable=True)
    amount_cents = Column(Integer, nullable=True)
    currency = Column(String, nullable=False, default="pln")
    # pending | succeeded | failed | refunded
    status = Column(String, nullable=False, default="pending")
    raw = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False)


def _run_alembic_upgrade() -> None:
    """Apply Alembic revisions (idempotent ADD COLUMN for multi-page support).

    ``create_all`` still creates missing tables for fresh installs; Alembic
    owns schema *changes* going forward. Config lives in ``backend/alembic.ini``.
    """
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    backend_root = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_root / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_root / "alembic"))
    command.upgrade(cfg, "head")


def init_db(*, attempts: int = 6, delay_seconds: float = 2.0) -> None:
    """Create tables and run Alembic migrations with retries.

    Must not run at import time — Render Postgres often drops the first SSL
    socket during deploy cold-start, which used to crash uvicorn before listen.
    """
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            _run_alembic_upgrade()
            # Seed plan catalog + Free subscriptions for existing users.
            from app.models.database import SessionLocal
            from app.services.entitlements import bootstrap_billing

            db = SessionLocal()
            try:
                bootstrap_billing(db)
            finally:
                db.close()
            if attempt > 1:
                logger.info("Database ready after %s attempt(s).", attempt)
            return
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Database init attempt %s/%s failed: %s",
                attempt,
                attempts,
                exc,
            )
            if attempt < attempts:
                time.sleep(delay_seconds * attempt)
    raise RuntimeError(f"Database init failed after {attempts} attempts") from last_error
