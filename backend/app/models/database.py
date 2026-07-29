"""
SQLAlchemy engine and session factory.

DATABASE_URL defaults to a local SQLite file for development. Render/Heroku
sometimes provide a `postgres://` URL; SQLAlchemy requires `postgresql://`,
so that prefix is normalised here.

SQLite needs `check_same_thread=False` because FastAPI may touch the same
connection from different threads within a worker. Postgres uses
`pool_pre_ping` and a short recycle window so idle SSL sockets dropped during
Render cold starts do not poison the pool.
"""

import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./pdfgenerator.db"
)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # pool_pre_ping recovers from Render Postgres dropping idle/SSL sockets
    # during deploy cold-starts.
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)
Base = declarative_base()
