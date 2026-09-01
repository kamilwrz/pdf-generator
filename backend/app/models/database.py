"""
SQLAlchemy engine and session factory.

DATABASE_URL defaults to a local SQLite file for development. Render/Heroku
sometimes provide a `postgres://` URL; SQLAlchemy requires `postgresql://`,
so that prefix is normalised here.

Render's internal DB hostname only resolves on Render. Off-platform we rewrite
it to `DATABASE_URL_EXT` when present; otherwise use the configured URL as-is
(sqlite/localhost for local work).

SQLite needs `check_same_thread=False` because FastAPI may touch the same
connection from different threads within a worker. Postgres uses
`pool_pre_ping` and a short recycle window so idle SSL sockets dropped during
Render cold starts do not poison the pool.
"""

import os
import sqlite3
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base


def _normalize_database_url(url: str) -> str:
    """Rewrite Heroku-style postgres:// to the SQLAlchemy postgresql:// scheme."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _is_render_internal_hostname(url: str) -> bool:
    """True for Render private DB hosts like `dpg-….…-a` (no public DNS)."""
    try:
        host = url.split("@", 1)[1].split("/", 1)[0].split(":", 1)[0]
    except IndexError:
        return False
    return host.startswith("dpg-") and "render.com" not in host


def _resolve_database_url() -> str:
    """Pick a DB URL that works in the current environment.

    Render injects an internal hostname (`dpg-…-a`) into `DATABASE_URL` that
    only resolves on Render's private network. Outside Render, rewrite that
    internal URL to `DATABASE_URL_EXT` when present. Explicit local URLs
    (sqlite / localhost) are left alone so a laptop can run without the
    cloud database.
    """
    primary = os.getenv("DATABASE_URL", "sqlite:///./pdfgenerator.db")
    external = os.getenv("DATABASE_URL_EXT")
    on_render = os.getenv("RENDER", "").lower() in {"1", "true", "yes"}
    if not on_render and _is_render_internal_hostname(primary) and external:
        return _normalize_database_url(external)
    return _normalize_database_url(primary)


DATABASE_URL = _resolve_database_url()


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    """Enforce declared foreign keys on every SQLAlchemy SQLite connection.

    SQLite defaults this protection off per connection. Enabling it globally
    prevents a concurrent canvas save from committing an ``img_id`` after the
    referenced image row has been deleted. PostgreSQL connections are left
    unchanged because their driver connection is not ``sqlite3.Connection``.
    """

    if not isinstance(dbapi_connection, sqlite3.Connection):
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # pool_pre_ping recovers from Render Postgres dropping idle/SSL sockets
    # during deploy cold-starts. External Render URLs need sslmode=require;
    # without it local login fails with "SSL connection has been closed".
    connect_args = {}
    if "render.com" in DATABASE_URL and "sslmode=" not in DATABASE_URL:
        connect_args["sslmode"] = "require"
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args=connect_args,
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)
Base = declarative_base()
