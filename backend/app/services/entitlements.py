"""Plan entitlements, usage meters, and Free/Pro enforcement.

Product catalog is two tiers:
- Free (Darmowy) — create and preview a CV (watermarked export, starter templates).
- Pro — clean PDF + full templates + AI, activated as a 30-day pass (not an
  auto-renewing subscription). Fair-use AI budget is 200 credits / period.

Stripe checkout/webhooks come later — they will flip `UserSubscription.plan_slug`
and fill `Payment` / stripe_* columns. All gates already read subscription state.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Pdf, Plan, UsageCounter, User, UserSubscription

# Must match frontend TEMPLATES entries with tier: "free" in
# frontend/src/templates/index.js. Enforced by tests/test_template_registry_sync.py.
FREE_STARTER_TEMPLATE_IDS: tuple[str, ...] = (
    "regent",
    "sterling",
)

# Length of a paid Pro activation window (one-shot pass, not auto-renew).
PRO_PASS_DAYS = 30

PLAN_SEEDS: list[dict[str, Any]] = [
    {
        "slug": "free",
        "name": "Darmowy",
        "max_projects": 1,
        "max_exports_per_month": 3,
        "max_ai_actions_per_month": 0,
        "max_cv_imports_per_month": 3,
        "ai_assistant": False,
        "extract_cv": True,
        "template_tier": "starter",
        "stripe_price_id_monthly": None,
        "is_active": True,
    },
    {
        "slug": "pro",
        "name": "Pro",
        "max_projects": None,
        "max_exports_per_month": None,
        "max_ai_actions_per_month": 200,
        "max_cv_imports_per_month": None,
        "ai_assistant": True,
        "extract_cv": True,
        "template_tier": "all",
        "stripe_price_id_monthly": None,
        "is_active": True,
    },
]

# Legacy three-tier slugs accepted at registration / select-plan and remapped.
LEGACY_PLAN_ALIASES: dict[str, str] = {
    "standard": "pro",
    "premium": "pro",
}

CREDIT_PLN = 0.05  # 1 AI credit = 5 groszy

# Layout is included in Pro (no separate Premium tier). Kept as an empty set so
# action-level gates stay structured if a future exclusive action appears.
# Appearance goal in the AI assistant: typography review + full-canvas layout.
# Content actions (rating, grammar, translate, …) stay on the general AI plan.
PRO_ONLY_AI_ACTIONS: frozenset[str] = frozenset({"design_rating", "layout"})


def normalize_plan_slug(plan_slug: str | None) -> str:
    """Map legacy Standard/Premium labels onto the live Free/Pro catalog."""
    slug = (plan_slug or "free").strip().lower() or "free"
    return LEGACY_PLAN_ALIASES.get(slug, slug)


def credits_for_cost(cost_pln: float) -> int:
    """Credit cost of one AI call, charged at real cost, minimum 1 per call."""
    try:
        cost = float(cost_pln)
    except (TypeError, ValueError):
        cost = 0.0
    return max(1, math.ceil(cost / CREDIT_PLN))


class PlanLimitError(HTTPException):
    """403 with a structured detail payload for frontend upgrade UX."""

    def __init__(self, code: str, message: str, *, upgrade_required: str = "pro"):
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


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def current_period_key(now: datetime | None = None) -> str:
    moment = now or _utcnow()
    return f"{moment.year:04d}-{moment.month:02d}"


def seed_plans(db: Session) -> None:
    """Upsert Free/Pro catalog rows and deactivate retired Standard/Premium."""
    for seed in PLAN_SEEDS:
        existing = db.query(Plan).filter(Plan.slug == seed["slug"]).first()
        if existing is None:
            db.add(Plan(**seed))
            continue
        for key, value in seed.items():
            if key == "slug":
                continue
            setattr(existing, key, value)
    for stale_slug in ("standard", "premium"):
        stale = db.query(Plan).filter(Plan.slug == stale_slug).first()
        if stale is not None:
            stale.is_active = False
    db.commit()


def migrate_legacy_plans_to_pro(db: Session) -> int:
    """Idempotent remap of legacy paid slugs onto `pro`.

    Covers historical `pro` rows (pre-Premium rename), `standard`, and
    `premium`. Deactivates any leftover `standard` / `premium` / orphan
    `pro` catalog confusion after `seed_plans` has written the live Pro row.
    """
    migrated = 0
    for legacy in ("standard", "premium"):
        migrated += (
            db.query(UserSubscription)
            .filter(UserSubscription.plan_slug == legacy)
            .update({UserSubscription.plan_slug: "pro"}, synchronize_session=False)
        )
    # Older installs used slug `pro` before it was renamed to premium; those
    # rows are already on the target slug. Ensure the live `pro` Plan row is
    # active (seed_plans) and retire any accidental inactive duplicate.
    for stale_slug in ("standard", "premium"):
        stale = db.query(Plan).filter(Plan.slug == stale_slug).first()
        if stale is not None:
            stale.is_active = False
    if migrated:
        db.commit()
    else:
        db.commit()
    return int(migrated)


# Back-compat name used by older tests / docs.
def migrate_pro_to_premium(db: Session) -> int:
    """Deprecated alias — forwards to Free/Pro migration."""
    return migrate_legacy_plans_to_pro(db)


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
    migrate_legacy_plans_to_pro(db)
    backfill_free_subscriptions(db)


def get_or_create_subscription(db: Session, user_id: int) -> UserSubscription:
    return ensure_free_subscription(db, user_id)


SELECTABLE_PLANS: frozenset[str] = frozenset({"free", "pro"})

# Marketing prices — Stripe will own real amounts later. Pro is a 30-day pass.
PLAN_DISPLAY: dict[str, dict[str, Any]] = {
    "free": {
        "price_pln": 0,
        "price_label": "0 zł",
        "blurb": "Stwórz i sprawdź swoje CV.",
        "highlights": [
            "Kreator i pełna edycja A4",
            "2 podstawowe szablony",
            "3 importy CV / mies.",
            "PDF ze znakiem CV Studio",
            "1 zapisany dokument · 3 eksporty / mies.",
        ],
        "cta": "Stwórz CV za darmo",
        "badge": None,
        "period_note": "Bez karty. Bez zobowiązań.",
    },
    "pro": {
        "price_pln": 59,
        "price_label": "59 zł / 30 dni",
        "blurb": "Gotowe CV do wysłania.",
        "highlights": [
            "PDF bez znaku wodnego",
            "Wszystkie 10 szablonów",
            "Importy CV bez limitu",
            "AI do treści, ATS i układu",
            "200 kredytów AI · wiele wersji CV",
        ],
        "cta": "Odblokuj Pro",
        "badge": "Najlepszy wybór do szukania pracy",
        "period_note": "Jedna płatność · Bez automatycznego odnawiania",
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
    for slug in ("free", "pro"):
        row = by_slug.get(slug)
        if row is None:
            continue
        display = PLAN_DISPLAY.get(slug, {})
        ordered.append({
            "slug": row.slug,
            "name": row.name,
            "price_pln": display.get("price_pln", 0),
            "price_label": display.get("price_label", f"{display.get('price_pln', 0)} zł"),
            "blurb": display.get("blurb", ""),
            "highlights": display.get("highlights", []),
            "cta": display.get("cta"),
            "badge": display.get("badge"),
            "period_note": display.get("period_note"),
            "max_projects": row.max_projects,
            "max_exports_per_month": row.max_exports_per_month,
            "max_cv_imports_per_month": row.max_cv_imports_per_month,
            "monthly_ai_credits": row.max_ai_actions_per_month,
            "ai_assistant": bool(row.ai_assistant),
            "extract_cv": bool(row.extract_cv),
            "template_tier": row.template_tier,
            "stripe_price_id_monthly": row.stripe_price_id_monthly,
        })
    return ordered


def set_user_plan(db: Session, user_id: int, plan_slug: str) -> UserSubscription:
    """Activate `plan_slug` for a user (pre-Stripe, no payment). Idempotent.

    Pro starts a fresh 30-day pass and resets the AI credit meter so the new
    window always begins with the full 200-credit allowance.
    """
    plan_slug = normalize_plan_slug(plan_slug)
    if plan_slug not in SELECTABLE_PLANS:
        raise ValueError(f"Nieznany plan: {plan_slug}")
    sub = get_or_create_subscription(db, user_id)
    now = _utcnow()
    sub.plan_slug = plan_slug
    sub.status = "active"
    sub.current_period_start = now
    if plan_slug == "pro":
        sub.current_period_end = now + timedelta(days=PRO_PASS_DAYS)
    else:
        sub.current_period_end = None
    sub.updated_at = now
    db.add(sub)
    db.commit()
    db.refresh(sub)
    if plan_slug == "pro":
        reset_ai_credits(db, user_id)
    return sub


def _expire_pro_if_needed(db: Session, sub: UserSubscription) -> UserSubscription:
    """Downgrade an expired Pro pass to Free. Documents stay; clean export/AI stop."""
    if sub.plan_slug != "pro":
        return sub
    end = _as_utc(sub.current_period_end)
    if end is None or end > _utcnow():
        return sub
    sub.plan_slug = "free"
    sub.status = "active"
    sub.updated_at = _utcnow()
    # Keep period_end as the historical expiry timestamp for support/debug.
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def get_plan(db: Session, plan_slug: str) -> Plan:
    plan_slug = normalize_plan_slug(plan_slug)
    plan = db.query(Plan).filter(Plan.slug == plan_slug, Plan.is_active.is_(True)).first()
    if plan is None:
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
            cv_imports_count=0,
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
    sub = _expire_pro_if_needed(db, sub)
    plan = get_plan(db, sub.plan_slug)
    usage = _usage_row(db, user.id)
    project_count = db.query(Pdf).filter(Pdf.owner_id == user.id).count()

    max_projects = plan.max_projects
    max_exports = plan.max_exports_per_month
    max_ai = plan.max_ai_actions_per_month
    max_cv_imports = plan.max_cv_imports_per_month

    def remaining(used: int, limit: int | None) -> int | None:
        if limit is None:
            return None
        return max(0, limit - used)

    starter_ids = list(FREE_STARTER_TEMPLATE_IDS)
    template_ids = starter_ids if plan.template_tier == "starter" else None
    period_end = _as_utc(sub.current_period_end)

    return {
        "plan_slug": plan.slug,
        "plan_name": plan.name,
        "status": sub.status,
        "ai_assistant": bool(plan.ai_assistant),
        "extract_cv": bool(plan.extract_cv),
        "free_import_used": bool(sub.free_import_used),
        "template_tier": plan.template_tier,
        "allowed_template_ids": template_ids,
        "current_period_start": (
            _as_utc(sub.current_period_start).isoformat() if sub.current_period_start else None
        ),
        "current_period_end": period_end.isoformat() if period_end else None,
        "limits": {
            "max_projects": max_projects,
            "max_exports_per_month": max_exports,
            "max_cv_imports_per_month": max_cv_imports,
            "monthly_ai_credits": max_ai,
        },
        "usage": {
            "period_key": usage.period_key,
            "projects": project_count,
            "exports_count": usage.exports_count,
            "cv_imports_count": usage.cv_imports_count,
            "ai_credits_used": usage.ai_actions_count,
        },
        "remaining": {
            "projects": remaining(project_count, max_projects),
            "exports": remaining(usage.exports_count, max_exports),
            "cv_imports": remaining(usage.cv_imports_count, max_cv_imports),
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
            "Odblokuj Pro, aby dodać kolejny.",
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
            f"{entitlements['plan_name']}. Odblokuj Pro, aby pobrać więcej PDF.",
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
            "Wykorzystano miesięczny limit kredytów AI. Odblokuj lub odnów Pro, "
            "aby kontynuować.",
            upgrade_required="pro",
        )


def assert_can_use_ai_assistant(db: Session, user: User) -> None:
    """Require ai_assistant feature flag plus remaining AI credits."""
    entitlements = get_entitlements(db, user)
    if not entitlements["ai_assistant"]:
        raise PlanLimitError(
            "plan_feature_ai_assistant",
            "Asystent AI jest dostępny w planie Pro.",
        )
    assert_has_ai_credits(db, user)


def assert_can_use_ai_action(db: Session, user: User, action: str) -> None:
    """Require the plan entitlement for one requested AI-assistant action.

    Pro includes content AI (ratings, role fit, grammar, style, ATS, chat) and
    the full-canvas Layout session. Free has no conversational AI assistant;
    its separately metered CV imports are handled by `assert_can_extract_cv`.

    @param db - Active database session used to resolve the subscription.
    @param user - Authenticated user requesting the action.
    @param action - Valid assistant action name, already checked by the route.
    @raises PlanLimitError - When the selected plan cannot use the action or
        has no remaining AI credits.
    """
    entitlements = get_entitlements(db, user)
    if action in PRO_ONLY_AI_ACTIONS and entitlements["plan_slug"] != "pro":
        raise PlanLimitError(
            "plan_feature_ai_appearance",
            "Sprawdź wygląd jest dostępny w planie Pro.",
            upgrade_required="pro",
        )
    assert_can_use_ai_assistant(db, user)


def assert_can_extract_cv(db: Session, user: User) -> None:
    """Require the feature flag and remaining monthly CV-import allowance."""
    entitlements = get_entitlements(db, user)
    if not entitlements["extract_cv"]:
        raise PlanLimitError(
            "plan_feature_extract_cv",
            "Ekstrakcja CV z PDF jest dostępna w planie Pro.",
        )
    limit = entitlements["limits"]["max_cv_imports_per_month"]
    if limit is not None and entitlements["usage"]["cv_imports_count"] >= limit:
        raise PlanLimitError(
            "plan_limit_cv_imports",
            f"Wykorzystano limit {limit} importów CV w tym miesiącu. "
            "Odblokuj Pro, aby importować bez limitu.",
        )


def mark_free_import_used(db: Session, user_id: int) -> None:
    """Set the retired one-time trial marker for backward compatibility.

    New code must call `record_cv_import`; this function exists only for old
    migrations, clients, and deployments during a rolling release.
    """
    db.query(UserSubscription).filter(
        UserSubscription.user_id == user_id,
        UserSubscription.plan_slug == "free",
        UserSubscription.free_import_used.is_(False),
    ).update({UserSubscription.free_import_used: True}, synchronize_session=False)
    db.commit()


def assert_template_allowed(db: Session, user: User, template_id: str) -> None:
    """Block Free-tier users from non-starter templates."""
    entitlements = get_entitlements(db, user)
    allowed = entitlements["allowed_template_ids"]
    if allowed is None:
        return
    if template_id not in allowed:
        raise PlanLimitError(
            "plan_feature_template",
            "Ten szablon jest dostępny w planie Pro.",
        )


def record_export(db: Session, user_id: int) -> UsageCounter:
    """Increment this month's export counter after a successful download gate."""
    row = _usage_row(db, user_id)
    row.exports_count = int(row.exports_count or 0) + 1
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def record_cv_import(db: Session, user_id: int) -> UsageCounter:
    """Atomically increment the UTC month's import meter after model success.

    Failed provider calls never reach this function, so transient Cloudflare
    errors do not consume a user's allowance. The route performs the quota gate
    before the provider call and records only a normalized successful result.
    The conditional SQL update repeats the limit check so concurrent imports
    cannot push a Free account past its allowance after both provider calls end.
    """
    row = _usage_row(db, user_id)
    subscription = _expire_pro_if_needed(db, get_or_create_subscription(db, user_id))
    plan = get_plan(db, subscription.plan_slug)
    limit = plan.max_cv_imports_per_month
    query = db.query(UsageCounter).filter(UsageCounter.id == row.id)
    if limit is not None:
        query = query.filter(UsageCounter.cv_imports_count < limit)
    updated = query.update(
        {UsageCounter.cv_imports_count: UsageCounter.cv_imports_count + 1},
        synchronize_session=False,
    )
    db.commit()
    if updated != 1:
        raise PlanLimitError(
            "plan_limit_cv_imports",
            f"Wykorzystano limit {limit} importów CV w tym miesiącu. "
            "Odblokuj Pro, aby importować bez limitu.",
        )
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
