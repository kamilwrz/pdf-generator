"""
Shared FastAPI dependencies.

`get_db` yields a request-scoped SQLAlchemy session and always closes it,
including when the route raises. Prefer this over constructing SessionLocal
inside handlers so connections cannot leak under exceptions.
"""

from app.models.database import SessionLocal


def get_db():
    """Yield a SQLAlchemy session for one request, then close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
