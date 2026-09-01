"""Saved local PDFs stay private behind the metered download endpoint."""

from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.routing import Mount

from app.api.routes import pdf as pdf_route
from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Pdf, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services import document_service as doc_service
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _payload(title: str, pdf_id: int | None = None) -> dict:
    """Return a minimal valid canvas payload for real local PDF persistence."""
    payload = {
        "root": [
            {
                "category": "text",
                "element_id": "private-text",
                "page": 1,
                "left": 24,
                "top": 24,
                "content": "Private CV",
                "fontFamily": "Inter",
                "fontSize": 12,
                "color": "#111111",
            }
        ],
        "pdf_title": title,
        "pages": 1,
        "page_width": 595,
        "page_height": 842,
    }
    if pdf_id is not None:
        payload["pdf_id"] = pdf_id
        payload["expected_revision"] = 1
    return payload


class GeneratedPdfPrivacyTests(unittest.TestCase):
    """Exercise storage, response redaction, and the only byte-serving route."""

    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)
        user_crud.create_user(
            self.db,
            UserCreateRequest(
                username="private-owner",
                email="private-owner@example.com",
                password="correct horse battery",
            ),
        )
        self.user = self.db.query(User).filter(User.username == "private-owner").one()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "private-owner"}
        self.client = TestClient(app)

        self.storage = TemporaryDirectory()
        storage_root = Path(self.storage.name)
        patches = (
            patch.object(doc_service, "PDF_UPLOAD_DIR", storage_root),
            patch.object(doc_service, "USE_S3", False),
            patch.object(pdf_route, "USE_S3", False),
        )
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        self.storage.cleanup()

    def _exports_count(self) -> int:
        row = self.db.query(UsageCounter).filter(
            UsageCounter.user_id == self.user.id,
            UsageCounter.period_key == ent.current_period_key(),
        ).first()
        return int(row.exports_count) if row is not None else 0

    def test_generated_directory_is_not_a_public_static_mount(self):
        mount_paths = {
            route.path for route in app.routes if isinstance(route, Mount)
        }
        self.assertIn("/template-assets", mount_paths)
        self.assertNotIn("/static/generated", mount_paths)

        self.assertEqual(self.client.get("/static/generated").status_code, 404)
        self.assertEqual(
            self.client.get("/static/generated/any-user/any-cv.pdf").status_code,
            404,
        )

    def test_save_responses_and_document_metadata_never_expose_storage(self):
        created = self.client.post(
            "/pdf/create_pdf",
            json=_payload("private.pdf"),
            headers={"Idempotency-Key": "privacy-metadata-create"},
        )
        self.assertEqual(created.status_code, 200, msg=created.text)
        created_body = created.json()
        self.assertNotIn("link", created_body)
        self.assertNotIn("file_path", created_body)
        pdf_id = created_body["pdf_id"]

        pdf_row = self.db.query(Pdf).filter(Pdf.id == pdf_id).one()
        self.assertTrue(Path(pdf_row.file_path).is_file())

        listing = self.client.get("/pdf/fetch_pdfs")
        self.assertEqual(listing.status_code, 200, msg=listing.text)
        self.assertEqual(len(listing.json()), 1)
        self.assertNotIn("file_path", listing.json()[0])
        self.assertNotIn("watermarked", listing.json()[0])

        shown = self.client.post("/pdf/show_pdf", json=pdf_id)
        self.assertEqual(shown.status_code, 200, msg=shown.text)
        self.assertNotIn("file_path", shown.json()["document"])
        self.assertNotIn("watermarked", shown.json()["document"])

        updated = self.client.put(
            "/pdf/update_pdf",
            json=_payload("private-updated.pdf", pdf_id),
        )
        self.assertEqual(updated.status_code, 201, msg=updated.text)
        self.assertNotIn("link", updated.json())
        self.assertNotIn("file_path", updated.json())

    def test_only_authenticated_download_route_serves_and_meters_saved_bytes(self):
        created = self.client.post(
            "/pdf/create_pdf",
            json=_payload("private.pdf"),
            headers={"Idempotency-Key": "privacy-download-create"},
        )
        self.assertEqual(created.status_code, 200, msg=created.text)
        pdf_id = created.json()["pdf_id"]
        self.assertEqual(self._exports_count(), 0)

        guessed = self.client.get(
            "/static/generated/private-owner/private.pdf",
        )
        self.assertEqual(guessed.status_code, 404)
        self.assertNotIn(b"Private CV", guessed.content)
        self.assertEqual(self._exports_count(), 0)

        downloaded = self.client.post("/pdf/download_pdf", json=pdf_id)
        self.assertEqual(downloaded.status_code, 200, msg=downloaded.text)
        self.assertIn("application/pdf", downloaded.headers.get("content-type", ""))
        self.assertTrue(downloaded.content.startswith(b"%PDF"))
        self.assertEqual(self._exports_count(), 1)

    def test_delete_returns_cached_metadata_and_removes_private_object(self):
        created = self.client.post(
            "/pdf/create_pdf",
            json=_payload("delete-me.pdf"),
            headers={"Idempotency-Key": "privacy-delete-create"},
        )
        self.assertEqual(created.status_code, 200, msg=created.text)
        pdf_id = created.json()["pdf_id"]
        pdf_row = self.db.query(Pdf).filter(Pdf.id == pdf_id).one()
        stored_path = Path(pdf_row.file_path)
        self.assertTrue(stored_path.exists())

        deleted = self.client.request("DELETE", "/pdf/delete_pdf", json=pdf_id)

        self.assertEqual(deleted.status_code, 202, msg=deleted.text)
        self.assertEqual(deleted.json()["name"], "delete-me.pdf")
        self.assertEqual(deleted.json()["pdf_id"], pdf_id)
        self.assertIsNone(self.db.query(Pdf).filter(Pdf.id == pdf_id).first())
        self.assertFalse(stored_path.exists())


if __name__ == "__main__":
    unittest.main()
