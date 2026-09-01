"""Upgrade/downgrade coverage for N-1 document-write compatibility."""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, Pdf, PdfElements, User
from app.schemas.pdf_schema import PDFUpdateRequest
from app.services import document_service


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260901_0014"
N1_DOCUMENT_WRITES_REVISION = "20260901_0015"


class N1DocumentWritesMigrationTests(unittest.TestCase):
    """Protect revisions and title keys when an older worker writes rows."""

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

    @staticmethod
    def _create_previous_database(database_path: Path) -> None:
        connection = sqlite3.connect(database_path)
        try:
            connection.executescript(
                f"""
                CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
                INSERT INTO alembic_version (version_num)
                VALUES ('{PREVIOUS_REVISION}');
                CREATE TABLE pdfs (
                    id INTEGER NOT NULL PRIMARY KEY,
                    title VARCHAR,
                    title_key VARCHAR(140),
                    owner_id INTEGER,
                    revision INTEGER DEFAULT 1 NOT NULL,
                    updated_at DATETIME,
                    CONSTRAINT uq_pdf_owner_title_key
                        UNIQUE (owner_id, title_key)
                );
                CREATE TABLE pdf_elements (
                    id INTEGER NOT NULL PRIMARY KEY,
                    pdf_id INTEGER REFERENCES pdfs(id),
                    element_id VARCHAR,
                    content VARCHAR
                );
                INSERT INTO pdfs
                    (id, title, title_key, owner_id, revision, updated_at)
                VALUES
                    (1, 'Resume', 'resume', 7, 1, CURRENT_TIMESTAMP),
                    (9, 'Unkeyed', NULL, 7, 4, CURRENT_TIMESTAMP);
                INSERT INTO pdf_elements (id, pdf_id, element_id, content)
                VALUES (1, 1, 'summary', 'before');
                """
            )
            connection.commit()
        finally:
            connection.close()

    def test_n1_writes_cannot_bypass_revision_or_title_key_contracts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "n1-document-writes.db"
            self._create_previous_database(database_path)
            upgraded = self._run_alembic(
                database_path,
                "upgrade",
                N1_DOCUMENT_WRITES_REVISION,
            )
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            connection = sqlite3.connect(database_path)
            try:
                revision_default = next(
                    row[4]
                    for row in connection.execute("PRAGMA table_info(pdfs)")
                    if row[1] == "revision"
                )
                self.assertIn("1", str(revision_default))
                # Migration-time repair invalidates stale clients and gives the
                # pre-existing null-key row a stable, bounded key.
                self.assertEqual(
                    connection.execute(
                        "SELECT title_key, revision FROM pdfs WHERE id = 9"
                    ).fetchone(),
                    ("unkeyed", 5),
                )

                # This is the exact metadata + elements shape emitted by the
                # N-1 autosave route: it knows neither title_key nor revision.
                connection.execute(
                    "UPDATE pdfs SET updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                )
                connection.execute(
                    "UPDATE pdf_elements SET content = 'legacy save' WHERE id = 1"
                )
                connection.commit()
                self.assertEqual(
                    connection.execute(
                        "SELECT revision FROM pdfs WHERE id = 1"
                    ).fetchone(),
                    (2,),
                )

                # A current worker's expected_revision=1 compare-and-swap must
                # now lose; the service maps this zero-row claim to HTTP 409.
                claim = connection.execute(
                    "UPDATE pdfs SET title = 'Current overwrite', "
                    "title_key = 'current overwrite', revision = 2 "
                    "WHERE id = 1 AND revision = 1"
                )
                self.assertEqual(claim.rowcount, 0)

                # Explicit current-worker +1 updates are not incremented twice.
                connection.execute(
                    "UPDATE pdfs SET revision = revision + 1 WHERE id = 1"
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT revision FROM pdfs WHERE id = 1"
                    ).fetchone(),
                    (3,),
                )

                # N-1 creates omit both new columns. The trigger materializes a
                # non-null key and deterministically suffixes a title collision.
                connection.execute(
                    "INSERT INTO pdfs (id, title, owner_id, updated_at) "
                    "VALUES (2, 'RESUME', 7, CURRENT_TIMESTAMP)"
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT title_key, revision FROM pdfs WHERE id = 2"
                    ).fetchone(),
                    ("resume~2", 2),
                )

                # A legacy title change re-keys the row and advances exactly
                # one revision; unrelated later writes keep the stable suffix.
                connection.execute(
                    "UPDATE pdfs SET title = 'Portfolio' WHERE id = 2"
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT title_key, revision FROM pdfs WHERE id = 2"
                    ).fetchone(),
                    ("portfolio", 3),
                )
                connection.execute(
                    "UPDATE pdfs SET title = 'resume' WHERE id = 2"
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT title_key, revision FROM pdfs WHERE id = 2"
                    ).fetchone(),
                    ("resume~2", 4),
                )
                connection.execute(
                    "UPDATE pdfs SET updated_at = CURRENT_TIMESTAMP WHERE id = 2"
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT title_key, revision FROM pdfs WHERE id = 2"
                    ).fetchone(),
                    ("resume~2", 5),
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT COUNT(*) FROM pdfs WHERE title_key IS NULL"
                    ).fetchone(),
                    (0,),
                )
                connection.commit()
            finally:
                connection.close()

    def test_n1_autosave_forces_current_service_to_return_document_conflict(
        self,
    ) -> None:
        """A stale current snapshot cannot overwrite a committed N-1 save."""

        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "n1-service-conflict.db"
            engine = create_engine(f"sqlite:///{database_path.as_posix()}")
            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO alembic_version (version_num) VALUES (?)",
                    (PREVIOUS_REVISION,),
                )
            upgraded = self._run_alembic(
                database_path,
                "upgrade",
                N1_DOCUMENT_WRITES_REVISION,
            )
            self.assertEqual(upgraded.returncode, 0, upgraded.stderr)

            Session = sessionmaker(bind=engine, expire_on_commit=False)
            db = Session()
            try:
                user = User(
                    username="n1-owner",
                    email="n1-owner@example.test",
                    hashed_password="unused",
                    argon2_password_hash="unused",
                )
                db.add(user)
                db.flush()
                pdf = Pdf(
                    title="Shared draft",
                    title_key="shared draft",
                    owner_id=user.id,
                    revision=1,
                    pages=1,
                    page_width=595,
                    page_height=842,
                    editor_mode="freeform",
                )
                db.add(pdf)
                db.flush()
                db.add(
                    PdfElements(
                        pdf_id=pdf.id,
                        element_id="summary",
                        category="text",
                        page=1,
                        content="before",
                    )
                )
                db.commit()
                stale_pdf = pdf

                legacy = sqlite3.connect(database_path)
                try:
                    legacy.execute(
                        "UPDATE pdfs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (pdf.id,),
                    )
                    legacy.execute(
                        "UPDATE pdf_elements SET content = 'N-1 winner' "
                        "WHERE pdf_id = ? AND element_id = 'summary'",
                        (pdf.id,),
                    )
                    legacy.commit()
                finally:
                    legacy.close()

                payload = PDFUpdateRequest.model_validate(
                    {
                        "pdf_id": pdf.id,
                        "expected_revision": 1,
                        "pdf_title": "Shared draft",
                        "root": [
                            {
                                "category": "text",
                                "element_id": "summary",
                                "page": 1,
                                "content": "stale current overwrite",
                            }
                        ],
                        "pages": 1,
                        "page_width": 595,
                        "page_height": 842,
                        "editor_mode": "freeform",
                        "template_id": None,
                    }
                )
                with self.assertRaises(HTTPException) as raised:
                    document_service.save_pdf_elements_document(
                        db,
                        pdf_row=stale_pdf,
                        user=user,
                        pdf_data=payload,
                    )
                self.assertEqual(raised.exception.status_code, 409)
                self.assertEqual(
                    raised.exception.detail["code"],
                    "document_conflict",
                )
                self.assertEqual(raised.exception.detail["current_revision"], 2)

                with engine.connect() as connection:
                    self.assertEqual(
                        connection.exec_driver_sql(
                            "SELECT content FROM pdf_elements "
                            "WHERE pdf_id = ? AND element_id = 'summary'",
                            (pdf.id,),
                        ).scalar_one(),
                        "N-1 winner",
                    )
            finally:
                db.close()
                engine.dispose()

            downgraded = self._run_alembic(
                database_path,
                "downgrade",
                PREVIOUS_REVISION,
            )
            self.assertEqual(downgraded.returncode, 0, downgraded.stderr)
            connection = sqlite3.connect(database_path)
            try:
                trigger_names = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'trigger'"
                    )
                }
                self.assertNotIn("trg_pdfs_n1_insert_contract", trigger_names)
                self.assertNotIn("trg_pdfs_n1_update_contract", trigger_names)
                before = connection.execute(
                    "SELECT revision FROM pdfs WHERE id = 1"
                ).fetchone()
                connection.execute(
                    "UPDATE pdfs SET updated_at = CURRENT_TIMESTAMP WHERE id = 1"
                )
                after = connection.execute(
                    "SELECT revision FROM pdfs WHERE id = 1"
                ).fetchone()
                self.assertEqual(after, before)
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
