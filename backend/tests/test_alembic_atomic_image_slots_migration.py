"""Upgrade/downgrade coverage for atomic image-slot migration 0014."""
from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260901_0013"
IMAGE_SLOT_REVISION = "20260901_0014"


class AtomicImageSlotMigrationTests(unittest.TestCase):
    """Backfill real ownership counts and retain the N-1 insert shape."""

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

    def test_upgrade_backfills_counts_and_downgrade_preserves_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "atomic-image-slots.db"
            connection = sqlite3.connect(database_path)
            try:
                connection.executescript(
                    f"""
                    CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                    INSERT INTO alembic_version (version_num)
                    VALUES ('{PREVIOUS_REVISION}');
                    CREATE TABLE users (
                        id INTEGER NOT NULL PRIMARY KEY,
                        username VARCHAR UNIQUE
                    );
                    CREATE TABLE images (
                        id INTEGER NOT NULL PRIMARY KEY,
                        owner_id INTEGER REFERENCES users(id)
                    );
                    CREATE TABLE pdf_elements (
                        id INTEGER NOT NULL PRIMARY KEY,
                        img_id INTEGER REFERENCES images(id),
                        src VARCHAR
                    );
                    INSERT INTO users (id, username)
                    VALUES (1, 'owner'), (2, 'empty');
                    INSERT INTO images (id, owner_id)
                    VALUES (1, 1), (2, 1), (3, 1);
                    INSERT INTO pdf_elements (id, img_id, src)
                    VALUES
                        (10, 1, '/images/1/content'),
                        (11, 999, '/images/999/content');
                    """
                )
                connection.commit()
            finally:
                connection.close()

            upgraded = self._run_alembic(
                database_path,
                "upgrade",
                IMAGE_SLOT_REVISION,
            )
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                columns = {
                    row[1]: row for row in connection.execute(
                        "PRAGMA table_info(users)"
                    )
                }
                self.assertEqual(columns["image_slots_used"][3], 1)
                self.assertIn("0", str(columns["image_slots_used"][4]))
                self.assertEqual(
                    connection.execute(
                        "SELECT id, image_slots_used FROM users ORDER BY id"
                    ).fetchall(),
                    [(1, 3), (2, 0)],
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT id, img_id, src FROM pdf_elements ORDER BY id"
                    ).fetchall(),
                    [
                        (10, 1, "/images/1/content"),
                        (11, None, "/images/999/content"),
                    ],
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT pdf_element_id, missing_image_id "
                        "FROM image_reference_quarantine"
                    ).fetchall(),
                    [(11, 999)],
                )
                # An N-1 worker can still create an account without naming the
                # new column; reservations reconcile later image inserts.
                connection.execute(
                    "INSERT INTO users (id, username) VALUES (3, 'n1-worker')"
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT image_slots_used FROM users WHERE id = 3"
                    ).fetchone(),
                    (0,),
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
                        "PRAGMA table_info(users)"
                    )
                }
                self.assertNotIn("image_slots_used", columns)
                self.assertEqual(
                    connection.execute("SELECT COUNT(*) FROM users").fetchone(),
                    (3,),
                )
                self.assertEqual(
                    connection.execute("SELECT COUNT(*) FROM images").fetchone(),
                    (3,),
                )
                # Downgrade intentionally retains the only preserved copy of a
                # legacy invalid id instead of recreating the FK violation.
                self.assertEqual(
                    connection.execute(
                        "SELECT pdf_element_id, missing_image_id "
                        "FROM image_reference_quarantine"
                    ).fetchall(),
                    [(11, 999)],
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
