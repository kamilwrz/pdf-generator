"""N-1 compatibility coverage for auth hardening migration 0011."""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260901_0010"
AUTH_HARDENING_REVISION = "20260901_0011"


class AuthHardeningMigrationTests(unittest.TestCase):
    """Keep canonical uniqueness without blocking writes from N-1 workers."""

    def _create_previous_database(self, database_path: Path) -> None:
        connection = sqlite3.connect(database_path)
        try:
            connection.executescript(
                f"""
                CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                INSERT INTO alembic_version (version_num) VALUES ('{PREVIOUS_REVISION}');
                CREATE TABLE users (
                    id INTEGER NOT NULL PRIMARY KEY,
                    username VARCHAR UNIQUE,
                    email VARCHAR UNIQUE,
                    hashed_password VARCHAR,
                    is_active BOOLEAN
                );
                INSERT INTO users (id, username, email, hashed_password, is_active)
                VALUES (1, 'Case.User', 'Owner@Example.Test', 'hash', 1);
                """
            )
            connection.commit()
        finally:
            connection.close()

    def _upgrade(self, database_path: Path) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
        return subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", AUTH_HARDENING_REVISION],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )

    def test_backfill_is_unique_while_new_columns_remain_nullable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "auth-hardening.db"
            self._create_previous_database(database_path)
            upgraded = self._upgrade(database_path)
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT username_canonical, email_canonical FROM users WHERE id = 1"
                    ).fetchone(),
                    ("case.user", "owner@example.test"),
                )
                columns = {
                    row[1]: row for row in connection.execute("PRAGMA table_info(users)")
                }
                self.assertEqual(columns["username_canonical"][3], 0)
                self.assertEqual(columns["email_canonical"][3], 0)
                self.assertEqual(columns["argon2_password_hash"][3], 0)
                self.assertIsNone(
                    connection.execute(
                        "SELECT argon2_password_hash FROM users WHERE id = 1"
                    ).fetchone()[0]
                )

                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO users "
                        "(id, username, username_canonical, email, email_canonical) "
                        "VALUES (2, 'Other', 'case.user', 'other@example.test', "
                        "'other@example.test')"
                    )
                connection.execute(
                    "INSERT INTO users "
                    "(id, username, username_canonical, email, email_canonical) "
                    "VALUES (3, 'N1-A', NULL, 'n1-a@example.test', NULL)"
                )
                connection.execute(
                    "INSERT INTO users "
                    "(id, username, username_canonical, email, email_canonical) "
                    "VALUES (4, 'N1-B', NULL, 'n1-b@example.test', NULL)"
                )
                connection.commit()

                index_names = [
                    row[1] for row in connection.execute("PRAGMA index_list(users)")
                ]
                self.assertEqual(index_names.count("ix_users_username_canonical"), 1)
                self.assertEqual(index_names.count("ix_users_email_canonical"), 1)
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
