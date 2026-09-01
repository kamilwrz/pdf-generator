"""download_pdf lazily replaces legacy watermarked files with clean PDFs."""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import pdf as pdf_route
from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Pdf, PdfElements, User
from app.schemas.user_schema import UserCreateRequest
from app.services import document_service as doc_service
from app.services import entitlements as ent
from app.services import pdf_storage
from app.testing_support import ensure_test_auth_env


class DownloadWatermarkTests(unittest.TestCase):
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

        user_crud.create_user(self.db, UserCreateRequest(
            username="usr1", email="u1@e.pl", password="correct horse battery"))
        self.user = self.db.query(User).filter(User.username == "usr1").one()

        self.storage = tempfile.TemporaryDirectory()
        self.storage_root = Path(self.storage.name)
        legacy_user_dir = self.storage_root / self.user.username
        legacy_user_dir.mkdir(parents=True)
        self.file_path = str(legacy_user_dir / "cv.pdf")
        Path(self.file_path).write_bytes(b"%PDF-1.4 clean stub")

        now = datetime.now(timezone.utc)
        pdf = Pdf(
            title="cv", file_path=self.file_path, owner_id=self.user.id,
            pages=1, page_width=595.0, page_height=842.0,
            watermarked=False, created_at=now, updated_at=now,
        )
        self.db.add(pdf)
        self.db.commit()
        self.db.refresh(pdf)
        self.pdf_id = pdf.id
        self.db.add(PdfElements(
            pdf_id=self.pdf_id, element_id="e1", category="text", page=1,
            left=10, top=10, content="hi", fontFamily="Inter", fontSize=12,
            color="#000000", extra_properties={},
        ))
        self.db.commit()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "usr1"}
        self.client = TestClient(app)

        # The self-heal re-render reads `USE_S3` from `document_service`, which
        # is `True` whenever the developer's local `.env` sets S3_BUCKET_NAME.
        # These tests assert on the LOCAL branch (a file written to a temp dir),
        # so pin the service to the filesystem path and keep the run hermetic —
        # otherwise the re-render would upload to a real bucket and write no
        # local file. This mirrors each test's `patch(pdf_route.USE_S3, False)`.
        s3_patch = patch.object(doc_service, "USE_S3", False)
        s3_patch.start()
        self.addCleanup(s3_patch.stop)
        storage_patch = patch.object(doc_service, "PDF_UPLOAD_DIR", self.storage_root)
        storage_patch.start()
        self.addCleanup(storage_patch.stop)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        self.storage.cleanup()

    def _pdf_row(self) -> Pdf:
        return self.db.query(Pdf).filter(Pdf.id == self.pdf_id).one()

    def test_clean_free_plan_download_skips_rerender(self):
        with patch.object(pdf_route, "USE_S3", False), \
             patch.object(pdf_route, "render_pdf_for_download") as mock_render:
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(response.content, b"%PDF-1.4 clean stub")
        mock_render.assert_not_called()
        self.assertFalse(self._pdf_row().watermarked)

    def test_legacy_watermarked_free_download_rerenders_clean(self):
        self._pdf_row().watermarked = True
        self.db.commit()

        with patch.object(pdf_route, "USE_S3", False):
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertIn("application/pdf", response.headers.get("content-type", ""))
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn("attachment", response.headers.get("content-disposition", ""))
        self.db.refresh(self._pdf_row())
        self.assertFalse(self._pdf_row().watermarked)
        self.assertEqual(self._pdf_row().storage_backend, "local")
        self.assertTrue(Path(self._pdf_row().file_path).exists())
        self.assertFalse(Path(self.file_path).exists())

    def test_legacy_watermarked_pro_download_rerenders_clean(self):
        self._pdf_row().watermarked = True
        self.db.commit()
        ent.set_user_plan(self.db, self.user.id, "pro")

        with patch.object(pdf_route, "USE_S3", False):
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.db.refresh(self._pdf_row())
        self.assertFalse(self._pdf_row().watermarked)

    def test_stale_watermark_render_never_replaces_newer_revision(self):
        row = self._pdf_row()
        row.watermarked = True
        row.revision = 1
        self.db.commit()
        winner_key = f"pdfs/{self.user.id}/{self.pdf_id}/{'b' * 32}.pdf"
        loser_key = f"pdfs/{self.user.id}/{self.pdf_id}/{'c' * 32}.pdf"
        winner_path = pdf_storage.local_path_for_key(
            winner_key,
            root=self.storage_root,
            owner_id=self.user.id,
            pdf_id=self.pdf_id,
        )
        winner_path.parent.mkdir(parents=True, exist_ok=True)
        winner_bytes = b"%PDF-1.4 newer revision"

        def publish_concurrent_winner(*_args, **_kwargs):
            # Simulate another request committing revision 2 after this request
            # rendered revision 1 but before its final pointer CAS.
            winner_path.write_bytes(winner_bytes)
            self.db.query(Pdf).filter(Pdf.id == self.pdf_id).update({
                Pdf.revision: 2,
                Pdf.storage_backend: "local",
                Pdf.storage_key: winner_key,
                Pdf.file_path: str(winner_path),
                Pdf.watermarked: False,
            })
            self.db.commit()
            return str(
                pdf_storage.local_path_for_key(
                    loser_key,
                    root=self.storage_root,
                    owner_id=self.user.id,
                    pdf_id=self.pdf_id,
                )
            )

        with patch.object(
            doc_service,
            "make_pdf_key",
            return_value=loser_key,
        ), patch.object(
            doc_service,
            "put_pdf_bytes",
            side_effect=publish_concurrent_winner,
        ):
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)

        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(response.content, winner_bytes)
        self.db.expire_all()
        persisted = self._pdf_row()
        self.assertEqual(persisted.revision, 2)
        self.assertEqual(persisted.storage_key, winner_key)
        self.assertEqual(persisted.file_path, str(winner_path))
        self.assertFalse(persisted.watermarked)
        loser_path = pdf_storage.local_path_for_key(
            loser_key,
            root=self.storage_root,
            owner_id=self.user.id,
            pdf_id=self.pdf_id,
        )
        self.assertFalse(loser_path.exists())


if __name__ == "__main__":
    unittest.main()
