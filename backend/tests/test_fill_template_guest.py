"""Guest (anonymous) access to POST /ai/fill_template.

Guest mode lets visitors configure an A4 starter without an account. The fill
endpoint is deterministic Python layout (no OpenAI cost), so anonymous callers
are allowed for Free starter templates and rejected for Pro-tier ones — the
same allowlist as the Free (Darmowy) plan.
"""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import app
from app.core.security import DEFAULT_JWT_KEY_VERSION, verify_token_optional
from app.models.models import Base, User
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
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "sterling"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["elements"][0]["content"], "Anna Kowalska")
        mocked.assert_called_once()

    def test_guest_starter_sentinel_passes_email_validation(self):
        """The empty-field sentinel must reach layout without becoming user data."""
        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements) as mocked:
            response = self.client.post(
                "/ai/fill_template",
                json={
                    "cv_data": {
                        "name": "__CVSTART_NAME__",
                        "email": "cvstart-email@example.invalid",
                    },
                    "template_id": "sterling",
                },
            )
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(mocked.call_args.args[1]["email"], "cvstart-email@example.invalid")

    def test_guest_cannot_fill_pro_template(self):
        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements) as mocked:
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "monument"},
            )
        self.assertEqual(response.status_code, 403)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "plan_feature_template")
        self.assertIn("planie Pro", detail["message"])
        self.assertNotIn("Standard", detail["message"])
        mocked.assert_not_called()

    def test_stale_bearer_token_is_treated_as_guest(self):
        """A leftover expired JWT must not surface as a hard auth error for fill."""
        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements):
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "sterling"},
                headers={"Authorization": "Bearer not-a-real-jwt"},
            )
        self.assertEqual(response.status_code, 200)

    def test_authenticated_free_user_cannot_materialize_pro_template(self):
        user = User(
            username="free-user",
            email="free@example.test",
            hashed_password="unused",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        ent.ensure_free_subscription(self.db, user.id)
        app.dependency_overrides[verify_token_optional] = lambda: {
            "sub": str(user.id),
            "ver": DEFAULT_JWT_KEY_VERSION,
        }

        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements) as mocked:
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "monument"},
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"]["code"], "plan_feature_template")
        mocked.assert_not_called()

    def test_authenticated_pro_user_can_materialize_pro_template(self):
        user = User(
            username="pro-user",
            email="pro@example.test",
            hashed_password="unused",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        subscription = ent.ensure_free_subscription(self.db, user.id)
        subscription.plan_slug = "pro"
        self.db.commit()
        app.dependency_overrides[verify_token_optional] = lambda: {
            "sub": str(user.id),
            "ver": DEFAULT_JWT_KEY_VERSION,
        }

        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements) as mocked:
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "monument"},
            )

        self.assertEqual(response.status_code, 200, msg=response.text)
        mocked.assert_called_once()

    def test_unknown_template_is_rejected_before_entitlement_or_generator(self):
        with patch("app.api.routes.ai.generate_resume", side_effect=_fake_elements) as mocked:
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "missing"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "unknown_template")
        mocked.assert_not_called()

    def test_internal_generator_error_does_not_leak_exception_text(self):
        with patch(
            "app.api.routes.ai.generate_resume",
            side_effect=RuntimeError("provider-token-sk-private"),
        ):
            response = self.client.post(
                "/ai/fill_template",
                json={"cv_data": {"name": "Anna Kowalska"}, "template_id": "sterling"},
            )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"]["code"], "template_generation_failed")
        self.assertNotIn("provider-token", response.text)


if __name__ == "__main__":
    unittest.main()
