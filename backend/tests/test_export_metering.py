"""Free-plan export quota: three downloads succeed, the fourth is blocked."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
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
from app.models.models import Base, Pdf, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


class ExportMeteringTests(unittest.TestCase):
    """Wire-contract coverage for POST /pdf/download_pdf export metering.

    Forces the local (non-S3) path so a successful download returns the Pdf row
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

        now = datetime.now(timezone.utc)
        pdf = Pdf(
            title="export-cv",
            file_path="/tmp/export-cv.pdf",
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

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

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
        # import time). Local path returns the Pdf ORM row after metering;
        # jsonable_encoder may serialize an expired instance as `{}`, so the
        # contract under test is status + UsageCounter, not response fields.
        with patch.object(pdf_route, "USE_S3", False):
            for i in range(3):
                response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
                self.assertEqual(
                    response.status_code,
                    200,
                    msg=f"export {i + 1} should succeed: {response.text}",
                )

            self.assertEqual(self._exports_count(), 3)

            blocked = self.client.post("/pdf/download_pdf", json=self.pdf_id)
            self.assertEqual(blocked.status_code, 403)
            detail = blocked.json()["detail"]
            self.assertEqual(detail["code"], "plan_limit_exports")
            # Failed gate must not increment the counter past the free limit.
            self.assertEqual(self._exports_count(), 3)


if __name__ == "__main__":
    unittest.main()
