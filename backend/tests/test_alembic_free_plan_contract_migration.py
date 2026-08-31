"""Regression coverage for the production Free-plan data migration."""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260829_0007"
FREE_PLAN_REVISION = "20260831_0008"


class FreePlanContractMigrationTests(unittest.TestCase):
    """Verify quota updates without losing the legacy-file repair marker."""

    def _create_previous_database(self, database_path: Path) -> None:
        """Create the minimal revision-0007 catalog and one legacy PDF row."""
        connection = sqlite3.connect(database_path)
        try:
            connection.executescript(
                f"""
                CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                INSERT INTO alembic_version (version_num) VALUES ('{PREVIOUS_REVISION}');
                CREATE TABLE plans (
                    id INTEGER NOT NULL PRIMARY KEY,
                    slug VARCHAR(32) NOT NULL,
                    max_projects INTEGER,
                    max_exports_per_month INTEGER,
                    max_ai_actions_per_month INTEGER,
                    max_cv_imports_per_month INTEGER,
                    ai_assistant BOOLEAN NOT NULL,
                    extract_cv BOOLEAN NOT NULL,
                    template_tier VARCHAR(32) NOT NULL,
                    is_active BOOLEAN NOT NULL
                );
                INSERT INTO plans VALUES (1, 'free', 1, 3, 0, 3, 0, 1, 'starter', 1);
                INSERT INTO plans VALUES (2, 'pro', NULL, NULL, 200, NULL, 1, 1, 'all', 1);
                CREATE TABLE pdfs (
                    id INTEGER NOT NULL PRIMARY KEY,
                    watermarked BOOLEAN NOT NULL
                );
                INSERT INTO pdfs VALUES (1, 1);
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
        """Run Alembic in isolation so the temporary URL is loaded at import."""
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

    def test_upgrade_and_downgrade_update_only_the_free_import_allowance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "free-plan.db"
            self._create_previous_database(database_path)

            upgraded = self._run_alembic(
                database_path,
                "upgrade",
                FREE_PLAN_REVISION,
            )
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                free = connection.execute(
                    "SELECT max_projects, max_exports_per_month, "
                    "max_ai_actions_per_month, max_cv_imports_per_month, "
                    "ai_assistant, extract_cv, template_tier, is_active "
                    "FROM plans WHERE slug = 'free'"
                ).fetchone()
                self.assertEqual(free, (1, 3, 0, 1, 0, 1, "starter", 1))
                self.assertEqual(
                    connection.execute(
                        "SELECT max_cv_imports_per_month FROM plans WHERE slug = 'pro'"
                    ).fetchone(),
                    (None,),
                )
                # The file still contains the old overlay. Only the download
                # repair flow may clear this marker after rebuilding the bytes.
                self.assertEqual(
                    connection.execute(
                        "SELECT watermarked FROM pdfs WHERE id = 1"
                    ).fetchone(),
                    (1,),
                )
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
                self.assertEqual(
                    connection.execute(
                        "SELECT max_cv_imports_per_month FROM plans WHERE slug = 'free'"
                    ).fetchone(),
                    (3,),
                )
                self.assertEqual(
                    connection.execute("SELECT watermarked FROM pdfs WHERE id = 1").fetchone(),
                    (1,),
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
