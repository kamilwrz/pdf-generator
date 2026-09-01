"""PostgreSQL-only bootstrap and atomic resource reservation contracts.

The ordinary backend suite intentionally remains portable on SQLite. These
tests exercise the production dialect in a unique PostgreSQL schema so row
locks, unique constraints, and Alembic state cannot be accidentally validated
only through SQLite's process-local writer lock.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import subprocess
import sys
from threading import Barrier, Lock
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema


POSTGRES_TEST_DATABASE_URL = os.getenv("POSTGRES_TEST_DATABASE_URL", "").strip()
BACKEND_ROOT = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skipif(
    not POSTGRES_TEST_DATABASE_URL,
    reason="POSTGRES_TEST_DATABASE_URL is required for PostgreSQL security contracts",
)


def _schema_database_url(database_url: str, schema_name: str) -> str:
    """Return a URL whose every connection resolves unqualified tables in one schema."""
    url = make_url(database_url)
    query = dict(url.query)
    query["options"] = f"-csearch_path={schema_name}"
    return url.set(query=query).render_as_string(hide_password=False)


@pytest.fixture(scope="module")
def postgres_engine():
    """Bootstrap an isolated schema through the production init/Alembic path.

    The URL must name PostgreSQL explicitly. A random schema provides a truly
    fresh catalog without dropping the caller's database, and the finalizer
    removes only that verified test-owned schema even when an assertion fails.
    """
    admin_engine = create_engine(POSTGRES_TEST_DATABASE_URL, isolation_level="AUTOCOMMIT")
    if admin_engine.dialect.name != "postgresql":
        admin_engine.dispose()
        pytest.fail("POSTGRES_TEST_DATABASE_URL must use the PostgreSQL dialect")

    schema_name = f"security_contract_{uuid4().hex}"
    with admin_engine.connect() as connection:
        connection.execute(CreateSchema(schema_name))

    schema_url = _schema_database_url(POSTGRES_TEST_DATABASE_URL, schema_name)
    # Twenty physical connections let the barrier release all workers into the
    # PostgreSQL row-lock path at once instead of serializing in SQLAlchemy's
    # default five-connection pool before the database sees the contention.
    engine = create_engine(
        schema_url,
        pool_pre_ping=True,
        pool_size=20,
        max_overflow=0,
    )
    try:
        assert inspect(engine).get_table_names() == [], "the contract schema must start empty"
        environment = os.environ.copy()
        environment["DATABASE_URL"] = schema_url
        environment.pop("DATABASE_URL_EXT", None)
        environment.pop("RENDER", None)
        bootstrap = subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "from app.models.models import init_db; "
                    "init_db(attempts=1, delay_seconds=0)"
                ),
            ],
            cwd=BACKEND_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        assert bootstrap.returncode == 0, (
            "fresh PostgreSQL bootstrap failed\n"
            f"stdout:\n{bootstrap.stdout}\n"
            f"stderr:\n{bootstrap.stderr}"
        )
        yield engine
    finally:
        engine.dispose()
        with admin_engine.connect() as connection:
            connection.execute(DropSchema(schema_name, cascade=True))
        admin_engine.dispose()


def test_fresh_bootstrap_reaches_alembic_head_on_postgresql(postgres_engine):
    """A production-style fresh install creates all tables and stamps head."""
    assert postgres_engine.dialect.name == "postgresql"
    table_names = set(inspect(postgres_engine).get_table_names())
    assert {
        "users",
        "plans",
        "usage_counters",
        "ai_credit_reservations",
        "images",
        "alembic_version",
    }.issubset(table_names)

    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    expected_head = ScriptDirectory.from_config(config).get_current_head()
    with postgres_engine.connect() as connection:
        actual_revision = connection.execute(
            text("SELECT version_num FROM alembic_version"),
        ).scalar_one()
    assert actual_revision == expected_head


def test_postgres_migration_0009_to_0010_creates_ai_reservation_contract():
    """Upgrade a minimal real 0009 catalog and preserve N-1 meter writes.

    The fresh-bootstrap fixture creates current ORM metadata before Alembic
    runs, so revision 0010 normally observes all of its objects already in the
    catalog. This isolated schema contains only the two pre-0010 tables that
    the migration depends on. Stamping it at 0009 forces PostgreSQL to execute
    the actual ADD COLUMN, CREATE TABLE, constraint, and index statements.
    """
    admin_engine = create_engine(
        POSTGRES_TEST_DATABASE_URL,
        isolation_level="AUTOCOMMIT",
    )
    if admin_engine.dialect.name != "postgresql":
        admin_engine.dispose()
        pytest.fail("POSTGRES_TEST_DATABASE_URL must use the PostgreSQL dialect")

    schema_name = f"ai_reservation_migration_contract_{uuid4().hex}"
    with admin_engine.connect() as connection:
        connection.execute(CreateSchema(schema_name))

    schema_url = _schema_database_url(POSTGRES_TEST_DATABASE_URL, schema_name)
    migration_engine = create_engine(schema_url, pool_pre_ping=True)
    try:
        # This is the smallest valid 0009-shaped catalog accepted by revision
        # 0010: users owns the reservation foreign key, while usage_counters is
        # the existing monthly meter that receives the additive reservation
        # column. Deliberately omit every object introduced by 0010.
        with migration_engine.begin() as connection:
            connection.execute(text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    username VARCHAR UNIQUE,
                    email VARCHAR UNIQUE
                )
                """
            ))
            connection.execute(text(
                """
                CREATE TABLE usage_counters (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users (id),
                    period_key VARCHAR NOT NULL,
                    exports_count INTEGER NOT NULL DEFAULT 0,
                    cv_imports_count INTEGER NOT NULL DEFAULT 0,
                    ai_actions_count INTEGER NOT NULL DEFAULT 0,
                    CONSTRAINT uq_usage_user_period
                        UNIQUE (user_id, period_key)
                )
                """
            ))
            connection.execute(text(
                """
                CREATE TABLE alembic_version (
                    version_num VARCHAR(32) NOT NULL PRIMARY KEY
                )
                """
            ))
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
                {"revision": "20260901_0009"},
            )

        environment = os.environ.copy()
        environment["DATABASE_URL"] = schema_url
        environment.pop("DATABASE_URL_EXT", None)
        environment.pop("RENDER", None)
        upgraded = subprocess.run(
            [
                sys.executable,
                "-m",
                "alembic",
                "upgrade",
                "20260901_0010",
            ],
            cwd=BACKEND_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        assert upgraded.returncode == 0, (
            "PostgreSQL 0009 -> 0010 migration failed\n"
            f"stdout:\n{upgraded.stdout}\n"
            f"stderr:\n{upgraded.stderr}"
        )

        inspector = inspect(migration_engine)
        usage_columns = {
            column["name"]: column
            for column in inspector.get_columns("usage_counters")
        }
        assert usage_columns["ai_credits_reserved"]["nullable"] is False
        assert "0" in str(usage_columns["ai_credits_reserved"]["default"])
        assert "ai_credit_reservations" in inspector.get_table_names()

        reservation_columns = {
            column["name"] for column in inspector.get_columns(
                "ai_credit_reservations"
            )
        }
        assert reservation_columns == {
            "id",
            "user_id",
            "period_key",
            "action",
            "idempotency_key",
            "request_hash",
            "reserved_credits",
            "charged_credits",
            "status",
            "active_slot",
            "response_json",
            "created_at",
            "expires_at",
            "settled_at",
        }
        assert inspector.get_pk_constraint("ai_credit_reservations")[
            "constrained_columns"
        ] == ["id"]

        reservation_unique_constraints = {
            constraint["name"]: set(constraint["column_names"])
            for constraint in inspector.get_unique_constraints(
                "ai_credit_reservations"
            )
        }
        assert reservation_unique_constraints[
            "uq_ai_reservation_user_active_slot"
        ] == {"user_id", "active_slot"}
        assert reservation_unique_constraints[
            "uq_ai_reservation_user_idempotency"
        ] == {"user_id", "idempotency_key"}

        reservation_indexes = {
            index["name"]: index["column_names"]
            for index in inspector.get_indexes("ai_credit_reservations")
            if not index.get("duplicates_constraint")
        }
        assert reservation_indexes[
            "ix_ai_credit_reservations_user_id"
        ] == ["user_id"]
        assert reservation_indexes[
            "ix_ai_credit_reservations_period_key"
        ] == ["period_key"]
        assert reservation_indexes[
            "ix_ai_reservation_user_status"
        ] == ["user_id", "status"]
        assert reservation_indexes[
            "ix_ai_reservation_expires_at"
        ] == ["expires_at"]

        reservation_foreign_keys = inspector.get_foreign_keys(
            "ai_credit_reservations"
        )
        assert any(
            foreign_key["constrained_columns"] == ["user_id"]
            and foreign_key["referred_table"] == "users"
            and foreign_key["referred_columns"] == ["id"]
            for foreign_key in reservation_foreign_keys
        )

        # An N-1 worker does not know ai_credits_reserved and therefore omits
        # it from INSERT/UPDATE statements. The server default must keep that
        # old write shape valid throughout the rolling-deploy window.
        with migration_engine.begin() as connection:
            connection.execute(text(
                """
                INSERT INTO users (id, username, email)
                VALUES (1, 'n1-worker', 'n1-worker@example.test')
                """
            ))
            connection.execute(text(
                """
                INSERT INTO usage_counters (
                    id,
                    user_id,
                    period_key,
                    exports_count,
                    cv_imports_count,
                    ai_actions_count
                )
                VALUES (1, 1, '2026-09', 2, 3, 4)
                """
            ))
            connection.execute(text(
                """
                UPDATE usage_counters
                SET ai_actions_count = ai_actions_count + 1
                WHERE id = 1
                """
            ))
            assert connection.execute(text(
                """
                SELECT ai_actions_count, ai_credits_reserved
                FROM usage_counters
                WHERE id = 1
                """
            )).one() == (5, 0)
            assert connection.execute(text(
                "SELECT version_num FROM alembic_version"
            )).scalar_one() == "20260901_0010"
    finally:
        migration_engine.dispose()
        with admin_engine.connect() as connection:
            connection.execute(DropSchema(schema_name, cascade=True))
        admin_engine.dispose()


def test_n1_postgres_schema_runs_real_auth_and_document_migrations():
    """Upgrade an actual 0010-shaped PostgreSQL schema instead of create_all.

    The fresh-bootstrap fixture intentionally creates current metadata before
    Alembic runs. That validates bootstrap idempotency, but it means revisions
    0011 and 0012 see their columns and constraints already present. This test
    starts from the two tables those revisions mutate, stamps revision 0010,
    and therefore exercises PostgreSQL ALTER/INDEX/CONSTRAINT DDL exactly as a
    rolling production upgrade does.
    """
    admin_engine = create_engine(
        POSTGRES_TEST_DATABASE_URL,
        isolation_level="AUTOCOMMIT",
    )
    if admin_engine.dialect.name != "postgresql":
        admin_engine.dispose()
        pytest.fail("POSTGRES_TEST_DATABASE_URL must use the PostgreSQL dialect")

    schema_name = f"n1_migration_contract_{uuid4().hex}"
    with admin_engine.connect() as connection:
        connection.execute(CreateSchema(schema_name))

    schema_url = _schema_database_url(POSTGRES_TEST_DATABASE_URL, schema_name)
    migration_engine = create_engine(schema_url, pool_pre_ping=True)
    try:
        from app.models.models import Base

        # Build every table through current metadata, then remove exactly the
        # objects introduced by 0011/0012/0013/0014 and stamp 0010. This retains the real
        # storage, reservation, billing, import, and document relations that a
        # deployed 0010 database has while forcing the next revisions down their
        # PostgreSQL ALTER/INDEX/CONSTRAINT paths.
        Base.metadata.create_all(bind=migration_engine)
        with migration_engine.begin() as connection:
            connection.execute(text(
                """
                DROP TABLE auth_rate_limits
                """
            ))
            connection.execute(text(
                """
                ALTER TABLE users
                    DROP COLUMN username_canonical,
                    DROP COLUMN email_canonical,
                    DROP COLUMN argon2_password_hash,
                    DROP COLUMN image_slots_used
                """
            ))
            connection.execute(text(
                "ALTER TABLE pdfs DROP CONSTRAINT uq_pdf_owner_title_key"
            ))
            connection.execute(text(
                "ALTER TABLE pdfs DROP CONSTRAINT uq_pdf_owner_create_idempotency"
            ))
            connection.execute(text(
                """
                ALTER TABLE pdfs
                    DROP COLUMN title_key,
                    DROP COLUMN revision,
                    DROP COLUMN origin_template_id,
                    DROP COLUMN create_idempotency_key,
                    DROP COLUMN create_request_hash
                """
            ))
            connection.execute(text(
                "DROP INDEX ix_storage_cleanup_jobs_status_next_attempt"
            ))
            connection.execute(text(
                """
                ALTER TABLE storage_cleanup_jobs
                    DROP COLUMN resource_kind,
                    DROP COLUMN status,
                    DROP COLUMN terminal_at
                """
            ))
            connection.execute(text(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"
            ))
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
                {"revision": "20260901_0010"},
            )
            connection.execute(text(
                """
                INSERT INTO users (id, username, email, hashed_password, is_active)
                VALUES (1, 'Case.User', 'Owner@Example.Test', 'legacy-hash', TRUE)
                """
            ))
            connection.execute(text(
                """
                INSERT INTO pdfs (id, title, owner_id, template_id, watermarked)
                VALUES
                    (1, 'Resume', 1, 'sterling', FALSE),
                    (2, 'RESUME', 1, NULL, FALSE)
                """
            ))

        environment = os.environ.copy()
        environment["DATABASE_URL"] = schema_url
        environment.pop("DATABASE_URL_EXT", None)
        environment.pop("RENDER", None)
        upgraded = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        assert upgraded.returncode == 0, (
            "PostgreSQL N-1 migration failed\n"
            f"stdout:\n{upgraded.stdout}\n"
            f"stderr:\n{upgraded.stderr}"
        )

        inspector = inspect(migration_engine)
        user_columns = {
            column["name"]: column for column in inspector.get_columns("users")
        }
        pdf_columns = {
            column["name"]: column for column in inspector.get_columns("pdfs")
        }
        cleanup_columns = {
            column["name"]: column
            for column in inspector.get_columns("storage_cleanup_jobs")
        }
        assert user_columns["username_canonical"]["nullable"] is True
        assert user_columns["email_canonical"]["nullable"] is True
        assert user_columns["argon2_password_hash"]["nullable"] is True
        assert user_columns["image_slots_used"]["nullable"] is False
        assert pdf_columns["title_key"]["nullable"] is True
        assert pdf_columns["revision"]["nullable"] is False
        assert cleanup_columns["resource_kind"]["nullable"] is False
        assert cleanup_columns["status"]["nullable"] is False
        assert cleanup_columns["terminal_at"]["nullable"] is True

        user_indexes = {
            index["name"]: index for index in inspector.get_indexes("users")
        }
        assert user_indexes["ix_users_username_canonical"]["unique"] is True
        assert user_indexes["ix_users_email_canonical"]["unique"] is True
        pdf_constraints = {
            constraint["name"]
            for constraint in inspector.get_unique_constraints("pdfs")
        }
        assert "uq_pdf_owner_title_key" in pdf_constraints
        assert "uq_pdf_owner_create_idempotency" in pdf_constraints
        cleanup_indexes = {
            index["name"]: index
            for index in inspector.get_indexes("storage_cleanup_jobs")
        }
        assert cleanup_indexes[
            "ix_storage_cleanup_jobs_status_next_attempt"
        ]["column_names"] == ["status", "next_attempt_at"]

        with migration_engine.connect() as connection:
            assert connection.execute(text(
                "SELECT username_canonical, email_canonical, argon2_password_hash, "
                "image_slots_used "
                "FROM users WHERE id = 1"
            )).one() == ("case.user", "owner@example.test", None, 0)
            assert connection.execute(text(
                "SELECT id, title_key, revision, origin_template_id "
                "FROM pdfs ORDER BY id"
            )).all() == [
                (1, "resume", 1, "sterling"),
                (2, "resume~2", 1, None),
            ]
            config = Config(str(BACKEND_ROOT / "alembic.ini"))
            config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
            expected_head = ScriptDirectory.from_config(config).get_current_head()
            assert connection.execute(text(
                "SELECT version_num FROM alembic_version"
            )).scalar_one() == expected_head

        # Unique non-null keys remain enforced, while null values demonstrate
        # that an N-1 worker can still insert during the compatibility window.
        with pytest.raises(IntegrityError):
            with migration_engine.begin() as connection:
                connection.execute(text(
                    """
                    INSERT INTO users
                        (id, username, username_canonical, email, email_canonical)
                    VALUES
                        (3, 'Different.User', 'case.user',
                         'different@example.test', 'different@example.test')
                    """
                ))
        with migration_engine.begin() as connection:
            connection.execute(text(
                """
                INSERT INTO users
                    (id, username, username_canonical, email, email_canonical)
                VALUES
                    (4, 'N1.User', NULL, 'n1@example.test', NULL)
                """
            ))
            assert connection.execute(text(
                "SELECT image_slots_used FROM users WHERE id = 4"
            )).scalar_one() == 0
            # The 0013 server defaults preserve an N-1 cleanup enqueue which
            # knows none of the new routing/terminal columns.
            connection.execute(text(
                """
                INSERT INTO storage_cleanup_jobs
                    (id, storage_backend, storage_key, attempts, created_at)
                VALUES
                    (1, 'local',
                     'pdfs/1/1/11111111111111111111111111111111.pdf',
                     0, CURRENT_TIMESTAMP)
                """
            ))
            assert connection.execute(text(
                """
                SELECT resource_kind, status, terminal_at
                FROM storage_cleanup_jobs
                WHERE id = 1
                """
            )).one() == ("pdf", "pending", None)

        with pytest.raises(IntegrityError):
            with migration_engine.begin() as connection:
                connection.execute(text(
                    """
                    INSERT INTO pdfs
                        (id, title, title_key, owner_id, revision, watermarked)
                    VALUES (3, 'Duplicate', 'resume', 1, 1, FALSE)
                    """
                ))
        with migration_engine.begin() as connection:
            connection.execute(text(
                """
                INSERT INTO pdfs
                    (id, title, title_key, owner_id, revision, watermarked)
                VALUES (4, 'N1 document', NULL, 1, 1, FALSE)
                """
            ))
    finally:
        migration_engine.dispose()
        with admin_engine.connect() as connection:
            connection.execute(DropSchema(schema_name, cascade=True))
        admin_engine.dispose()


