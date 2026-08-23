"""Guest (anonymous) access to POST /ai/fill_template.

Guest mode lets visitors finish the bio wizard without an account. The fill
endpoint is deterministic Python layout (no OpenAI cost), so anonymous callers
are allowed for Free starter templates and rejected for Pro-tier ones —
the same allowlist as the Free (Darmowy) plan.
"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import app
from app.models.models import Base
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _fake_elements(template_id, cv_data):
    return [{"element_id": "e1", "category": "text", "content": cv_data.get("name", "")}]


class FillTemplateGuestTests(unittest.TestCase):
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

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_guest_can_fill_free_starter_template_without_token(self):
        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements) as mocked:
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "regent"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["elements"][0]["content"], "Anna Kowalska")
        mocked.assert_called_once()

    def test_guest_cannot_fill_standard_template(self):
        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements) as mocked:
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "monument"},
            )
        self.assertEqual(response.status_code, 403)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "plan_feature_template")
        mocked.assert_not_called()

    def test_stale_bearer_token_is_treated_as_guest(self):
        """A leftover expired JWT must not surface as a hard auth error for fill."""
        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements):
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "regent"},
                headers={"Authorization": "Bearer not-a-real-jwt"},
            )
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
