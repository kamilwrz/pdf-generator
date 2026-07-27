"""Choosing a plan at registration and via the select-plan endpoint."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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

    def test_set_user_plan_rejects_unknown_slug(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="c", email="c@e.pl", password="pw"))
        u = user_crud.get_user_by_username(self.db, "c")
        with self.assertRaises(ValueError):
            ent.set_user_plan(self.db, u.id, "enterprise")