def test_twenty_parallel_ai_reservations_preserve_postgres_invariants(postgres_engine):
    """Twenty workers cannot over-reserve quota or create two active calls."""
    from app.crud.user import create_user
    from app.models.models import AiCreditReservation, UsageCounter, User
    from app.schemas.user_schema import UserCreateRequest
    from app.services.entitlements import (
        AiReservationError,
        PlanLimitError,
        reserve_ai_credits,
        set_user_plan,
    )

    Session = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    unique = uuid4().hex
    with Session() as db:
        create_user(
            db,
            UserCreateRequest(
                username=f"pg-contract-{unique[:12]}",
                email=f"pg-contract-{unique}@example.test",
                password="correct horse battery staple",
            ),
        )
        user_id = db.query(User.id).filter(
            User.email == f"pg-contract-{unique}@example.test",
        ).scalar()
        assert isinstance(user_id, int)
        set_user_plan(db, user_id, "pro")

    start = Barrier(20)

    def attempt(index: int) -> str:
        with Session() as db:
            start.wait(timeout=30)
            try:
                reserve_ai_credits(
                    db,
                    user_id=user_id,
                    action="rating",
                    idempotency_key=f"postgres-concurrent-{index}",
                    request_hash=f"{index:064x}",
                    reserved_credits=20,
                )
                return "reserved"
            except (AiReservationError, PlanLimitError) as error:
                return str(error.detail.get("code", "rejected"))

    with ThreadPoolExecutor(max_workers=20) as executor:
        outcomes = list(executor.map(attempt, range(20)))

    with Session() as db:
        usage = db.query(UsageCounter).filter_by(user_id=user_id).one()
        active_count = db.query(AiCreditReservation).filter_by(
            user_id=user_id,
            status="pending",
            active_slot=1,
        ).count()

    assert len(outcomes) == 20
    assert outcomes.count("reserved") == 1
    assert outcomes.count("ai_operation_active") == 19
    assert active_count == 1
    assert int(usage.ai_actions_count) == 0
    assert int(usage.ai_credits_reserved) == 20
    assert int(usage.ai_actions_count) + int(usage.ai_credits_reserved) <= 200


