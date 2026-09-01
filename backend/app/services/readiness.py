"""Database readiness checks shared by the probe and request gate.

Liveness and readiness deliberately have different responsibilities. The
process can be alive while PostgreSQL is unavailable or a deployment has not
finished applying migrations. In that state ``/health`` must remain cheap,
while ``/ready`` and database-backed API routes return HTTP 503.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Callable

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.models.database import SessionLocal, engine
from app.models.models import Plan
from app.services.entitlements import PLAN_SEEDS

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReadinessResult:
    """Public-safe result of one complete readiness check."""

    ready: bool
    failed_check: str | None = None


class ReadinessProbe:
    """Verify connectivity, schema revision, and required catalog seed data.

    The probe is intentionally read-only. Schema migration and seed mutation
    belong to the controlled pre-deploy command, so a web worker never changes
    shared database state while it is beginning to accept traffic.
    """

    def __init__(
        self,
        *,
        database_engine: Engine,
        session_factory: sessionmaker[Session],
        alembic_config_path: Path,
    ) -> None:
        self._engine = database_engine
        self._session_factory = session_factory
        self._alembic_config_path = alembic_config_path

    def check(self) -> ReadinessResult:
        """Run all readiness checks and hide infrastructure details from callers."""

        failed_check = "database"
        try:
            with self._engine.connect() as connection:
                connection.execute(text("SELECT 1")).scalar_one()

                failed_check = "migrations"
                migration_context = MigrationContext.configure(connection)
                current_heads = set(migration_context.get_current_heads())
                expected_heads = set(self._script_directory().get_heads())
                if not expected_heads or current_heads != expected_heads:
                    return ReadinessResult(False, failed_check)

                # The 0014 migration quarantines historic SQLite orphan ids.
                # Refuse traffic if any other FK violation remains so a worker
                # never starts with integrity enforcement silently bypassed.
                if connection.dialect.name == "sqlite":
                    failed_check = "integrity"
                    if connection.execute(text("PRAGMA foreign_key_check")).first():
                        return ReadinessResult(False, failed_check)

            failed_check = "seed"
            if not self._has_expected_plan_catalog():
                return ReadinessResult(False, failed_check)
        except Exception as exc:
            # The exception type is enough to diagnose the failing layer while
            # avoiding credentials or database hostnames in routine logs.
            logger.warning(
                "Readiness check failed: check=%s error_type=%s",
                failed_check,
                type(exc).__name__,
            )
            return ReadinessResult(False, failed_check)

        return ReadinessResult(True)

    def _script_directory(self) -> ScriptDirectory:
        backend_root = self._alembic_config_path.parent
        config = Config(str(self._alembic_config_path))
        config.set_main_option("script_location", str(backend_root / "alembic"))
        return ScriptDirectory.from_config(config)

    def _has_expected_plan_catalog(self) -> bool:
        expected_by_slug = {seed["slug"]: seed for seed in PLAN_SEEDS}
        with self._session_factory() as db:
            plans = db.execute(
                select(Plan).where(Plan.slug.in_(tuple(expected_by_slug)))
            ).scalars().all()

        actual_by_slug = {plan.slug: plan for plan in plans}
        if set(actual_by_slug) != set(expected_by_slug):
            return False

        for slug, expected in expected_by_slug.items():
            plan = actual_by_slug[slug]
            for field, expected_value in expected.items():
                if getattr(plan, field) != expected_value:
                    return False
        return True


class ReadinessGate:
    """Serialize readiness checks and retain the latest public-safe state."""

    def __init__(self, checker: Callable[[], ReadinessResult]) -> None:
        self._checker = checker
        self._lock = RLock()
        self._last_result = ReadinessResult(False, "startup")

    @property
    def last_result(self) -> ReadinessResult:
        with self._lock:
            return self._last_result

    def reset(self) -> None:
        """Mark a newly started worker unavailable until its first real probe."""

        with self._lock:
            self._last_result = ReadinessResult(False, "startup")

    def probe(self) -> ReadinessResult:
        """Run the configured check once and atomically publish its result."""

        with self._lock:
            self._last_result = self._checker()
            return self._last_result


_BACKEND_ROOT = Path(__file__).resolve().parents[2]
readiness_probe = ReadinessProbe(
    database_engine=engine,
    session_factory=SessionLocal,
    alembic_config_path=_BACKEND_ROOT / "alembic.ini",
)
readiness_gate = ReadinessGate(readiness_probe.check)


def is_database_route(path: str) -> bool:
    """Return whether an HTTP path requires the application database."""

    return any(
        path == prefix or path.startswith(f"{prefix}/")
        for prefix in ("/auth", "/pdf", "/images", "/ai", "/events", "/billing")
    )
