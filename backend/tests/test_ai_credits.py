"""Credit conversion, charging, and the block-at-zero gate."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, User, UserSubscription
from app.services import entitlements as ent


def _make_user(db, username="u", plan="pro"):
    now = datetime.now(timezone.utc)
    user = User(username=username, email=f"{username}@e.pl",
                hashed_password="x", created_at=now, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(UserSubscription(user_id=user.id, plan_slug=plan, status="active",
                            current_period_start=now, updated_at=now))
    db.commit()
    return user


class CreditMeteringTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_credits_for_cost_rounds_up_with_minimum_one(self):
        self.assertEqual(ent.credits_for_cost(0.15), 3)
        self.assertEqual(ent.credits_for_cost(0.05), 1)
        self.assertEqual(ent.credits_for_cost(0.11), 3)
        self.assertEqual(ent.credits_for_cost(0.004), 1)  # min 1
        self.assertEqual(ent.credits_for_cost(0.0), 1)     # a successful call always costs >=1

    def test_charge_decrements_remaining_credits(self):
        user = _make_user(self.db)
        ent.charge_ai_credits(self.db, user.id, 0.15)  # 3 credits
        ents = ent.get_entitlements(self.db, user)
        self.assertEqual(ents["usage"]["ai_credits_used"], 3)
        self.assertEqual(ents["limits"]["monthly_ai_credits"], 200)
        self.assertEqual(ents["remaining"]["ai_credits"], 197)

    def test_free_user_is_blocked(self):
        user = _make_user(self.db, username="f", plan="free")
        with self.assertRaises(ent.PlanLimitError):
            ent.assert_can_use_ai_assistant(self.db, user)

    def test_block_when_credits_exhausted(self):
        user = _make_user(self.db)
        ent.charge_ai_credits(self.db, user.id, 200 * 0.05)  # exactly 200 credits
        with self.assertRaises(ent.PlanLimitError):
            ent.assert_can_use_ai_assistant(self.db, user)

    def test_extract_cv_is_independent_from_assistant_credits(self):
        user = _make_user(self.db)
        ent.charge_ai_credits(self.db, user.id, 200 * 0.05)  # exactly 200 credits
        with self.assertRaises(ent.PlanLimitError):
            ent.assert_can_use_ai_assistant(self.db, user)
        ent.assert_can_extract_cv(self.db, user)

    def test_extract_cv_allowed_with_credits_remaining(self):
        user = _make_user(self.db)
        ent.charge_ai_credits(self.db, user.id, 10 * 0.05)  # 10 of 200 credits used
        ent.assert_can_extract_cv(self.db, user)  # should not raise