def test_twenty_parallel_image_reservations_publish_only_four_on_postgres(
    postgres_engine,
):
    """The owner-row CAS admits only the configured number of publishers."""

    from app.crud.images import reserve_image_slot
    from app.models.models import Image, User

    Session = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    unique = uuid4().hex
    with Session() as db:
        user = User(
            username=f"pg-images-{unique[:12]}",
            email=f"pg-images-{unique}@example.test",
            hashed_password="unused",
            is_active=True,
        )
        db.add(user)
        db.commit()
        user_id = int(user.id)

    start = Barrier(20)
    publish_lock = Lock()
    published: list[int] = []

    def attempt(index: int) -> str:
        with Session() as db:
            start.wait(timeout=30)
            if not reserve_image_slot(db, owner_id=user_id, limit=4):
                db.rollback()
                return "rejected"
            # Crossing this point models entry into put_image_bytes. Holding the
            # reservation transaction until metadata commit is the production
            # saga invariant under test.
            with publish_lock:
                published.append(index)
            db.add(Image(
                filename=f"parallel-{index}.png",
                file_path=f"images/{user_id}/{index:032x}.png",
                file_size=40,
                mime_type="image/png",
                owner_id=user_id,
            ))
            db.commit()
            return "published"

    with ThreadPoolExecutor(max_workers=20) as executor:
        outcomes = list(executor.map(attempt, range(20)))

    with Session() as db:
        image_count = db.query(Image).filter(Image.owner_id == user_id).count()
        slot_count = db.query(User.image_slots_used).filter(
            User.id == user_id
        ).scalar()

    assert outcomes.count("published") == 4
    assert outcomes.count("rejected") == 16
    assert len(published) == 4
    assert image_count == 4
    assert slot_count == 4
