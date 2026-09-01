"""Upgrade/downgrade coverage for document integrity migration 0012."""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260901_0011"
DOCUMENT_INTEGRITY_REVISION = "20260901_0012"


class DocumentIntegrityMigrationTests(unittest.TestCase):
    """Backfill colliding titles without changing their display values."""

    def _create_previous_database(self, database_path: Path) -> None:
        connection = sqlite3.connect(database_path)
        try:
            long_title = "Ż" * 150
            connection.executescript(
                f"""
                CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                INSERT INTO alembic_version (version_num) VALUES ('{PREVIOUS_REVISION}');
                CREATE TABLE pdfs (
                    id INTEGER NOT NULL PRIMARY KEY,
                    title VARCHAR,
                    file_path VARCHAR,
                    owner_id INTEGER,
                    template_id VARCHAR
                );
                INSERT INTO pdfs (id, title, owner_id, template_id)
                VALUES
                    (1, 'Resume', 7, 'sterling'),
                    (2, 'resume~4', 7, NULL),
                    (4, 'RESUME', 7, NULL),
                    (5, '{long_title}', 7, NULL),
                    (6, 'Resume', 8, NULL);
                """
            )
            connection.commit()
        finally:
            connection.close()

    def _run_alembic(
        self, database_path: Path, command: str, revision: str,
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

    def test_backfill_suffixes_collisions_and_downgrade_preserves_titles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "document-integrity.db"
            self._create_previous_database(database_path)
            upgraded = self._run_alembic(
                database_path, "upgrade", DOCUMENT_INTEGRITY_REVISION,
            )
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                rows = connection.execute(
                    "SELECT id, title, title_key, revision, origin_template_id "
                    "FROM pdfs ORDER BY id"
                ).fetchall()
                keys = [row[2] for row in rows if row[0] != 6]
                self.assertEqual(len(keys), len(set(keys)))
                self.assertEqual(rows[0][2], "resume")
                self.assertEqual(rows[2][2], "resume~4-1")
                self.assertEqual(rows[0][3:], (1, "sterling"))
                self.assertTrue(all(len(row[2]) <= 140 for row in rows))
                self.assertEqual(rows[0][1], "Resume")
                self.assertEqual(rows[2][1], "RESUME")
                title_key_column = next(
                    row
                    for row in connection.execute("PRAGMA table_info(pdfs)")
                    if row[1] == "title_key"
                )
                self.assertEqual(title_key_column[3], 0)

                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO pdfs "
                        "(id, title, title_key, owner_id, revision) "
                        "VALUES (9, 'duplicate', 'resume', 7, 1)"
                    )
                # N-1 workers omit title_key. Multiple nulls must remain legal
                # until a later finalization migration closes the compatibility
                # window; current workers still use the non-null unique path.
                connection.execute(
                    "INSERT INTO pdfs (id, title, title_key, owner_id, revision) "
                    "VALUES (10, 'legacy-a', NULL, 7, 1)"
                )
                connection.execute(
                    "INSERT INTO pdfs (id, title, title_key, owner_id, revision) "
                    "VALUES (11, 'legacy-b', NULL, 7, 1)"
                )
                connection.commit()
            finally:
                connection.close()

            downgraded = self._run_alembic(
                database_path, "downgrade", PREVIOUS_REVISION,
            )
            self.assertEqual(downgraded.returncode, 0, downgraded.stderr)
            connection = sqlite3.connect(database_path)
            try:
                columns = {
                    row[1] for row in connection.execute("PRAGMA table_info(pdfs)")
                }
                self.assertFalse(
                    {
                        "title_key",
                        "revision",
                        "origin_template_id",
                        "create_idempotency_key",
                        "create_request_hash",
                    }
                    & columns
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT title FROM pdfs WHERE id = 4"
                    ).fetchone(),
                    ("RESUME",),
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
