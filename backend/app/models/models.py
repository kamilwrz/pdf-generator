from sqlalchemy import VARCHAR, Boolean, Column, DateTime, Integer, Float, String, ForeignKey, Text, JSON, inspect, text
from .database import Base, engine

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    created_at = Column(DateTime)
    is_active = Column (Boolean)

User.metadata.create_all(bind=engine)

class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String)
    file_size = Column(Integer)
    mime_type = Column(String)
    uploaded_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))

Image.metadata.create_all(bind=engine)

class Pdf(Base):
    __tablename__ = "pdfs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column (String)
    file_path = Column (String, nullable=True)
    created_at = Column (DateTime)
    updated_at = Column(DateTime)
    owner_id = Column(Integer, ForeignKey("users.id"))
    pages = Column(Integer, default=1)
    page_width = Column(Float, default=595)
    page_height = Column(Float, default=842)

Pdf.metadata.create_all(bind=engine)

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
    content = Column (Text, nullable=True)
    fontSize = Column(Float, nullable=True)
    fontFamily = Column(String, nullable=True)
    color = Column (String, nullable=True)
    src = Column(String, nullable=True)
    backgroundColor = Column(String, nullable=True)
    extra_properties = Column(JSON, nullable=True)

PdfElements.metadata.create_all(bind=engine)


class MaintenanceMarker(Base):
    """Records one-off operational migrations that must never run twice."""

    __tablename__ = "maintenance_markers"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    completed_at = Column(DateTime, nullable=False)


MaintenanceMarker.metadata.create_all(bind=engine)


class BioCvDraft(Base):
    """One resumable, private CV-profile draft per user."""

    __tablename__ = "bio_cv_drafts"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    cv_data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


BioCvDraft.metadata.create_all(bind=engine)


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


_run_lightweight_migrations()

