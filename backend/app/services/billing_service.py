"""Transactional fulfillment for the one-time Stripe Pro pass."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.models import Payment, UserSubscription
from app.services.entitlements import PRO_PASS_DAYS, get_or_create_subscription, reset_ai_credits


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def fulfill_pro_payment(
    db: Session,
    *,
    payment: Payment,
    event_id: str,
    amount_cents: int | None,
    currency: str,
    customer_id: str | None,
) -> bool:
    """Activate exactly once and extend an active pass instead of truncating it.

    The payment row and subscription row are locked in the same transaction.
    The unique provider references remain the final guard if concurrent Stripe
    deliveries reach different workers before either transaction commits.
    """
    locked_payment = (
        db.query(Payment)
        .filter(Payment.id == payment.id)
        .with_for_update()
        .one()
    )
    if locked_payment.status == "succeeded":
        return False
    sub = (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == locked_payment.user_id)
        .with_for_update()
        .one_or_none()
    ) or get_or_create_subscription(db, locked_payment.user_id)
    now = datetime.now(timezone.utc)
    current_end = _as_utc(sub.current_period_end)
    starts_from = current_end if current_end and current_end > now else now
    sub.plan_slug = "pro"
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = starts_from + timedelta(days=PRO_PASS_DAYS)
    sub.updated_at = now
    if customer_id:
        sub.stripe_customer_id = customer_id

    locked_payment.status = "succeeded"
    locked_payment.provider_event_id = event_id
    locked_payment.amount_cents = amount_cents
    locked_payment.currency = (currency or "pln").lower()
    locked_payment.paid_at = now
    db.add_all([sub, locked_payment])
    db.commit()
    # Existing entitlement semantics intentionally grant a fresh Pro allowance
    # when a paid pass starts. Duplicate events return above and cannot reset it.
    reset_ai_credits(db, locked_payment.user_id)
    return True
