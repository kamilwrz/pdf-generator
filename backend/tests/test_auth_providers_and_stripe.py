"""Email verification, Google identity, and Stripe fulfillment contracts."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import auth as auth_routes
from app.api.routes import billing as billing_routes
from app.core.security import verify_token
from app.crud.user import create_user, get_user_by_email
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Payment, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.services.email_verification import (
    consume_email_verification_token,
    issue_email_verification_token,
)
from app.services.entitlements import seed_plans
from app.testing_support import ensure_test_auth_env


PASSWORD = "correct horse battery"


class AuthProviderAndBillingTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        seed_plans(self.db)

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_password_registration_requires_single_use_email_proof(self):
        with patch.object(auth_routes, "send_verification_email", return_value=True):
            response = self.client.post("/auth/register", json={
                "username": "verify-user",
                "email": "verify@example.test",
                "password": PASSWORD,
            })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "verification_required")
        user = get_user_by_email(self.db, "verify@example.test")
        self.assertIsNone(user.email_verified_at)
        blocked = self.client.post("/auth/token", data={"username": "verify-user", "password": PASSWORD})
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["detail"]["code"], "email_unverified")

        token = issue_email_verification_token(self.db, user.id)
        self.assertEqual(consume_email_verification_token(self.db, token).id, user.id)
        self.assertIsNone(consume_email_verification_token(self.db, token))
        logged_in = self.client.post("/auth/token", data={"username": "verify-user", "password": PASSWORD})
        self.assertEqual(logged_in.status_code, 200)

    def test_resend_limit_canonicalizes_email_case(self):
        addresses = ["Missing@Example.test", "missing@example.test", "MISSING@example.test"]
        for address in addresses:
            response = self.client.post("/auth/resend-verification", json={"email": address})
            self.assertEqual(response.status_code, 202)
        blocked = self.client.post(
            "/auth/resend-verification",
            json={"email": "missing@EXAMPLE.test"},
        )
        self.assertEqual(blocked.status_code, 429)

    def test_google_creates_passwordless_free_account_and_reuses_subject(self):
        claims = {"sub": "google-sub-1", "email": "person@gmail.com", "email_verified": True}
        with patch.object(auth_routes, "verify_google_credential", return_value=claims):
            first = self.client.post("/auth/google", json={"credential": "signed-token"})
            second = self.client.post("/auth/google", json={"credential": "signed-token"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        user = get_user_by_email(self.db, "person@gmail.com")
        self.assertEqual(user.google_sub, "google-sub-1")
        self.assertIsNone(user.argon2_password_hash)
        self.assertEqual(
            self.db.query(UserSubscription).filter_by(user_id=user.id).one().plan_slug,
            "free",
        )

    def test_google_does_not_silently_link_existing_password_account(self):
        create_user(self.db, UserCreateRequest(
            username="local-user", email="same@example.test", password=PASSWORD,
        ))
        claims = {"sub": "google-sub-2", "email": "same@example.test", "email_verified": True}
        with patch.object(auth_routes, "verify_google_credential", return_value=claims):
            response = self.client.post("/auth/google", json={"credential": "signed-token"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "google_link_required")

    def test_google_link_rejects_verified_claims_without_subject(self):
        create_user(self.db, UserCreateRequest(
            username="link-user", email="link@example.test", password=PASSWORD,
        ))
        user = get_user_by_email(self.db, "link@example.test")
        app.dependency_overrides[auth_routes.get_current_user] = lambda: user
        claims = {"email": "link@example.test", "email_verified": True}
        with patch.object(auth_routes, "verify_google_credential", return_value=claims):
            response = self.client.post("/auth/google/link", json={"credential": "signed-token"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "google_email_mismatch")

    def test_checkout_waits_for_paid_signature_verified_webhook(self):
        create_user(self.db, UserCreateRequest(
            username="buyer", email="buyer@example.test", password=PASSWORD,
        ))
        app.dependency_overrides[verify_token] = lambda: {"sub": "buyer"}
        checkout = SimpleNamespace(id="cs_test_1", url="https://checkout.stripe.test/cs_test_1")
        with (
            patch.object(billing_routes, "ALLOW_UNPAID_PLAN_SELECTION", False),
            patch.object(billing_routes, "STRIPE_SECRET_KEY", "sk_test"),
            patch.object(billing_routes, "STRIPE_PRICE_PRO", "price_pro"),
            patch.object(billing_routes, "create_checkout_session", return_value=checkout),
        ):
            response = self.client.post(
                "/billing/select-plan",
                json={"plan_slug": "pro"},
                headers={"Idempotency-Key": "checkout-attempt-1"},
            )
        self.assertEqual(response.status_code, 200)
        buyer = get_user_by_email(self.db, "buyer@example.test")
        sub = self.db.query(UserSubscription).filter_by(user_id=buyer.id).one()
        self.assertEqual(sub.plan_slug, "free")

        event = {
            "id": "evt_test_1",
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": "cs_test_1",
                "payment_status": "paid",
                "amount_total": 5900,
                "currency": "pln",
                "customer": "cus_test_1",
                "client_reference_id": str(buyer.id),
                "metadata": {"user_id": str(buyer.id), "plan_slug": "pro"},
            }},
        }
        with patch.object(billing_routes, "construct_webhook_event", return_value=event):
            first = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "valid"})
            second = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "valid"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.json()["status"], "already_processed")
        self.db.expire_all()
        self.assertEqual(self.db.query(UserSubscription).filter_by(user_id=buyer.id).one().plan_slug, "pro")
        payment = self.db.query(Payment).filter_by(provider_ref="cs_test_1").one()
        self.assertEqual(payment.status, "succeeded")
        self.assertEqual(payment.provider_event_id, "evt_test_1")

    def test_bad_stripe_signature_never_activates(self):
        with patch.object(billing_routes, "construct_webhook_event", side_effect=ValueError("bad")):
            response = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "bad"})
        self.assertEqual(response.status_code, 400)

    def test_signed_webhook_cannot_fulfill_an_unknown_checkout_session(self):
        event = {
            "id": "evt_unknown",
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": "cs_dashboard_created",
                "payment_status": "paid",
                "amount_total": 5900,
                "currency": "pln",
            }},
        }
        with patch.object(billing_routes, "construct_webhook_event", return_value=event):
            response = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "valid"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(Payment).count(), 0)

    def test_signed_webhook_rejects_an_amount_mismatch(self):
        create_user(self.db, UserCreateRequest(
            username="amount-user", email="amount@example.test", password=PASSWORD,
        ))
        user = get_user_by_email(self.db, "amount@example.test")
        self.db.add(Payment(
            user_id=user.id,
            provider="stripe",
            provider_ref="cs_amount_mismatch",
            plan_slug="pro",
            amount_cents=5900,
            currency="pln",
            status="pending",
            created_at=datetime.now(timezone.utc),
        ))
        self.db.commit()
        event = {
            "id": "evt_amount_mismatch",
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": "cs_amount_mismatch",
                "payment_status": "paid",
                "amount_total": 100,
                "currency": "pln",
            }},
        }
        with patch.object(billing_routes, "construct_webhook_event", return_value=event):
            response = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "valid"})
        self.assertEqual(response.status_code, 409)
        self.db.expire_all()
        self.assertEqual(self.db.query(UserSubscription).filter_by(user_id=user.id).one().plan_slug, "free")


if __name__ == "__main__":
    unittest.main()
