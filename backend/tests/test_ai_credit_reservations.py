"""Atomic quota, idempotency, and recovery tests for AI reservations."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import AI_PROVIDER_TIMEOUT_SECONDS
from app.crud.user import create_user
from app.models.models import AiCreditReservation, Base, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services.entitlements import (
    AI_RESERVATION_TTL,
    AiReservationError,
    PlanLimitError,
    current_period_key,
    release_ai_reservation,
    reserve_ai_credits,
    resize_ai_reservation,
    reserve_cv_import,
    seed_plans,
    set_user_plan,
    settle_ai_reservation,
    settle_failed_ai_reservation,
)


class AiCreditReservationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "reservations.db"
        self.engine = create_engine(
            f"sqlite:///{db_path.as_posix()}",
            connect_args={"check_same_thread": False, "timeout": 30},
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        with self.Session() as db:
            seed_plans(db)
            create_user(
                db,
                UserCreateRequest(
                    username="reservation-owner",
                    email="reservation@example.test",
                    password="correct horse battery",
                ),
            )
            self.user_id = db.query(User.id).filter_by(username="reservation-owner").scalar()
            set_user_plan(db, self.user_id, "pro")

    def tearDown(self):
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_provider_timeout_keeps_settlement_headroom_below_lease(self):
        self.assertLessEqual(
            AI_PROVIDER_TIMEOUT_SECONDS,
            int(AI_RESERVATION_TTL.total_seconds()) - 60,
        )

    def test_prompt_budget_expansions_share_the_atomic_remaining_balance(self):
        with self.Session() as db:
            db.query(UsageCounter).filter_by(user_id=self.user_id).one().ai_actions_count = 152
            db.commit()
            claims = [reserve_ai_credits(
                db, user_id=self.user_id, action="shorten", idempotency_key=f"expand-{i}",
                request_hash=f"{i:064x}", reserved_credits=1,
            ) for i in range(10)]

        def expand(claim):
            with self.Session() as db:
                try:
                    return resize_ai_reservation(
                        db, user_id=self.user_id, reservation_id=claim.reservation_id,
                        preferred_credits=20, minimum_credits=2,
                    )
                except PlanLimitError:
                    return 1

        with ThreadPoolExecutor(max_workers=10) as executor:
            granted = list(executor.map(expand, claims))
        with self.Session() as db:
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
            self.assertEqual(usage.ai_credits_reserved, sum(granted))
            self.assertEqual(usage.ai_actions_count + usage.ai_credits_reserved, 200)

    def test_assistant_48_credits_ignores_canvas_metadata_and_charges_two_once(self):
        self._exercise_assistant_budget(remaining=48, padding=300_000)

    def test_assistant_two_credits_reduces_provider_cap_and_charges_two_once(self):
        self._exercise_assistant_budget(remaining=2, padding=0)

    def test_unaffordable_actual_prompt_releases_admission_without_provider_call(self):
        self._exercise_assistant_budget(remaining=2, padding=0, content="Doświadczenie. " * 4000, rejected=True)

    def test_zero_balance_never_calls_provider(self):
        self._exercise_assistant_budget(remaining=0, padding=0, rejected=True)

    def _exercise_assistant_budget(self, *, remaining, padding, content="Tworzę aplikacje internetowe.", rejected=False):
        """Exercise real route, prompt building, DB admission, settlement and replay."""
        from app.api.routes import ai_assistant as route
        from app.core.security import verify_token
        from app.dependencies import get_db
        from app.main import app
        from app.services import ai_assistant_service as service
        from app.testing_support import ensure_test_auth_env

        ensure_test_auth_env()
        with self.Session() as db:
            db.query(UsageCounter).filter_by(user_id=self.user_id).one().ai_actions_count = 200 - remaining
            db.commit()

        def get_test_db():
            with self.Session() as db:
                yield db

        response = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"message":"ok","corrections":[{"element_id":"summary","content":"Tworzę aplikacje."}]}'), finish_reason="stop")],
            usage=SimpleNamespace(prompt_tokens=1000, completion_tokens=1000, total_tokens=2000),
            service_tier="default",
        )
        payload = {"action": "shorten", "elements": [{
            "element_id": "summary", "category": "textarea", "content": content,
            "left": 40, "top": 100, "width": 400, "height": 60, "page": 1,
            "editorMetadata": "x" * padding,
        }]}
        app.dependency_overrides[verify_token] = lambda: {"sub": "reservation-owner"}
        app.dependency_overrides[get_db] = get_test_db
        try:
            with (
                patch.object(route, "resolve_user_from_payload", side_effect=lambda db, _payload: db.get(User, self.user_id)),
                patch.object(service, "_MODEL", "gpt-5.6-terra"),
                patch.object(service._client.chat.completions, "create", return_value=response) as provider,
            ):
                client = TestClient(app)
                first = client.post("/ai/assistant", json=payload, headers={"Idempotency-Key": "affordable-shortening"})
                if rejected:
                    self.assertEqual(first.status_code, 403, first.text)
                    self.assertEqual(first.json()["detail"]["code"], "plan_limit_ai_credits")
                    provider.assert_not_called()
                    with self.Session() as db:
                        usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
                        self.assertEqual(usage.ai_actions_count, 200 - remaining)
                        self.assertEqual(usage.ai_credits_reserved, 0)
                    return
                self.assertEqual(first.status_code, 200, first.text)
                replay = client.post("/ai/assistant", json=payload, headers={"Idempotency-Key": "affordable-shortening"})
                # At zero balance, the existing entitlement gate blocks replay;
                # the 48-credit regression also checks successful replay.
                if remaining == 48:
                    self.assertEqual(replay.json(), first.json())
                provider.assert_called_once()
                cap = provider.call_args.kwargs["max_completion_tokens"]
                if remaining == 48:
                    self.assertEqual(cap, 16_000)
                else:
                    self.assertGreaterEqual(cap, 1000)
                    self.assertLess(cap, 16_000)
                self.assertNotIn("editorMetadata", str(provider.call_args.kwargs["messages"]))
                self.assertIn(content, str(provider.call_args.kwargs["messages"]))
                self.assertEqual(first.json()["usage"]["credits_charged"], 2)
                self.assertEqual(first.json()["corrections"][0]["content"], "Tworzę aplikacje.")
            with self.Session() as db:
                usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
                self.assertEqual(usage.ai_actions_count, 202 - remaining)
                self.assertEqual(usage.ai_credits_reserved, 0)
        finally:
            app.dependency_overrides.clear()

    def test_settlement_replays_without_charging_or_running_twice(self):
        with self.Session() as db:
            claim = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="same-logical-request",
                request_hash="a" * 64,
                reserved_credits=20,
            )
            settled = settle_ai_reservation(
                db,
                user_id=self.user_id,
                reservation_id=claim.reservation_id,
                cost_pln=0.06,
                response_payload={"message": "ok", "usage": {"cost_pln_estimate": 0.06}},
            )
            replay = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="same-logical-request",
                request_hash="a" * 64,
                reserved_credits=20,
            )
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()

        self.assertEqual(settled["usage"]["credits_charged"], 2)
        self.assertEqual(replay.replay_response, settled)
        self.assertEqual(usage.ai_actions_count, 2)
        self.assertEqual(usage.ai_credits_reserved, 0)

    def test_same_key_with_different_payload_is_a_conflict(self):
        with self.Session() as db:
            reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="chat",
                idempotency_key="reused-key",
                request_hash="a" * 64,
                reserved_credits=5,
            )
            with self.assertRaises(AiReservationError) as raised:
                reserve_ai_credits(
                    db,
                    user_id=self.user_id,
                    action="chat",
                    idempotency_key="reused-key",
                    request_hash="b" * 64,
                    reserved_credits=5,
                )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["code"], "idempotency_payload_mismatch")

    def test_confirmed_failure_releases_reserved_credits(self):
        with self.Session() as db:
            claim = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="ats_score",
                idempotency_key="confirmed-failure",
                request_hash="c" * 64,
                reserved_credits=8,
            )
            release_ai_reservation(
                db,
                user_id=self.user_id,
                reservation_id=claim.reservation_id,
            )
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
            reservation = db.query(AiCreditReservation).filter_by(id=claim.reservation_id).one()
        self.assertEqual(usage.ai_actions_count, 0)
        self.assertEqual(usage.ai_credits_reserved, 0)
        self.assertEqual(reservation.status, "released")

    def test_distinct_pending_assistant_requests_do_not_block_each_other(self):
        with self.Session() as db:
            first = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="first-independent-assistant",
                request_hash="8" * 64,
                reserved_credits=20,
            )
            second = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="grammar",
                idempotency_key="second-independent-assistant",
                request_hash="9" * 64,
                reserved_credits=20,
            )
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
            reservations = db.query(AiCreditReservation).filter(
                AiCreditReservation.id.in_([first.reservation_id, second.reservation_id]),
            ).all()

        self.assertEqual(len(reservations), 2)
        self.assertTrue(all(item.status == "pending" for item in reservations))
        self.assertTrue(all(item.active_slot is None for item in reservations))
        self.assertEqual(usage.ai_credits_reserved, 40)

    def test_legacy_pending_assistant_slot_is_released_on_next_reservation(self):
        with self.Session() as db:
            legacy = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="legacy-active-assistant",
                request_hash="a" * 64,
                reserved_credits=20,
            )
            legacy_row = db.query(AiCreditReservation).filter_by(
                id=legacy.reservation_id,
            ).one()
            legacy_row.active_slot = 1
            db.commit()

            reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="grammar",
                idempotency_key="after-legacy-active-assistant",
                request_hash="b" * 64,
                reserved_credits=20,
            )
            db.refresh(legacy_row)
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()

        self.assertEqual(legacy_row.status, "pending")
        self.assertIsNone(legacy_row.active_slot)
        self.assertEqual(usage.ai_credits_reserved, 40)

    def test_pending_cv_import_does_not_block_an_assistant_reservation(self):
        with self.Session() as db:
            import_claim = reserve_cv_import(
                db,
                user_id=self.user_id,
                idempotency_key="pending-import-before-assistant",
                request_hash="c" * 64,
            )
            assistant_claim = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="assistant-during-import",
                request_hash="d" * 64,
                reserved_credits=20,
            )
            imported = db.query(AiCreditReservation).filter_by(
                id=import_claim.reservation_id,
            ).one()
            assistant = db.query(AiCreditReservation).filter_by(
                id=assistant_claim.reservation_id,
            ).one()

        self.assertEqual(imported.active_slot, 1)
        self.assertIsNone(assistant.active_slot)

    def test_pending_assistant_does_not_block_a_cv_import_reservation(self):
        with self.Session() as db:
            assistant_claim = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="pending-assistant-before-import",
                request_hash="e" * 64,
                reserved_credits=20,
            )
            import_claim = reserve_cv_import(
                db,
                user_id=self.user_id,
                idempotency_key="import-during-assistant",
                request_hash="f" * 64,
            )
            assistant = db.query(AiCreditReservation).filter_by(
                id=assistant_claim.reservation_id,
            ).one()
            imported = db.query(AiCreditReservation).filter_by(
                id=import_claim.reservation_id,
            ).one()

        self.assertIsNone(assistant.active_slot)
        self.assertEqual(imported.active_slot, 1)

    def test_expired_uncertain_call_is_charged_at_reserved_ceiling(self):
        started = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        with self.Session() as db:
            first = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="translate",
                idempotency_key="uncertain-call",
                request_hash="d" * 64,
                reserved_credits=12,
                now=started,
            )
            second = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="after-expiry",
                request_hash="e" * 64,
                reserved_credits=3,
                now=started + AI_RESERVATION_TTL + timedelta(seconds=1),
            )
            usage = db.query(UsageCounter).filter_by(
                user_id=self.user_id,
                period_key=current_period_key(started),
            ).one()
            expired = db.query(AiCreditReservation).filter_by(id=first.reservation_id).one()
        self.assertNotEqual(first.reservation_id, second.reservation_id)
        self.assertEqual(expired.status, "expired")
        self.assertEqual(expired.charged_credits, 12)
        self.assertEqual(usage.ai_actions_count, 12)
        self.assertEqual(usage.ai_credits_reserved, 3)

    def test_expiry_across_month_boundary_updates_the_reservation_period(self):
        started = datetime(2026, 8, 31, 23, 55, tzinfo=timezone.utc)
        with self.Session() as db:
            first = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="chat",
                idempotency_key="august-uncertain",
                request_hash="f" * 64,
                reserved_credits=12,
                now=started,
            )
            reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="september-call",
                request_hash="1" * 64,
                reserved_credits=3,
                now=started + AI_RESERVATION_TTL + timedelta(seconds=1),
            )
            august = db.query(UsageCounter).filter_by(
                user_id=self.user_id,
                period_key="2026-08",
            ).one()
            september = db.query(UsageCounter).filter_by(
                user_id=self.user_id,
                period_key="2026-09",
            ).one()
            expired = db.query(AiCreditReservation).filter_by(id=first.reservation_id).one()

        self.assertEqual(expired.status, "expired")
        self.assertEqual(august.ai_actions_count, 12)
        self.assertEqual(august.ai_credits_reserved, 0)
        self.assertEqual(september.ai_actions_count, 0)
        self.assertEqual(september.ai_credits_reserved, 3)

    def test_expired_uncertain_cv_import_consumes_its_original_monthly_slot(self):
        started = datetime(2026, 8, 31, 23, 55, tzinfo=timezone.utc)
        with self.Session() as db:
            first = reserve_cv_import(
                db,
                user_id=self.user_id,
                idempotency_key="uncertain-august-import",
                request_hash="3" * 64,
                now=started,
            )
            reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="september-after-import",
                request_hash="4" * 64,
                reserved_credits=3,
                now=started + AI_RESERVATION_TTL + timedelta(seconds=1),
            )
            august = db.query(UsageCounter).filter_by(
                user_id=self.user_id,
                period_key="2026-08",
            ).one()
            expired = db.query(AiCreditReservation).filter_by(
                id=first.reservation_id,
            ).one()

        self.assertEqual(expired.status, "expired")
        self.assertEqual(august.cv_imports_count, 1)
        self.assertEqual(august.ai_actions_count, 0)

    def test_usage_bearing_invalid_response_charges_actual_not_ceiling(self):
        with self.Session() as db:
            claim = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="rating",
                idempotency_key="invalid-response-with-usage",
                request_hash="2" * 64,
                reserved_credits=20,
            )
            settle_failed_ai_reservation(
                db,
                user_id=self.user_id,
                reservation_id=claim.reservation_id,
                cost_pln=0.06,
            )
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
            reservation = db.query(AiCreditReservation).filter_by(id=claim.reservation_id).one()

        self.assertEqual(usage.ai_actions_count, 2)
        self.assertEqual(usage.ai_credits_reserved, 0)
        self.assertEqual(reservation.status, "failed")
        self.assertEqual(reservation.charged_credits, 2)
        self.assertIsNone(reservation.response_json)

    def test_twenty_concurrent_requests_reserve_only_available_quota(self):
        def attempt(index: int) -> str:
            with self.Session() as db:
                try:
                    reserve_ai_credits(
                        db,
                        user_id=self.user_id,
                        action="rating",
                        idempotency_key=f"concurrent-{index}",
                        request_hash=f"{index:064x}",
                        reserved_credits=20,
                    )
                    return "reserved"
                except (AiReservationError, PlanLimitError):
                    return "rejected"

        with ThreadPoolExecutor(max_workers=20) as executor:
            outcomes = list(executor.map(attempt, range(20)))

        with self.Session() as db:
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
            pending_count = db.query(AiCreditReservation).filter_by(
                user_id=self.user_id,
                status="pending",
            ).count()
        self.assertEqual(outcomes.count("reserved"), 10)
        self.assertEqual(pending_count, 10)
        self.assertEqual(usage.ai_credits_reserved, 200)
        self.assertLessEqual(usage.ai_actions_count + usage.ai_credits_reserved, 200)


if __name__ == "__main__":
    unittest.main()
