"""Upgrade and downgrade coverage for identity/payment migration 0016."""
from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260901_0015"
AUTH_BILLING_REVISION = "20260909_0016"


class AuthBillingMigrationTests(unittest.TestCase):
    """Grandfather existing users and install the idempotency constraints."""

    def _run_alembic(self, database_path: Path, command: str, revision: str) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
        return subprocess.run(
            [sys.executable, "-m", "alembic", command, revision],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )

    def test_upgrade_backfills_users_and_enforces_payment_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "auth-billing.db"
            connection = sqlite3.connect(database_path)
            try:
                connection.executescript(
                    f"""
                    CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                    INSERT INTO alembic_version (version_num) VALUES ('{PREVIOUS_REVISION}');
                    CREATE TABLE users (
                        id INTEGER NOT NULL PRIMARY KEY,
                        created_at DATETIME
                    );
                    CREATE TABLE payments (
                        id INTEGER NOT NULL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id),
                        provider VARCHAR,
                        provider_ref VARCHAR,
                        plan_slug VARCHAR,
                        amount_cents INTEGER,
                        currency VARCHAR,
                        status VARCHAR,
                        raw TEXT,
                        created_at DATETIME
                    );
                    INSERT INTO users (id, created_at) VALUES (1, '2026-09-01 10:00:00');
                    """
                )
                connection.commit()
            finally:
                connection.close()

            upgraded = self._run_alembic(database_path, "upgrade", AUTH_BILLING_REVISION)
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                user = connection.execute(
                    "SELECT email_verified_at, google_sub FROM users WHERE id = 1"
                ).fetchone()
                self.assertEqual(user, ("2026-09-01 10:00:00", None))
                self.assertIn(
                    "email_verification_tokens",
                    {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                )
                connection.execute(
                    "INSERT INTO payments (id, user_id, provider, provider_ref, provider_event_id) "
                    "VALUES (1, 1, 'stripe', 'cs_test_1', 'evt_test_1')"
                )
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO payments (id, user_id, provider, provider_ref) "
                        "VALUES (2, 1, 'stripe', 'cs_test_1')"
                    )
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO payments (id, user_id, provider_event_id) "
                        "VALUES (3, 1, 'evt_test_1')"
                    )
            finally:
                connection.close()

            downgraded = self._run_alembic(database_path, "downgrade", PREVIOUS_REVISION)
            self.assertEqual(downgraded.returncode, 0, downgraded.stderr)
            connection = sqlite3.connect(database_path)
            try:
                self.assertNotIn(
                    "email_verified_at",
                    {row[1] for row in connection.execute("PRAGMA table_info(users)")},
                )
                self.assertNotIn(
                    "email_verification_tokens",
                    {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
