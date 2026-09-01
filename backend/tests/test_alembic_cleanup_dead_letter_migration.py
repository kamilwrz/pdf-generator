"""Upgrade/downgrade coverage for cleanup retry-state migration 0013."""
from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260901_0012"
CLEANUP_REVISION = "20260901_0013"


class CleanupDeadLetterMigrationTests(unittest.TestCase):
    """Keep old outbox rows and the N-1 insert shape valid."""

    def _run_alembic(
        self,
        database_path: Path,
        command: str,
        revision: str,
    ) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
        return subprocess.run(
            [sys.executable, "-m", "alembic", command, revision],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_upgrade_backfills_defaults_and_downgrade_preserves_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "cleanup-dead-letter.db"
            connection = sqlite3.connect(database_path)
            try:
                connection.executescript(
                    f"""
                    CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                    INSERT INTO alembic_version (version_num)
                    VALUES ('{PREVIOUS_REVISION}');
                    CREATE TABLE storage_cleanup_jobs (
                        id INTEGER NOT NULL PRIMARY KEY,
                        storage_backend VARCHAR(16) NOT NULL,
                        storage_key VARCHAR(255) NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        next_attempt_at DATETIME,
                        last_error TEXT,
                        created_at DATETIME NOT NULL,
                        CONSTRAINT uq_storage_cleanup_backend_key
                            UNIQUE (storage_backend, storage_key)
                    );
                    INSERT INTO storage_cleanup_jobs
                        (id, storage_backend, storage_key, attempts, created_at)
                    VALUES
                        (1, 'local',
                         'pdfs/1/1/11111111111111111111111111111111.pdf',
                         2, CURRENT_TIMESTAMP);
                    """
                )
                connection.commit()
            finally:
                connection.close()

            upgraded = self._run_alembic(
                database_path,
                "upgrade",
                CLEANUP_REVISION,
            )
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                columns = {
                    row[1] for row in connection.execute(
                        "PRAGMA table_info(storage_cleanup_jobs)"
                    )
                }
                self.assertTrue({"resource_kind", "status", "terminal_at"} <= columns)
                self.assertEqual(
                    connection.execute(
                        "SELECT resource_kind, status, attempts "
                        "FROM storage_cleanup_jobs WHERE id = 1"
                    ).fetchone(),
                    ("pdf", "pending", 2),
                )
                # Simulate an N-1 worker which still omits all 0013 columns.
                connection.execute(
                    "INSERT INTO storage_cleanup_jobs "
                    "(id, storage_backend, storage_key, attempts, created_at) "
                    "VALUES (2, 'local', ?, 0, CURRENT_TIMESTAMP)",
                    ("pdfs/1/1/22222222222222222222222222222222.pdf",),
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT resource_kind, status FROM storage_cleanup_jobs "
                        "WHERE id = 2"
                    ).fetchone(),
                    ("pdf", "pending"),
                )
                indexes = {
                    row[1] for row in connection.execute(
                        "PRAGMA index_list(storage_cleanup_jobs)"
                    )
                }
                self.assertIn(
                    "ix_storage_cleanup_jobs_status_next_attempt",
                    indexes,
                )
                connection.commit()
            finally:
                connection.close()

            downgraded = self._run_alembic(
                database_path,
                "downgrade",
                PREVIOUS_REVISION,
            )
            self.assertEqual(downgraded.returncode, 0, downgraded.stderr)
            connection = sqlite3.connect(database_path)
            try:
                columns = {
                    row[1] for row in connection.execute(
                        "PRAGMA table_info(storage_cleanup_jobs)"
                    )
                }
                self.assertFalse(
                    {"resource_kind", "status", "terminal_at"} & columns
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT COUNT(*) FROM storage_cleanup_jobs"
                    ).fetchone(),
                    (2,),
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
