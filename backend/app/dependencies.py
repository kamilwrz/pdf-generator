"""
Shared FastAPI dependencies.

`get_db` yields a request-scoped SQLAlchemy session and always closes it,
including when the route raises. Prefer this over constructing SessionLocal
inside handlers so connections cannot leak under exceptions.
"""

from app.models.database import SessionLocal


def get_db():
    """Lend a database session to a route and release it after the request.

    FastAPI calls this generator for parameters declared as ``Depends(get_db)``.
    A session tracks database reads and pending writes. This dependency does
    not save changes: the route or service must call ``commit()`` explicitly.
    """
    db = SessionLocal()
    try:
        # Execution pauses here while FastAPI runs the route. The finally
        # block still runs if the route fails, returning the connection to
        # the engine and discarding any transaction left uncommitted.
        yield db
    finally:
        db.close()
