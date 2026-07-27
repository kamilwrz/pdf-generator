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
    inspect,
    text,
)
from .database import Base, engine

logger = logging.getLogger(__name__)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    created_at = Column(DateTime)
    is_active = Column(Boolean)


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String)
    file_size = Column(Integer)
    mime_type = Column(String)
    uploaded_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))


class Pdf(Base):
    __tablename__ = "pdfs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    file_path = Column(String, nullable=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))
    pages = Column(Integer, default=1)
    page_width = Column(Float, default=595)
    page_height = Column(Float, default=842)


class PdfElements(Base):
    __tablename__ = "pdf_elements"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer, ForeignKey("pdfs.id"))
    img_id = Column(Integer, ForeignKey("images.id"), nullable=True)
    element_id = Column(String)
    category = Column(String)
    page = Column(Integer, default=1)
    left = Column(Float)
    top = Column(Float)
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


class Plan(Base):
    """Catalog of subscription entitlements (Free / Standard / Pro)."""

    __tablename__ = "plans"

    slug = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    # None = unlimited
    max_projects = Column(Integer, nullable=True)
    max_exports_per_month = Column(Integer, nullable=True)
    max_ai_actions_per_month = Column(Integer, nullable=True)
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


class UsageCounter(Base):
    """Per-user monthly meters for exports and AI actions."""

    __tablename__ = "usage_counters"
    __table_args__ = (
        UniqueConstraint("user_id", "period_key", name="uq_usage_user_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # YYYY-MM (UTC)
    period_key = Column(String, nullable=False, index=True)
    exports_count = Column(Integer, nullable=False, default=0)
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


def _run_lightweight_migrations():
    """Add multi-page columns to pre-existing tables.

    SQLAlchemy's create_all() never ALTERs existing tables, so for databases
    created before multi-page support we add the columns by hand. Idempotent
    and DB-agnostic (the ADD COLUMN ... DEFAULT 1 syntax works on both SQLite
    and PostgreSQL)."""
    inspector = inspect(engine)
    pending = []
    existing_tables = inspector.get_table_names()

    if "pdf_elements" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("pdf_elements")}
        if "page" not in cols:
            pending.append("ALTER TABLE pdf_elements ADD COLUMN page INTEGER DEFAULT 1")

    if "pdfs" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("pdfs")}
        if "pages" not in cols:
            pending.append("ALTER TABLE pdfs ADD COLUMN pages INTEGER DEFAULT 1")
        if "page_width" not in cols:
            pending.append("ALTER TABLE pdfs ADD COLUMN page_width FLOAT DEFAULT 595")
        if "page_height" not in cols:
            pending.append("ALTER TABLE pdfs ADD COLUMN page_height FLOAT DEFAULT 842")

    if not pending:
        return

    with engine.begin() as conn:
        for statement in pending:
            try:
                conn.execute(text(statement))
            except Exception as exc:  # pragma: no cover - defensive
                print(f"[migration] skipped '{statement}': {exc}")


def init_db(*, attempts: int = 6, delay_seconds: float = 2.0) -> None:
    """Create tables and run light migrations with retries.

    Must not run at import time — Render Postgres often drops the first SSL
    socket during deploy cold-start, which used to crash uvicorn before listen.
    """
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            _run_lightweight_migrations()
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
