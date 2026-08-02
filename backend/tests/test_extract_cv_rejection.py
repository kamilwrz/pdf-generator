"""Free-plan gate on POST /ai/extract_cv runs before the OpenAI extract call."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _extract_must_not_run(*_args, **_kwargs):
    """Prove the entitlement gate short-circuits before the model call."""
    raise AssertionError("extract_cv_data must not be called for free users")


class ExtractCvRejectionTests(unittest.TestCase):
    """Wire-contract coverage for Free-tier rejection of CV PDF extraction.

    Free plans have ``extract_cv=False``. The route must return
    ``plan_feature_extract_cv`` without invoking ``extract_cv_data``.
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

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_free_user_extract_cv_is_rejected_before_model_call(self):
        with patch("app.api.routes.ai.extract_cv_data", side_effect=_extract_must_not_run):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
        self.assertEqual(response.status_code, 403)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "plan_feature_extract_cv")


if __name__ == "__main__":
    unittest.main()
