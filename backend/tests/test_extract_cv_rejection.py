"""Free-plan monthly quota on POST /ai/extract_cv."""
from __future__ import annotations

import unittest
from unittest.mock import patch

import fitz
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, CvImportSnapshot, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.services.ai_service import CvExtractionError
from app.testing_support import ensure_test_auth_env


def _extract_must_not_run(*_args, **_kwargs):
    raise AssertionError("extract_cv_data must not run after the monthly quota is exhausted")


def _valid_pdf_bytes() -> bytes:
    """Build a minimal parseable PDF because upload validation is intentional."""
    document = fitz.open()
    document.new_page()
    data = document.tobytes()
    document.close()
    return data


class ExtractCvFreeImportTests(unittest.TestCase):
    """Free plans get one successful `/ai/extract_cv` call per UTC month."""

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

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "usr1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _usage(self) -> UsageCounter:
        return self.db.query(UsageCounter).filter(
            UsageCounter.user_id == self.user.id
        ).one()

    def _post(self, key: str):
        """Send one logical import attempt with its stable retry key."""
        return self.client.post(
            "/ai/extract_cv",
            files={"file": ("cv.pdf", _valid_pdf_bytes(), "application/pdf")},
            headers={"Idempotency-Key": key},
        )

    def test_idempotency_key_is_required_before_provider_work(self):
        with patch("app.api.routes.ai.extract_cv_data", side_effect=_extract_must_not_run):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", _valid_pdf_bytes(), "application/pdf")},
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "idempotency_key_required")

    def test_successful_import_increments_the_monthly_counter(self):
        with patch(
            "app.api.routes.ai.extract_cv_data",
            return_value=({"name": "Test"}, {"cost_pln_estimate": 0.0}),
        ):
            response = self._post("successful-import")
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.db.refresh(self._usage())
        self.assertEqual(self._usage().cv_imports_count, 1)

    def test_free_users_second_import_is_rejected_before_provider_call(self):
        ent.record_cv_import(self.db, self.user.id)

        with patch("app.api.routes.ai.extract_cv_data", side_effect=_extract_must_not_run):
            response = self._post("quota-exhausted")
        self.assertEqual(response.status_code, 403)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "plan_limit_cv_imports")

    def test_failed_extraction_does_not_consume_the_monthly_quota(self):
        with patch(
            "app.api.routes.ai.extract_cv_data",
            side_effect=RuntimeError("provider boom"),
        ):
            response = self._post("provider-boom")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self._usage().cv_imports_count, 0)

    def test_snapshot_success_failure_keeps_the_provider_claim_pending(self):
        """A DB failure after provider success must not make the call free."""
        extracted = ({"name": "Test"}, {"cost_pln_estimate": 0.0})
        with patch("app.api.routes.ai.extract_cv_data", return_value=extracted), \
             patch(
                 "app.api.routes.ai.mark_snapshot_succeeded",
                 side_effect=RuntimeError("snapshot write failed"),
             ):
            failed = self._post("snapshot-write-failure")

        self.assertEqual(failed.status_code, 500)
        self.assertEqual(self._usage().cv_imports_count, 0)
        failed_snapshot = self.db.query(CvImportSnapshot).order_by(
            CvImportSnapshot.id.desc(),
        ).first()
        self.assertEqual(failed_snapshot.status, "failed")
        self.assertEqual(failed_snapshot.error_code, "extraction_failed")

        # Provider success is already externally billable. Until expiry can
        # conservatively consume the slot, another key must not call it again.
        with patch("app.api.routes.ai.extract_cv_data", return_value=extracted):
            retry = self._post("snapshot-write-retry")
        self.assertEqual(retry.status_code, 429, msg=retry.text)
        self.assertEqual(retry.json()["detail"]["code"], "ai_operation_active")
        self.assertEqual(self._usage().cv_imports_count, 0)

    def test_provider_rate_limit_returns_safe_retryable_detail_without_consumption(self):
        error = CvExtractionError(
            "extract_provider_rate_limited",
            "Usługa importu jest chwilowo przeciążona. Spróbuj ponownie za moment.",
            status_code=429,
            retryable=True,
        )
        with patch("app.api.routes.ai.extract_cv_data", side_effect=error):
            response = self._post("provider-rate-limit")

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["detail"]["code"], "extract_provider_rate_limited")
        self.assertTrue(response.json()["detail"]["retryable"])
        self.assertEqual(self._usage().cv_imports_count, 0)

    def test_empty_provider_response_returns_retryable_502_without_consumption(self):
        """Preserve the safe service error and leave the monthly meter untouched."""
        error = CvExtractionError(
            "extract_provider_empty_response",
            "Model nie zwrócił danych CV. Spróbuj ponownie.",
            status_code=502,
            retryable=True,
        )
        with patch("app.api.routes.ai.extract_cv_data", side_effect=error):
            response = self._post("provider-empty-response")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["detail"]["code"],
            "extract_provider_empty_response",
        )
        self.assertTrue(response.json()["detail"]["retryable"])
        self.assertEqual(self._usage().cv_imports_count, 0)


if __name__ == "__main__":
    unittest.main()
