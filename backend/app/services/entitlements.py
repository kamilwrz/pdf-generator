"""Plan entitlements, usage meters, and Free-tier enforcement.

Stripe checkout/webhooks come later — they will flip `UserSubscription.plan_slug`
and fill `Payment` / stripe_* columns. All gates already read subscription state.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Pdf, Plan, UsageCounter, User, UserSubscription

# Must match frontend TEMPLATES entries with tier: "free" in
# frontend/src/templates/index.js. Enforced by tests/test_template_registry_sync.py.
FREE_STARTER_TEMPLATE_IDS: tuple[str, ...] = (
    "ledger",
    "nimbus",
    "kernel",
    "regent",
    "nova",
)

PLAN_SEEDS: list[dict[str, Any]] = [
    {
        "slug": "free",
        "name": "Free",
        "max_projects": 1,
        "max_exports_per_month": 3,
        "max_ai_actions_per_month": 0,
        "ai_assistant": False,
        "extract_cv": False,
        "template_tier": "starter",
        "stripe_price_id_monthly": None,
        "is_active": True,
    },
    {
        "slug": "standard",
        "name": "Standard",
        "max_projects": 10,
        "max_exports_per_month": 30,
        "max_ai_actions_per_month": 150,
        "ai_assistant": True,
        "extract_cv": True,
        "template_tier": "all",
        "stripe_price_id_monthly": None,
        "is_active": True,
    },
    {
        "slug": "premium",
        "name": "Premium",
        "max_projects": None,
        "max_exports_per_month": None,
        "max_ai_actions_per_month": 300,
        "ai_assistant": True,
        "extract_cv": True,
        "template_tier": "all",
        "stripe_price_id_monthly": None,
        "is_active": True,
    },
]


CREDIT_PLN = 0.05  # 1 AI credit = 5 groszy

# The layout session sends the complete multi-page canvas to the dedicated
# geometry model. Keep this explicit action-level gate separate from the
# general AI-assistant flag so Standard retains its content-focused analyses.
PREMIUM_ONLY_AI_ACTIONS: frozenset[str] = frozenset({"layout"})


def credits_for_cost(cost_pln: float) -> int:
    """Credit cost of one AI call, charged at real cost, minimum 1 per call."""
    try:
        cost = float(cost_pln)
    except (TypeError, ValueError):
        cost = 0.0
    return max(1, math.ceil(cost / CREDIT_PLN))


class PlanLimitError(HTTPException):
    """403 with a structured detail payload for frontend upgrade UX."""

    def __init__(self, code: str, message: str, *, upgrade_required: str = "standard"):
        super().__init__(
            status_code=403,
            detail={
                "code": code,
                "message": message,
                "upgrade_required": upgrade_required,
            },
        )


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def current_period_key(now: datetime | None = None) -> str:
    moment = now or _utcnow()
    return f"{moment.year:04d}-{moment.month:02d}"


def seed_plans(db: Session) -> None:
    """Upsert Free/Standard/Premium catalog rows (idempotent)."""
    for seed in PLAN_SEEDS:
        existing = db.query(Plan).filter(Plan.slug == seed["slug"]).first()
        if existing is None:
            db.add(Plan(**seed))
            continue
        for key, value in seed.items():
            if key == "slug":
                continue
            setattr(existing, key, value)
    db.commit()


def migrate_pro_to_premium(db: Session) -> int:
    """One-time, idempotent rename of legacy 'pro' subscriptions to 'premium'.

    Also deactivates any stale 'pro' catalog row. Safe to run on every boot.
    """
    migrated = (
        db.query(UserSubscription)
        .filter(UserSubscription.plan_slug == "pro")
        .update({UserSubscription.plan_slug: "premium"}, synchronize_session=False)
    )
    stale = db.query(Plan).filter(Plan.slug == "pro").first()
    if stale is not None:
        stale.is_active = False
    if migrated or stale is not None:
        db.commit()
    return int(migrated)


def ensure_free_subscription(db: Session, user_id: int) -> UserSubscription:
    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    if sub is not None:
        return sub
    now = _utcnow()
    sub = UserSubscription(
        user_id=user_id,
        plan_slug="free",
        status="active",
        current_period_start=now,
        current_period_end=None,
        updated_at=now,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def backfill_free_subscriptions(db: Session) -> int:
    """Assign Free to every user missing a subscription row."""
    existing_ids = {
        row.user_id for row in db.query(UserSubscription.user_id).all()
    }
    created = 0
    now = _utcnow()
    for user in db.query(User).all():
        if user.id in existing_ids:
            continue
        db.add(
            UserSubscription(
                user_id=user.id,
                plan_slug="free",
                status="active",
                current_period_start=now,
                current_period_end=None,
                updated_at=now,
            )
        )
        created += 1
    if created:
        db.commit()
    return created


def bootstrap_billing(db: Session) -> None:
    """Called from app startup after create_all."""
    seed_plans(db)
    migrate_pro_to_premium(db)
    backfill_free_subscriptions(db)


def get_or_create_subscription(db: Session, user_id: int) -> UserSubscription:
    return ensure_free_subscription(db, user_id)


SELECTABLE_PLANS: frozenset[str] = frozenset({"free", "standard", "premium"})

# Marketing prices (PLN / month) — Stripe will own real amounts later.
PLAN_DISPLAY: dict[str, dict[str, Any]] = {
    "free": {
        "price_pln": 0,
        "blurb": "Edytor, wybrane szablony i eksport PDF.",
        "highlights": [
            "5 szablonów startowych",
            "1 projekt · 3 eksporty / mies.",
            "Bez Asystenta AI",
        ],
    },
    "standard": {
        "price_pln": 29,
        "blurb": "Analizy AI treści i pełna biblioteka szablonów.",
        "highlights": [
            "150 kredytów AI / mies.",
            "CV, projekt, dopasowanie, gramatyka, styl i ATS",
            "Wszystkie 14 szablonów",
            "10 projektów · 30 eksportów / mies.",
        ],
    },
    "premium": {
        "price_pln": 49,
        "blurb": "Tryb Układ AI i bez limitów projektów.",
        "highlights": [
            "300 kredytów AI / mies.",
            "Tryb Układ: geometria i propozycje zmian",
            "Wszystkie 14 szablonów",
            "Bez limitu projektów i eksportów",
        ],
    },
}


def list_selectable_plans(db: Session) -> list[dict[str, Any]]:
    """Active catalog rows enriched with display copy for the plan picker."""
    rows = (
        db.query(Plan)
        .filter(Plan.slug.in_(SELECTABLE_PLANS), Plan.is_active.is_(True))
        .all()
    )
    by_slug = {row.slug: row for row in rows}
    ordered: list[dict[str, Any]] = []
    for slug in ("free", "standard", "premium"):
        row = by_slug.get(slug)
        if row is None:
            continue
        display = PLAN_DISPLAY.get(slug, {})
        ordered.append({
            "slug": row.slug,
            "name": row.name,
            "price_pln": display.get("price_pln", 0),
            "blurb": display.get("blurb", ""),
            "highlights": display.get("highlights", []),
            "max_projects": row.max_projects,
            "max_exports_per_month": row.max_exports_per_month,
            "monthly_ai_credits": row.max_ai_actions_per_month,
            "ai_assistant": bool(row.ai_assistant),
            "extract_cv": bool(row.extract_cv),
            "template_tier": row.template_tier,
            # Populated when Stripe products are wired.
            "stripe_price_id_monthly": row.stripe_price_id_monthly,
        })
    return ordered


def set_user_plan(db: Session, user_id: int, plan_slug: str) -> UserSubscription:
    """Activate `plan_slug` for a user (pre-Stripe, no payment). Idempotent."""
    if plan_slug not in SELECTABLE_PLANS:
        raise ValueError(f"Nieznany plan: {plan_slug}")
    sub = get_or_create_subscription(db, user_id)
    sub.plan_slug = plan_slug
    sub.status = "active"
    sub.updated_at = _utcnow()
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def get_plan(db: Session, plan_slug: str) -> Plan:
    plan = db.query(Plan).filter(Plan.slug == plan_slug, Plan.is_active.is_(True)).first()
    if plan is None:
        # Fall back to free if catalog is missing/corrupt
        plan = db.query(Plan).filter(Plan.slug == "free").first()
    if plan is None:
        raise RuntimeError("Plan catalog is empty — seed_plans() did not run.")
    return plan


def _usage_row(db: Session, user_id: int, period_key: str | None = None) -> UsageCounter:
    key = period_key or current_period_key()
    row = (
        db.query(UsageCounter)
        .filter(UsageCounter.user_id == user_id, UsageCounter.period_key == key)
        .first()
    )
    if row is None:
        row = UsageCounter(
            user_id=user_id,
            period_key=key,
            exports_count=0,
            ai_actions_count=0,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def allowed_template_ids(plan: Plan) -> list[str]:
    if plan.template_tier == "all":
        return []  # empty means "all" — FE treats empty+all as unrestricted
    return list(FREE_STARTER_TEMPLATE_IDS)


def get_entitlements(db: Session, user: User) -> dict[str, Any]:
    sub = get_or_create_subscription(db, user.id)
    plan = get_plan(db, sub.plan_slug)
    usage = _usage_row(db, user.id)
    project_count = db.query(Pdf).filter(Pdf.owner_id == user.id).count()

    max_projects = plan.max_projects
    max_exports = plan.max_exports_per_month
    max_ai = plan.max_ai_actions_per_month

    def remaining(used: int, limit: int | None) -> int | None:
        if limit is None:
            return None
        return max(0, limit - used)

    starter_ids = list(FREE_STARTER_TEMPLATE_IDS)
    template_ids = starter_ids if plan.template_tier == "starter" else None

    return {
        "plan_slug": plan.slug,
        "plan_name": plan.name,
        "status": sub.status,
        "ai_assistant": bool(plan.ai_assistant),
        "extract_cv": bool(plan.extract_cv),
        "template_tier": plan.template_tier,
        "allowed_template_ids": template_ids,
        "limits": {
            "max_projects": max_projects,
            "max_exports_per_month": max_exports,
            "monthly_ai_credits": max_ai,
        },
        "usage": {
            "period_key": usage.period_key,
            "projects": project_count,
            "exports_count": usage.exports_count,
            "ai_credits_used": usage.ai_actions_count,
        },
        "remaining": {
            "projects": remaining(project_count, max_projects),
            "exports": remaining(usage.exports_count, max_exports),
            "ai_credits": remaining(usage.ai_actions_count, max_ai),
        },
        "stripe_customer_id": sub.stripe_customer_id,
        "stripe_subscription_id": sub.stripe_subscription_id,
    }


def assert_can_create_project(db: Session, user: User) -> None:
    """Raise PlanLimitError when the user already hit max_projects."""
    entitlements = get_entitlements(db, user)
    limit = entitlements["limits"]["max_projects"]
    if limit is None:
        return
    if entitlements["usage"]["projects"] >= limit:
        raise PlanLimitError(
            "plan_limit_projects",
            f"Plan {entitlements['plan_name']} pozwala na maksymalnie {limit} projekt(y). "
            "Ulepsz plan, aby dodać kolejny.",
        )


def assert_can_export(db: Session, user: User) -> None:
    """Raise PlanLimitError when monthly export quota is exhausted."""
    entitlements = get_entitlements(db, user)
    limit = entitlements["limits"]["max_exports_per_month"]
    if limit is None:
        return
    if entitlements["usage"]["exports_count"] >= limit:
        raise PlanLimitError(
            "plan_limit_exports",
            f"Wykorzystano limit {limit} eksportów w tym miesiącu na planie "
            f"{entitlements['plan_name']}. Ulepsz plan, aby pobrać więcej PDF.",
        )


def assert_has_ai_credits(db: Session, user: User) -> None:
    """Block-at-zero gate shared by every metered AI action.

    Unlimited plans (monthly_ai_credits is None) never block.
    """
    entitlements = get_entitlements(db, user)
    limit = entitlements["limits"]["monthly_ai_credits"]
    if limit is not None and entitlements["usage"]["ai_credits_used"] >= limit:
        raise PlanLimitError(
            "plan_limit_ai_credits",
            "Wykorzystano miesięczny limit kredytów AI.",
            upgrade_required="premium" if entitlements["plan_slug"] == "standard" else "standard",
        )


def assert_can_use_ai_assistant(db: Session, user: User) -> None:
    """Require ai_assistant feature flag plus remaining AI credits."""
    entitlements = get_entitlements(db, user)
    if not entitlements["ai_assistant"]:
        raise PlanLimitError(
            "plan_feature_ai_assistant",
            "Asystent AI jest dostępny w planie Standard.",
        )
    assert_has_ai_credits(db, user)


def assert_can_use_ai_action(db: Session, user: User, action: str) -> None:
    """Require the plan entitlement for one requested AI-assistant action.

    Standard includes the regular assistant actions: CV and design ratings,
    role fit, grammar, style, improvement, ATS guidance, and ordinary chat.
    ``layout`` is deliberately Premium-only because it performs a separate
    full-canvas geometry session with the higher-cost layout model.

    The plan check runs before the general assistant gate so users requesting
    ``layout`` always receive the precise Premium upgrade message instead of
    a generic Standard-assistant message.

    @param db - Active database session used to resolve the subscription.
    @param user - Authenticated user requesting the action.
    @param action - Valid assistant action name, already checked by the route.
    @raises PlanLimitError - When the selected plan cannot use the action or
        has no remaining AI credits.
    """
    entitlements = get_entitlements(db, user)
    if action in PREMIUM_ONLY_AI_ACTIONS and entitlements["plan_slug"] != "premium":
        raise PlanLimitError(
            "plan_feature_ai_layout",
            "Tryb Układ jest dostępny wyłącznie w planie Premium.",
            upgrade_required="premium",
        )
    assert_can_use_ai_assistant(db, user)


def assert_can_extract_cv(db: Session, user: User) -> None:
    """Require extract_cv feature flag plus remaining AI credits."""
    entitlements = get_entitlements(db, user)
    if not entitlements["extract_cv"]:
        raise PlanLimitError(
            "plan_feature_extract_cv",
            "Ekstrakcja CV z PDF jest dostępna w planie Standard.",
        )
    assert_has_ai_credits(db, user)


def assert_template_allowed(db: Session, user: User, template_id: str) -> None:
    """Block Free-tier users from non-starter templates."""
    entitlements = get_entitlements(db, user)
    allowed = entitlements["allowed_template_ids"]
    if allowed is None:
        return
    if template_id not in allowed:
        raise PlanLimitError(
            "plan_feature_template",
            "Ten szablon jest dostępny w planie Standard.",
        )


def record_export(db: Session, user_id: int) -> UsageCounter:
    """Increment this month's export counter after a successful download gate."""
    row = _usage_row(db, user_id)
    row.exports_count = int(row.exports_count or 0) + 1
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def reset_ai_credits(db: Session, user_id: int) -> UsageCounter:
    """Set this month's AI credit usage to zero (full plan allowance again)."""
    row = _usage_row(db, user_id)
    row.ai_actions_count = 0
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def charge_ai_credits(db: Session, user_id: int, cost_pln: float) -> UsageCounter:
    """Add credit cost for one AI call to this month's usage meter and commit."""
    row = _usage_row(db, user_id)
    row.ai_actions_count = int(row.ai_actions_count or 0) + credits_for_cost(cost_pln)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
