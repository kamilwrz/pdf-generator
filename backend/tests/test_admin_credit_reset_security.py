"""Security contract for the operations-only AI credit reset."""
from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.crud.user import create_user
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, User
from app.schemas.user_schema import UserCreateRequest
from app.services.entitlements import seed_plans
from app.testing_support import ensure_test_auth_env


class AdminCreditResetSecurityTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.engine = engine
        self.db = sessionmaker(bind=engine)()
        Base.metadata.create_all(bind=engine)
        seed_plans(self.db)
        create_user(
            self.db,
            UserCreateRequest(username="exact-user", email="exact@example.test", password="correct horse battery"),
        )
        self.user = self.db.query(User).filter_by(username="exact-user").one()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_jwt_secret_is_never_an_admin_secret_fallback(self):
        with patch.dict(os.environ, {"SECRET_KEY": "j" * 40}, clear=True):
            response = self.client.post(
                "/billing/admin/reset-ai-credits",
                json={"user_id": self.user.id},
                headers={"X-Admin-Secret": "j" * 40},
            )
        self.assertEqual(response.status_code, 403)

    def test_dedicated_secret_must_be_at_least_32_characters(self):
        with patch.dict(os.environ, {"ADMIN_RESET_SECRET": "short-secret"}, clear=True):
            response = self.client.post(
                "/billing/admin/reset-ai-credits",
                json={"user_id": self.user.id},
                headers={"X-Admin-Secret": "short-secret"},
            )
        self.assertEqual(response.status_code, 403)

    def test_reset_targets_only_the_exact_numeric_user_id(self):
        secret = "a" * 32
        with self.assertLogs("app.api.routes.billing", level="INFO") as captured:
            with patch.dict(os.environ, {"ADMIN_RESET_SECRET": secret}, clear=True):
                missing = self.client.post(
                    "/billing/admin/reset-ai-credits",
                    json={"user_id": self.user.id + 999},
                    headers={"X-Admin-Secret": secret},
                )
                success = self.client.post(
                    "/billing/admin/reset-ai-credits",
                    json={"user_id": self.user.id},
                    headers={"X-Admin-Secret": secret},
                )
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.json()["detail"]["code"], "user_not_found")
        self.assertEqual(success.status_code, 200)
        self.assertNotIn("username", success.json())
        audit_output = "\n".join(captured.output)
        self.assertIn("outcome=not_found", audit_output)
        self.assertIn("outcome=success", audit_output)
        self.assertNotIn("exact-user", audit_output)
        self.assertNotIn("exact@example.test", audit_output)
        self.assertNotIn(secret, audit_output)

    def test_denied_audit_never_logs_supplied_secret_or_target(self):
        supplied_secret = "attacker-controlled-secret-value-123"
        target_id = self.user.id + 321
        with self.assertLogs("app.api.routes.billing", level="WARNING") as captured:
            response = self.client.post(
                "/billing/admin/reset-ai-credits",
                json={"user_id": target_id},
                headers={"X-Admin-Secret": supplied_secret},
            )

        self.assertEqual(response.status_code, 403)
        audit_output = "\n".join(captured.output)
        self.assertIn("outcome=denied", audit_output)
        self.assertNotIn(supplied_secret, audit_output)
        self.assertNotIn(str(target_id), audit_output)


if __name__ == "__main__":
    unittest.main()
