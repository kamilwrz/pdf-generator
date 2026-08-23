"""Free/Pro entitlement enforcement and billing foundation."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, Pdf, User
from app.schemas.user_schema import UserCreateRequest
from app.crud import user as user_crud
from app.services import entitlements as ent


class EntitlementsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        ent.seed_plans(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _make_user(self, username: str = "alice") -> User:
        user_crud.create_user(
            self.db,
            UserCreateRequest(
                username=username,
                email=f"{username}@example.com",
                password="secret123",
            ),
        )
        return user_crud.get_user_by_username(self.db, username)

    def _add_pdf(self, user: User, title: str = "cv.pdf") -> Pdf:
        now = datetime.now(timezone.utc)
        pdf = Pdf(
            title=title,
            file_path=f"/tmp/{title}",
            created_at=now,
            updated_at=now,
            owner_id=user.id,
            pages=1,
            page_width=595,
            page_height=842,
        )
        self.db.add(pdf)
        self.db.commit()
        self.db.refresh(pdf)
        return pdf

    def test_seed_plans_creates_free_and_pro(self):
        slugs = {p.slug for p in self.db.query(ent.Plan).filter_by(is_active=True).all()}
        self.assertEqual(slugs, {"free", "pro"})

    def test_registration_assigns_free_subscription(self):
        user = self._make_user()
        sub = self.db.query(ent.UserSubscription).filter_by(user_id=user.id).first()
        self.assertIsNotNone(sub)
        self.assertEqual(sub.plan_slug, "free")
        self.assertEqual(sub.status, "active")

    def test_backfill_assigns_free_to_users_without_subscription(self):
        raw = User(
            username="orphan",
            email="orphan@example.com",
            hashed_password="x",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self.db.add(raw)
        self.db.commit()
        created = ent.backfill_free_subscriptions(self.db)
        self.assertGreaterEqual(created, 1)
        sub = self.db.query(ent.UserSubscription).filter_by(user_id=raw.id).first()
        self.assertEqual(sub.plan_slug, "free")

    def test_free_blocks_second_project(self):
        user = self._make_user()
        self._add_pdf(user, "one.pdf")
        with self.assertRaises(ent.PlanLimitError) as ctx:
            ent.assert_can_create_project(self.db, user)
        self.assertEqual(ctx.exception.detail["code"], "plan_limit_projects")

    def test_free_allows_first_project(self):
        user = self._make_user()
        ent.assert_can_create_project(self.db, user)

    def test_free_export_limit(self):
        user = self._make_user()
        for _ in range(3):
            ent.assert_can_export(self.db, user)
            ent.record_export(self.db, user.id)
        with self.assertRaises(ent.PlanLimitError) as ctx:
            ent.assert_can_export(self.db, user)
        self.assertEqual(ctx.exception.detail["code"], "plan_limit_exports")

    def test_free_blocks_ai_assistant(self):
        user = self._make_user()
        with self.assertRaises(ent.PlanLimitError) as ctx:
            ent.assert_can_use_ai_assistant(self.db, user)
        self.assertEqual(ctx.exception.detail["code"], "plan_feature_ai_assistant")

    def test_free_allows_one_lifetime_extract_then_blocks(self):
        user = self._make_user()
        ent.assert_can_extract_cv(self.db, user)
        ent.mark_free_import_used(self.db, user.id)
        with self.assertRaises(ent.PlanLimitError) as ctx:
            ent.assert_can_extract_cv(self.db, user)
        self.assertEqual(ctx.exception.detail["code"], "plan_feature_extract_cv")

    def test_free_template_gate(self):
        user = self._make_user()
        ent.assert_template_allowed(self.db, user, "regent")
        ent.assert_template_allowed(self.db, user, "sterling")
        with self.assertRaises(ent.PlanLimitError) as ctx:
            ent.assert_template_allowed(self.db, user, "monument")
        self.assertEqual(ctx.exception.detail["code"], "plan_feature_template")

    def test_get_entitlements_shape(self):
        user = self._make_user()
        payload = ent.get_entitlements(self.db, user)
        self.assertEqual(payload["plan_slug"], "free")
        self.assertFalse(payload["ai_assistant"])
        self.assertFalse(payload["extract_cv"])
        self.assertEqual(payload["template_tier"], "starter")
        self.assertIn("regent", payload["allowed_template_ids"])
        self.assertIn("sterling", payload["allowed_template_ids"])
        self.assertEqual(payload["limits"]["max_projects"], 1)
        self.assertEqual(payload["limits"]["max_exports_per_month"], 3)

    def test_pro_allows_ai_layout_and_all_templates(self):
        user = self._make_user("bob")
        ent.set_user_plan(self.db, user.id, "pro")
        ent.assert_can_use_ai_assistant(self.db, user)
        ent.assert_can_use_ai_action(self.db, user, "grammar")
        ent.assert_can_use_ai_action(self.db, user, "layout")
        ent.assert_can_use_ai_action(self.db, user, "design_rating")
        ent.assert_can_extract_cv(self.db, user)
        ent.assert_template_allowed(self.db, user, "monument")
        payload = ent.get_entitlements(self.db, user)
        self.assertEqual(payload["plan_slug"], "pro")
        self.assertIsNone(payload["allowed_template_ids"])
        self.assertEqual(payload["limits"]["monthly_ai_credits"], 200)
        self.assertIsNotNone(payload["current_period_end"])

    def test_appearance_actions_are_pro_only(self):
        self.assertIn("design_rating", ent.PRO_ONLY_AI_ACTIONS)
        self.assertIn("layout", ent.PRO_ONLY_AI_ACTIONS)

    def test_expired_pro_falls_back_to_free(self):
        user = self._make_user("expired")
        ent.set_user_plan(self.db, user.id, "pro")
        sub = ent.get_or_create_subscription(self.db, user.id)
        sub.current_period_end = datetime.now(timezone.utc) - timedelta(days=1)
        self.db.add(sub)
        self.db.commit()
        payload = ent.get_entitlements(self.db, user)
        self.assertEqual(payload["plan_slug"], "free")
        with self.assertRaises(ent.PlanLimitError):
            ent.assert_can_use_ai_assistant(self.db, user)


class PlanSeedAndMigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_seed_credit_allowances_and_pro_slug(self):
        ent.seed_plans(self.db)
        from app.models.models import Plan
        active = {p.slug: p for p in self.db.query(Plan).filter_by(is_active=True).all()}
        self.assertEqual(active["free"].max_ai_actions_per_month, 0)
        self.assertEqual(active["pro"].max_ai_actions_per_month, 200)
        self.assertEqual(active["pro"].name, "Pro")
        self.assertNotIn("standard", active)
        self.assertNotIn("premium", active)

    def test_migrate_legacy_paid_slugs_to_pro(self):
        from app.models.models import UserSubscription
        now = datetime.now(timezone.utc)
        self.db.add(UserSubscription(
            user_id=1, plan_slug="standard", status="active",
            current_period_start=now, updated_at=now,
        ))
        self.db.add(UserSubscription(
            user_id=2, plan_slug="premium", status="active",
            current_period_start=now, updated_at=now,
        ))
        self.db.commit()
        ent.seed_plans(self.db)
        first = ent.migrate_legacy_plans_to_pro(self.db)
        second = ent.migrate_legacy_plans_to_pro(self.db)
        self.assertEqual(first, 2)
        self.assertEqual(second, 0)
        slugs = {
            row.user_id: row.plan_slug
            for row in self.db.query(UserSubscription).all()
        }
        self.assertEqual(slugs[1], "pro")
        self.assertEqual(slugs[2], "pro")

    def test_normalize_plan_slug_aliases(self):
        self.assertEqual(ent.normalize_plan_slug("standard"), "pro")
        self.assertEqual(ent.normalize_plan_slug("premium"), "pro")
        self.assertEqual(ent.normalize_plan_slug("pro"), "pro")
        self.assertEqual(ent.normalize_plan_slug("free"), "free")


if __name__ == "__main__":
    unittest.main()
