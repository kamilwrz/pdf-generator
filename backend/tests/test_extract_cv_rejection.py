"""Free-plan gate on POST /ai/extract_cv: one lifetime free import, then blocked."""
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
from app.models.models import Base, User, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _extract_must_not_run(*_args, **_kwargs):
    raise AssertionError("extract_cv_data must not be called once the free import is used")


def _valid_pdf_bytes() -> bytes:
    """Build a minimal parseable PDF because upload validation is intentional."""
    document = fitz.open()
    document.new_page()
    data = document.tobytes()
    document.close()
    return data


class ExtractCvFreeImportTests(unittest.TestCase):
    """Free plans get exactly one lifetime free `/ai/extract_cv` call."""

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

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _sub(self) -> UserSubscription:
        return self.db.query(UserSubscription).filter(
            UserSubscription.user_id == self.user.id
        ).one()

    def test_free_users_first_import_succeeds_and_consumes_the_trial(self):
        with patch(
            "app.api.routes.ai.extract_cv_data",
            return_value=({"name": "Test"}, {"cost_pln_estimate": 0.0}),
        ):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", _valid_pdf_bytes(), "application/pdf")},
            )
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.db.refresh(self._sub())
        self.assertTrue(self._sub().free_import_used)

    def test_free_users_second_import_is_rejected(self):
        self._sub().free_import_used = True
        self.db.commit()

        with patch("app.api.routes.ai.extract_cv_data", side_effect=_extract_must_not_run):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", _valid_pdf_bytes(), "application/pdf")},
            )
        self.assertEqual(response.status_code, 403)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "plan_feature_extract_cv")

    def test_failed_extraction_does_not_consume_the_free_import(self):
        with patch(
            "app.api.routes.ai.extract_cv_data",
            side_effect=RuntimeError("openai boom"),
        ):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", _valid_pdf_bytes(), "application/pdf")},
            )
        self.assertEqual(response.status_code, 500)
        self.db.refresh(self._sub())
        self.assertFalse(self._sub().free_import_used)


if __name__ == "__main__":
    unittest.main()
