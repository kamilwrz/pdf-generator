"""download_pdf re-renders only when the stored file's watermark state no
longer matches the account's current plan."""
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
            username="u1", email="u1@e.pl", password="pw"))
        self.user = self.db.query(User).filter(User.username == "u1").one()

        self.tmpdir = tempfile.mkdtemp()
        self.file_path = str(Path(self.tmpdir) / "cv.pdf")

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
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
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

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _pdf_row(self) -> Pdf:
        return self.db.query(Pdf).filter(Pdf.id == self.pdf_id).one()

    def test_free_plan_download_re_renders_and_marks_watermarked(self):
        with patch.object(pdf_route, "USE_S3", False):
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.db.refresh(self._pdf_row())
        self.assertTrue(self._pdf_row().watermarked)
        self.assertTrue(Path(self.file_path).exists())

    def test_already_matching_state_skips_rerender(self):
        self._pdf_row().watermarked = True  # already matches Free's requirement
        self.db.commit()
        with patch.object(pdf_route, "USE_S3", False), \
             patch("app.services.document_service.render_pdf_for_download") as mock_render:
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        mock_render.assert_not_called()

    def test_upgrade_triggers_clean_rerender(self):
        self._pdf_row().watermarked = True  # stale from before the upgrade
        self.db.commit()
        ent.set_user_plan(self.db, self.user.id, "standard")

        with patch.object(pdf_route, "USE_S3", False):
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.db.refresh(self._pdf_row())
        self.assertFalse(self._pdf_row().watermarked)


if __name__ == "__main__":
    unittest.main()
