"""Free-plan export quota: three downloads succeed, the fourth is blocked."""
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
from app.models.models import Base, Pdf, PdfElements, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services import document_service as doc_service
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


class ExportMeteringTests(unittest.TestCase):
    """Wire-contract coverage for POST /pdf/download_pdf export metering.

    Forces the local (non-S3) path so a successful download streams PDF bytes
    after ``assert_can_export`` + ``record_export``. Free plan allows 3 exports
    per month; the fourth must surface ``plan_limit_exports``.
    """

    def setUp(self):
        ensure_test_auth_env()
        # StaticPool + a single shared connection so the request runs (on the
        # TestClient's worker thread) see the same in-memory DB as this thread.
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

        # Use a writable temp path rather than a hardcoded "/tmp/..." string: the
        # first download in this test now self-heals the watermark (a fresh row
        # defaults `watermarked=False` while a Free account requires `True`), so
        # the local export branch actually writes this file to disk.
        self.tmpdir = tempfile.mkdtemp()
        self.file_path = str(Path(self.tmpdir) / "export-cv.pdf")

        now = datetime.now(timezone.utc)
        pdf = Pdf(
            title="export-cv",
            file_path=self.file_path,
            owner_id=self.user.id,
            pages=1,
            page_width=595.0,
            page_height=842.0,
            created_at=now,
            updated_at=now,
        )
        self.db.add(pdf)
        self.db.commit()
        self.db.refresh(pdf)
        self.pdf_id = pdf.id
        # Give the self-heal re-render a real element to draw; the metering
        # contract is unaffected, but this keeps the exercised render path
        # representative rather than an empty document.
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

        # Pin the export re-render to the local filesystem branch so this test is
        # hermetic even when the developer's `.env` sets S3_BUCKET_NAME (which
        # flips `document_service.USE_S3` to True). Without this the first
        # download would upload to a real bucket. Mirrors the route-level
        # `patch(pdf_route.USE_S3, False)` used inside the test body.
        s3_patch = patch.object(doc_service, "USE_S3", False)
        s3_patch.start()
        self.addCleanup(s3_patch.stop)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _exports_count(self) -> int:
        period = ent.current_period_key()
        row = (
            self.db.query(UsageCounter)
            .filter(
                UsageCounter.user_id == self.user.id,
                UsageCounter.period_key == period,
            )
            .first()
        )
        return int(row.exports_count) if row is not None else 0

    def test_free_plan_allows_three_exports_then_blocks(self):
        # Patch the name bound in the route module (imported by value at
        # import time). Local path streams the PDF bytes after metering.
        with patch.object(pdf_route, "USE_S3", False):
            for i in range(3):
                response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
                self.assertEqual(
                    response.status_code,
                    200,
                    msg=f"export {i + 1} should succeed: {response.text}",
                )
                self.assertIn("application/pdf", response.headers.get("content-type", ""))

            self.assertEqual(self._exports_count(), 3)

            blocked = self.client.post("/pdf/download_pdf", json=self.pdf_id)
            self.assertEqual(blocked.status_code, 403)
            detail = blocked.json()["detail"]
            self.assertEqual(detail["code"], "plan_limit_exports")
            # Failed gate must not increment the counter past the free limit.
            self.assertEqual(self._exports_count(), 3)


if __name__ == "__main__":
    unittest.main()
