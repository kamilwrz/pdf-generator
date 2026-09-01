"""Atomic quota, idempotency, and recovery tests for AI reservations."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest

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

    def test_expired_uncertain_call_is_charged_at_reserved_ceiling(self):
        started = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        with self.Session() as db:
            first = reserve_ai_credits(
                db,
                user_id=self.user_id,
                action="layout",
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
                action="layout",
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

    def test_twenty_concurrent_requests_never_exceed_quota_or_active_slot(self):
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
            active_count = db.query(AiCreditReservation).filter_by(
                user_id=self.user_id,
                status="pending",
            ).count()
        self.assertEqual(outcomes.count("reserved"), 1)
        self.assertEqual(active_count, 1)
        self.assertLessEqual(usage.ai_actions_count + usage.ai_credits_reserved, 200)


if __name__ == "__main__":
    unittest.main()
