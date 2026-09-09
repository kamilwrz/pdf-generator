"""Thin Stripe SDK boundary used by billing routes and unit tests."""
from __future__ import annotations

from app.core.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET


def _stripe():
    if not STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe is not configured.")
    import stripe

    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


def create_checkout_session(*, user_id: int, email: str, price_id: str, success_url: str, cancel_url: str, idempotency_key: str):
    """Create one hosted Checkout attempt for the 30-day Pro pass."""
    stripe = _stripe()
    return stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": price_id, "quantity": 1}],
        client_reference_id=str(user_id),
        customer_email=email,
        metadata={"user_id": str(user_id), "plan_slug": "pro"},
        success_url=success_url,
        cancel_url=cancel_url,
        idempotency_key=idempotency_key,
    )


def construct_webhook_event(payload: bytes, signature: str):
    """Return a signature-verified Stripe event."""
    if not STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("Stripe webhook verification is not configured.")
    return _stripe().Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
