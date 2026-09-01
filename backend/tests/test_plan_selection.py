"""Choosing a plan at registration and via the select-plan endpoint."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import billing as billing_route
from app.core.security import verify_token
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.crud import user as user_crud
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


class PlanSelectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _plan_of(self, username):
        u = user_crud.get_user_by_username(self.db, username)
        return self.db.query(UserSubscription).filter_by(user_id=u.id).first().plan_slug

    def test_register_defaults_to_free(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="user-a", email="a@e.pl", password="correct horse battery"))
        self.assertEqual(self._plan_of("user-a"), "free")

    def test_register_with_pro_activates_pro(self):
        with patch.object(user_crud, "ALLOW_UNPAID_PLAN_SELECTION", True):
            user_crud.create_user(self.db, UserCreateRequest(
                username="user-b", email="b@e.pl", password="correct horse battery", plan="pro"))
        self.assertEqual(self._plan_of("user-b"), "pro")

    def test_register_with_legacy_premium_alias_activates_pro(self):
        with patch.object(user_crud, "ALLOW_UNPAID_PLAN_SELECTION", True):
            user_crud.create_user(self.db, UserCreateRequest(
                username="legacy", email="legacy@e.pl", password="correct horse battery", plan="premium"))
        self.assertEqual(self._plan_of("legacy"), "pro")

    def test_register_with_pro_falls_back_to_free_when_unpaid_disabled(self):
        with patch.object(user_crud, "ALLOW_UNPAID_PLAN_SELECTION", False):
            user_crud.create_user(self.db, UserCreateRequest(
                username="user-d", email="d@e.pl", password="correct horse battery", plan="pro"))
        self.assertEqual(self._plan_of("user-d"), "free")

    def test_set_user_plan_rejects_unknown_slug(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="user-c", email="c@e.pl", password="correct horse battery"))
        u = user_crud.get_user_by_username(self.db, "user-c")
        with self.assertRaises(ValueError):
            ent.set_user_plan(self.db, u.id, "enterprise")


class SelectPlanEndpointTests(unittest.TestCase):
    """Wire-contract coverage for POST /billing/select-plan."""

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

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "usr1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _plan_of(self, username):
        u = user_crud.get_user_by_username(self.db, username)
        return self.db.query(UserSubscription).filter_by(user_id=u.id).first().plan_slug

    def test_select_valid_plan_returns_200_and_changes_subscription(self):
        self.assertEqual(self._plan_of("usr1"), "free")
        with patch.object(billing_route, "ALLOW_UNPAID_PLAN_SELECTION", True):
            response = self.client.post("/billing/select-plan", json={"plan_slug": "pro"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["plan_slug"], "pro")
        self.assertFalse(body["payment_required"])
        self.assertEqual(body["entitlements"]["plan_slug"], "pro")
        self.assertEqual(body["entitlements"]["limits"]["monthly_ai_credits"], 200)
        self.assertEqual(self._plan_of("usr1"), "pro")

    def test_legacy_standard_slug_selects_pro(self):
        with patch.object(billing_route, "ALLOW_UNPAID_PLAN_SELECTION", True):
            response = self.client.post("/billing/select-plan", json={"plan_slug": "standard"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["plan_slug"], "pro")

    def test_unknown_slug_returns_400(self):
        response = self.client.post("/billing/select-plan", json={"plan_slug": "enterprise"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self._plan_of("usr1"), "free")

    def test_paid_plan_while_unpaid_disabled_returns_402(self):
        with patch.object(billing_route, "ALLOW_UNPAID_PLAN_SELECTION", False):
            response = self.client.post("/billing/select-plan", json={"plan_slug": "pro"})
        self.assertEqual(response.status_code, 402)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "payment_required")
        self.assertIsNone(detail["checkout_url"])
        self.assertEqual(self._plan_of("usr1"), "free")

    def test_list_plans_returns_catalog_and_current(self):
        response = self.client.get("/billing/plans")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["current_plan_slug"], "free")
        slugs = [p["slug"] for p in body["plans"]]
        self.assertEqual(slugs, ["free", "pro"])
        free = next(plan for plan in body["plans"] if plan["slug"] == "free")
        self.assertEqual(free["max_projects"], 1)
        self.assertEqual(free["max_exports_per_month"], 3)
        self.assertEqual(free["max_cv_imports_per_month"], 1)
        self.assertEqual(free["monthly_ai_credits"], 0)
        self.assertFalse(free["ai_assistant"])
        self.assertTrue(
            any("bez znaku wodnego" in highlight.lower() for highlight in free["highlights"])
        )
        self.assertIn("allow_unpaid_selection", body)
        self.assertIsInstance(body["allow_unpaid_selection"], bool)

    def test_valid_token_for_missing_user_returns_401(self):
        app.dependency_overrides[verify_token] = lambda: {"sub": "ghost"}
        response = self.client.post("/billing/select-plan", json={"plan_slug": "pro"})
        self.assertEqual(response.status_code, 401)
