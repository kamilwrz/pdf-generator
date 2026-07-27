"""Choosing a plan at registration and via the select-plan endpoint."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
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
            username="a", email="a@e.pl", password="pw"))
        self.assertEqual(self._plan_of("a"), "free")

    def test_register_with_premium_activates_premium(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="b", email="b@e.pl", password="pw", plan="premium"))
        self.assertEqual(self._plan_of("b"), "premium")

    def test_register_with_premium_falls_back_to_free_when_unpaid_disabled(self):
        # Patches the name bound in app.crud.user (imported by value at import
        # time), NOT the env var / app.core.config — see the import-site comment.
        with patch.object(user_crud, "ALLOW_UNPAID_PLAN_SELECTION", False):
            user_crud.create_user(self.db, UserCreateRequest(
                username="d", email="d@e.pl", password="pw", plan="premium"))
        self.assertEqual(self._plan_of("d"), "free")

    def test_set_user_plan_rejects_unknown_slug(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="c", email="c@e.pl", password="pw"))
        u = user_crud.get_user_by_username(self.db, "c")
        with self.assertRaises(ValueError):
            ent.set_user_plan(self.db, u.id, "enterprise")


class SelectPlanEndpointTests(unittest.TestCase):
    """Wire-contract coverage for POST /billing/select-plan: status codes and
    response body, exercised through the real FastAPI app + router. Runs against
    a real in-memory SQLite DB so a 200 provably changes the subscription row.
    """

    def setUp(self):
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

    def _plan_of(self, username):
        u = user_crud.get_user_by_username(self.db, username)
        return self.db.query(UserSubscription).filter_by(user_id=u.id).first().plan_slug

    def test_select_valid_plan_returns_200_and_changes_subscription(self):
        self.assertEqual(self._plan_of("u1"), "free")
        response = self.client.post("/billing/select-plan", json={"plan_slug": "standard"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["plan_slug"], "standard")
        self.assertFalse(body["payment_required"])
        self.assertEqual(body["entitlements"]["plan_slug"], "standard")
        self.assertEqual(self._plan_of("u1"), "standard")

    def test_unknown_slug_returns_400(self):
        response = self.client.post("/billing/select-plan", json={"plan_slug": "enterprise"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self._plan_of("u1"), "free")

    def test_paid_plan_while_unpaid_disabled_returns_402(self):
        with patch.object(billing_route, "ALLOW_UNPAID_PLAN_SELECTION", False):
            response = self.client.post("/billing/select-plan", json={"plan_slug": "premium"})
        self.assertEqual(response.status_code, 402)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "payment_required")
        self.assertIsNone(detail["checkout_url"])
        self.assertEqual(self._plan_of("u1"), "free")

    def test_list_plans_returns_catalog_and_current(self):
        response = self.client.get("/billing/plans")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["current_plan_slug"], "free")
        slugs = [p["slug"] for p in body["plans"]]
        self.assertEqual(slugs, ["free", "standard", "premium"])
        self.assertTrue(body["allow_unpaid_selection"])

    def test_valid_token_for_missing_user_returns_401(self):
        # Valid token (verify_token succeeds) whose `sub` resolves to no user row.
        app.dependency_overrides[verify_token] = lambda: {"sub": "ghost"}
        response = self.client.post("/billing/select-plan", json={"plan_slug": "standard"})
        self.assertEqual(response.status_code, 401)
