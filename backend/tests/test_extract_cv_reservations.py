"""Pre-provider idempotency and concurrency contracts for CV extraction."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Lock
import tempfile
import unittest
from unittest.mock import patch

import fitz
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import DEFAULT_JWT_KEY_VERSION, verify_token
from app.crud.user import create_user
from app.dependencies import get_db
from app.main import app
from app.models.models import AiCreditReservation, Base, CvImportSnapshot, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services.ai_service import CvExtractionError
from app.services.entitlements import seed_plans
from app.testing_support import ensure_test_auth_env


def _valid_pdf_bytes() -> bytes:
    document = fitz.open()
    document.new_page()
    data = document.tobytes()
    document.close()
    return data


class ExtractCvReservationTests(unittest.TestCase):
    """Only a committed active slot may cross the external provider boundary."""

    def setUp(self):
        ensure_test_auth_env()
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "extract-reservations.db"
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
                    username="extract-owner",
                    email="extract-owner@example.test",
                    password="correct horse battery",
                ),
            )
            self.user_id = db.query(User.id).filter_by(username="extract-owner").scalar()

        def _override_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {
            "sub": str(self.user_id),
            "ver": DEFAULT_JWT_KEY_VERSION,
        }
        self.client = TestClient(app)
        self.pdf_bytes = _valid_pdf_bytes()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _post(self, key: str):
        return self.client.post(
            "/ai/extract_cv",
            files={"file": ("cv.pdf", self.pdf_bytes, "application/pdf")},
            headers={"Idempotency-Key": key},
        )

    def test_twenty_requests_make_exactly_one_provider_call(self):
        started = Barrier(20)
        calls_lock = Lock()
        provider_calls = 0

        def provider(_data: bytes):
            nonlocal provider_calls
            with calls_lock:
                provider_calls += 1
            return {"name": "Concurrent Owner"}, {"cost_pln_estimate": 0.01}

        def request(index: int):
            started.wait(timeout=20)
            return self._post(f"concurrent-import-{index}")

        with patch("app.api.routes.ai.extract_cv_data", side_effect=provider):
            with ThreadPoolExecutor(max_workers=20) as executor:
                futures = [executor.submit(request, index) for index in range(20)]
                responses = [future.result(timeout=20) for future in futures]

        self.assertEqual(provider_calls, 1)
        self.assertEqual(sum(response.status_code == 200 for response in responses), 1)
        self.assertEqual(
            sum(response.status_code in {403, 429} for response in responses),
            19,
        )
        with self.Session() as db:
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
            snapshots = db.query(CvImportSnapshot).filter_by(owner_id=self.user_id).all()
            reservations = db.query(AiCreditReservation).filter_by(user_id=self.user_id).all()
        self.assertEqual(usage.cv_imports_count, 1)
        self.assertEqual([snapshot.status for snapshot in snapshots], ["succeeded"])
        self.assertEqual([reservation.status for reservation in reservations], ["settled"])

    def test_settled_duplicate_replays_snapshot_without_provider_call(self):
        with patch(
            "app.api.routes.ai.extract_cv_data",
            return_value=({"name": "Replay Owner"}, {"cost_pln_estimate": 0.01}),
        ) as provider:
            first = self._post("stable-import-key")
            replay = self._post("stable-import-key")

        self.assertEqual(first.status_code, 200, msg=first.text)
        self.assertEqual(replay.status_code, 200, msg=replay.text)
        self.assertEqual(first.json()["import"]["id"], replay.json()["import"]["id"])
        self.assertEqual(provider.call_count, 1)
        with self.Session() as db:
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
        self.assertEqual(usage.cv_imports_count, 1)

    def test_uncertain_provider_timeout_keeps_slot_until_lease_expiry(self):
        timeout = CvExtractionError(
            "extract_provider_timeout",
            "Usługa importu nie odpowiedziała na czas.",
            status_code=503,
            retryable=True,
            reservation_outcome="uncertain",
        )
        with patch("app.api.routes.ai.extract_cv_data", side_effect=timeout) as provider:
            first = self._post("uncertain-import")
            second = self._post("must-not-start-another-provider")

        self.assertEqual(first.status_code, 503, msg=first.text)
        self.assertEqual(second.status_code, 429, msg=second.text)
        self.assertEqual(second.json()["detail"]["code"], "ai_operation_active")
        self.assertEqual(provider.call_count, 1)
        with self.Session() as db:
            reservation = db.query(AiCreditReservation).filter_by(
                user_id=self.user_id,
                idempotency_key="uncertain-import",
            ).one()
        self.assertEqual(reservation.status, "pending")
        self.assertEqual(reservation.active_slot, 1)

    def test_provider_success_with_failed_finalization_keeps_reservation_pending(self):
        provider_result = ({"name": "Settled Owner"}, {"cost_pln_estimate": 0.01})
        with (
            patch("app.api.routes.ai.extract_cv_data", return_value=provider_result) as provider,
            patch(
                "app.api.routes.ai.record_cv_import",
                side_effect=RuntimeError("database settlement failed"),
            ),
        ):
            failed = self._post("settlement-failure")
            blocked = self._post("must-wait-for-conservative-expiry")

        self.assertEqual(failed.status_code, 500, msg=failed.text)
        self.assertEqual(blocked.status_code, 429, msg=blocked.text)
        self.assertEqual(blocked.json()["detail"]["code"], "ai_operation_active")
        self.assertEqual(provider.call_count, 1)
        with self.Session() as db:
            reservation = db.query(AiCreditReservation).filter_by(
                user_id=self.user_id,
                idempotency_key="settlement-failure",
            ).one()
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
        self.assertEqual(reservation.status, "pending")
        self.assertEqual(reservation.active_slot, 1)
        self.assertEqual(usage.cv_imports_count, 0)

    def test_confirmed_malformed_provider_response_consumes_import_slot(self):
        malformed = CvExtractionError(
            "extract_provider_invalid_response",
            "Nie udało się rozpoznać danych w tym CV.",
            status_code=422,
            reservation_outcome="consume",
        )
        with patch("app.api.routes.ai.extract_cv_data", side_effect=malformed) as provider:
            failed = self._post("malformed-provider-response")
            blocked = self._post("new-key-after-paid-malformed-response")

        self.assertEqual(failed.status_code, 422, msg=failed.text)
        self.assertEqual(blocked.status_code, 403, msg=blocked.text)
        self.assertEqual(blocked.json()["detail"]["code"], "plan_limit_cv_imports")
        self.assertEqual(provider.call_count, 1)
        with self.Session() as db:
            reservation = db.query(AiCreditReservation).filter_by(
                user_id=self.user_id,
                idempotency_key="malformed-provider-response",
            ).one()
            usage = db.query(UsageCounter).filter_by(user_id=self.user_id).one()
        self.assertEqual(reservation.status, "failed")
        self.assertIsNone(reservation.active_slot)
        self.assertEqual(usage.cv_imports_count, 1)


if __name__ == "__main__":
    unittest.main()
