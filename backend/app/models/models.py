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
)
from .database import Base, engine

logger = logging.getLogger(__name__)


class User(Base):
    """Registered account used for auth, ownership, and plan entitlements."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    created_at = Column(DateTime)
    is_active = Column(Boolean)


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

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    # Generated export path when present; canvas documents may omit it until export.
    file_path = Column(String, nullable=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))
    pages = Column(Integer, default=1)
    page_width = Column(Float, default=595)
    page_height = Column(Float, default=842)
    # "template" = constrained layout; "freeform" = free positioning.
    editor_mode = Column(String, default="freeform")
    # Originating template slug when known (may remain set after unlock).
    template_id = Column(String, nullable=True)
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
