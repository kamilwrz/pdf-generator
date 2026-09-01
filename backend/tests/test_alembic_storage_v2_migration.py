"""Upgrade/downgrade coverage for the Storage V2 database contract."""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260831_0008"
STORAGE_V2_REVISION = "20260901_0009"


class StorageV2MigrationTests(unittest.TestCase):
    """Preserve legacy locators while adding V2 pointers and cleanup jobs."""

    def _create_previous_database(self, database_path: Path) -> None:
        connection = sqlite3.connect(database_path)
        try:
            connection.executescript(
                f"""
                CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                INSERT INTO alembic_version (version_num) VALUES ('{PREVIOUS_REVISION}');
                CREATE TABLE pdfs (
                    id INTEGER NOT NULL PRIMARY KEY,
                    file_path VARCHAR,
                    owner_id INTEGER
                );
                INSERT INTO pdfs (id, file_path, owner_id)
                VALUES (7, 'static/generated/owner/legacy.pdf', 3);
                """
            )
            connection.commit()
        finally:
            connection.close()

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

    def test_upgrade_preserves_legacy_path_and_downgrade_removes_only_v2_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "storage-v2.db"
            self._create_previous_database(database_path)

            upgraded = self._run_alembic(
                database_path,
                "upgrade",
                STORAGE_V2_REVISION,
            )
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                pdf_columns = {
                    row[1] for row in connection.execute("PRAGMA table_info(pdfs)")
                }
                self.assertTrue({"storage_backend", "storage_key"}.issubset(pdf_columns))
                self.assertEqual(
                    connection.execute(
                        "SELECT file_path, storage_backend, storage_key FROM pdfs WHERE id = 7"
                    ).fetchone(),
                    ("static/generated/owner/legacy.pdf", None, None),
                )
                cleanup_columns = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info(storage_cleanup_jobs)"
                    )
                }
                self.assertEqual(
                    cleanup_columns,
                    {
                        "id",
                        "storage_backend",
                        "storage_key",
                        "attempts",
                        "next_attempt_at",
                        "last_error",
                        "created_at",
                    },
                )
                index_rows = connection.execute("PRAGMA index_list(pdfs)").fetchall()
                storage_index = next(
                    row for row in index_rows if row[1] == "ix_pdfs_storage_key"
                )
                self.assertEqual(storage_index[2], 1)
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
                pdf_columns = {
                    row[1] for row in connection.execute("PRAGMA table_info(pdfs)")
                }
                self.assertNotIn("storage_backend", pdf_columns)
                self.assertNotIn("storage_key", pdf_columns)
                self.assertEqual(
                    connection.execute(
                        "SELECT file_path FROM pdfs WHERE id = 7"
                    ).fetchone(),
                    ("static/generated/owner/legacy.pdf",),
                )
                self.assertIsNone(
                    connection.execute(
                        "SELECT name FROM sqlite_master "
                        "WHERE type = 'table' AND name = 'storage_cleanup_jobs'"
                    ).fetchone()
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
