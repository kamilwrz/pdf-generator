"""Regression tests for SQLite import-history migration recovery."""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
IMPORT_HISTORY_REVISION = "20260824_0005"


class ImportHistoryMigrationTests(unittest.TestCase):
    """Verify clean and partially committed SQLite upgrades to revision 0005."""

    def _create_pre_migration_database(
        self,
        database_path: Path,
        *,
        partially_applied: bool,
    ) -> None:
        """Create the minimum revision-0004 schema needed by migration 0005."""
        connection = sqlite3.connect(database_path)
        try:
            connection.executescript(
                """
                PRAGMA foreign_keys = ON;
                CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                INSERT INTO alembic_version (version_num) VALUES ('20260809_0004');
                CREATE TABLE users (id INTEGER NOT NULL PRIMARY KEY);
                CREATE TABLE pdfs (
                    id INTEGER NOT NULL PRIMARY KEY,
                    owner_id INTEGER,
                    FOREIGN KEY(owner_id) REFERENCES users (id)
                );
                """
            )
            if partially_applied:
                # SQLite commits DDL outside Alembic's logical transaction. This
                # reproduces the exact state left by the former migration: the
                # new table and column exist, but the FK/index and revision do not.
                connection.executescript(
                    """
                    CREATE TABLE cv_import_snapshots (
                        id INTEGER NOT NULL PRIMARY KEY,
                        owner_id INTEGER NOT NULL,
                        source_filename VARCHAR(255) NOT NULL,
                        source_size_bytes INTEGER NOT NULL,
                        status VARCHAR(24) NOT NULL,
                        cv_data JSON,
                        error_code VARCHAR(64),
                        created_at DATETIME NOT NULL,
                        completed_at DATETIME,
                        deleted_at DATETIME,
                        FOREIGN KEY(owner_id) REFERENCES users (id)
                    );
                    CREATE INDEX ix_cv_import_snapshots_owner_created
                        ON cv_import_snapshots (owner_id, created_at);
                    CREATE INDEX ix_cv_import_snapshots_owner_status
                        ON cv_import_snapshots (owner_id, status);
                    ALTER TABLE pdfs ADD COLUMN source_import_id INTEGER;
                    """
                )
            connection.commit()
        finally:
            connection.close()

    def _run_upgrade(self, database_path: Path) -> subprocess.CompletedProcess[str]:
        """Run Alembic in an isolated process so app configuration is reloaded."""
        environment = os.environ.copy()
        environment["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
        return subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", IMPORT_HISTORY_REVISION],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def _assert_repaired_schema(self, database_path: Path) -> None:
        """Assert that all objects owned by revision 0005 are present."""
        connection = sqlite3.connect(database_path)
        try:
            self.assertEqual(
                connection.execute("SELECT version_num FROM alembic_version").fetchone(),
                (IMPORT_HISTORY_REVISION,),
            )
            self.assertIsNotNone(
                connection.execute(
                    "SELECT name FROM sqlite_master "
                    "WHERE type = 'table' AND name = 'cv_import_snapshots'"
                ).fetchone()
            )
            pdf_columns = {
                row[1] for row in connection.execute("PRAGMA table_info(pdfs)")
            }
            self.assertIn("source_import_id", pdf_columns)
            source_foreign_keys = [
                row
                for row in connection.execute("PRAGMA foreign_key_list(pdfs)")
                if row[2] == "cv_import_snapshots" and row[3] == "source_import_id"
            ]
            self.assertEqual(len(source_foreign_keys), 1)
            pdf_indexes = {
                row[1] for row in connection.execute("PRAGMA index_list(pdfs)")
            }
            self.assertIn("ix_pdfs_source_import_id", pdf_indexes)
        finally:
            connection.close()

    def test_clean_sqlite_upgrade_creates_relation(self) -> None:
        """A revision-0004 SQLite database upgrades without ALTER FK errors."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "clean.db"
            self._create_pre_migration_database(
                database_path,
                partially_applied=False,
            )

            result = self._run_upgrade(database_path)

            self.assertEqual(result.returncode, 0, result.stderr)
            self._assert_repaired_schema(database_path)

    def test_partial_sqlite_upgrade_repairs_missing_relation(self) -> None:
        """A failed former run resumes without duplicating committed objects."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "partial.db"
            self._create_pre_migration_database(
                database_path,
                partially_applied=True,
            )

            result = self._run_upgrade(database_path)

            self.assertEqual(result.returncode, 0, result.stderr)
            self._assert_repaired_schema(database_path)


if __name__ == "__main__":
    unittest.main()
