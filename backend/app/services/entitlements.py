"""Plan entitlements, usage meters, and Free/Pro enforcement.

Product catalog is two tiers:
- Free (Darmowy) — one complete CV, three starter templates, clean PDF exports,
  and one monthly CV import without user-facing AI features.
- Pro — multiple CV versions, all templates, and AI, activated as a 30-day pass (not an
  auto-renewing subscription). Fair-use AI budget is 200 credits / period.

Stripe checkout/webhooks come later — they will flip `UserSubscription.plan_slug`
and fill `Payment` / stripe_* columns. All gates already read subscription state.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.models import (
    AiCreditReservation,
    Pdf,
    Plan,
    UsageCounter,
    User,
    UserSubscription,
)

logger = logging.getLogger(__name__)

# Must match frontend TEMPLATES entries with tier: "free" in
# frontend/src/templates/index.js. Enforced by tests/test_template_registry_sync.py.
FREE_STARTER_TEMPLATE_IDS: tuple[str, ...] = (
    "sterling",
    "linden",
    "meridian",
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
        "max_cv_imports_per_month": 1,
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
        "blurb": "Stwórz kompletne CV gotowe do wysłania.",
        "highlights": [
            "Pełny edytor, czcionki i odstępy",
            "3 szablony · po 6 wariantów wyglądu",
            "1 import CV / mies.",
            "1 zapisane CV · 3 eksporty PDF / mies.",
            "PDF bez znaku wodnego",
        ],
        "cta": "Stwórz CV za darmo",
        "badge": None,
        "period_note": "Bez karty. Bez zobowiązań.",
    },
    "pro": {
        "price_pln": 59,
        "price_label": "59 zł / 30 dni",
        "blurb": "Wiele wersji CV i narzędzia do skutecznej rekrutacji.",
        "highlights": [
            "Wszystkie szablony i warianty wyglądu",
            "Wiele zapisanych CV · eksporty bez limitu",
            "Importy CV bez limitu",
            "AI do treści, ATS i układu",
            "200 kredytów AI / okres",
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
    """Downgrade expired Pro to Free; keep documents and resume Free quotas."""
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
    """Return the monthly usage row, creating it without a first-write race.

    Both production Postgres and local/test SQLite enforce a unique
    ``(user_id, period_key)`` key. A dialect-native ``ON CONFLICT DO NOTHING``
    lets concurrent first requests converge on that single row instead of one
    request failing with an integrity error after both observed no row.
    """
    key = period_key or current_period_key()
    row = (
        db.query(UsageCounter)
        .filter(UsageCounter.user_id == user_id, UsageCounter.period_key == key)
        .first()
    )
    if row is None:
        values = {
            "user_id": user_id,
            "period_key": key,
            "exports_count": 0,
            "cv_imports_count": 0,
            "ai_actions_count": 0,
            "ai_credits_reserved": 0,
        }
        dialect_name = db.get_bind().dialect.name
        if dialect_name == "postgresql":
            statement = postgresql_insert(UsageCounter).values(**values)
            statement = statement.on_conflict_do_nothing(
                index_elements=["user_id", "period_key"],
            )
            db.execute(statement)
        elif dialect_name == "sqlite":
            # End the preceding lookup transaction before becoming a writer.
            # Otherwise simultaneous first requests can hold read locks while
            # each tries to upgrade, producing SQLITE_BUSY instead of letting
            # the unique-key UPSERT serialize them.
            db.commit()
            statement = sqlite_insert(UsageCounter).values(**values)
            statement = statement.on_conflict_do_nothing(
                index_elements=["user_id", "period_key"],
            )
            db.execute(statement)
        else:
            # The application officially supports Postgres and SQLite. Keep a
            # straightforward fallback for development against another SQL
            # dialect; callers still benefit from the database unique key.
            db.add(UsageCounter(**values))
        db.commit()
        row = (
            db.query(UsageCounter)
            .filter(UsageCounter.user_id == user_id, UsageCounter.period_key == key)
            .one()
        )
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
            "ai_credits_reserved": usage.ai_credits_reserved,
        },
        "remaining": {
            "projects": remaining(project_count, max_projects),
            "exports": remaining(usage.exports_count, max_exports),
            "cv_imports": remaining(usage.cv_imports_count, max_cv_imports),
            "ai_credits": remaining(
                int(usage.ai_actions_count or 0) + int(usage.ai_credits_reserved or 0),
                max_ai,
            ),
        },
        "stripe_customer_id": sub.stripe_customer_id,
        "stripe_subscription_id": sub.stripe_subscription_id,
    }


def assert_can_create_project(db: Session, user: User) -> None:
    """Lock the user's project scope and reject creation above the plan limit.

    A plain count followed by an insert lets two simultaneous requests both see
    an available slot. Postgres serializes creators with a row lock on the
    owning user. SQLite has no row-level ``FOR UPDATE``, so ``BEGIN IMMEDIATE``
    takes its database write reservation before the count. The successful
    caller deliberately keeps this transaction open; ``create_new_pdf`` commits
    the inserted Pdf row and releases the lock as one critical section.
    """
    user_id = int(user.id)
    subscription = _expire_pro_if_needed(
        db, get_or_create_subscription(db, user_id),
    )
    plan = get_plan(db, subscription.plan_slug)
    limit = plan.max_projects
    plan_name = plan.name
    if limit is None:
        return

    dialect_name = db.get_bind().dialect.name
    if dialect_name == "sqlite":
        # Authentication/plan lookups may already have opened a read
        # transaction. End it before BEGIN IMMEDIATE so SQLite can reserve the
        # writer slot without attempting an unsafe read-to-write upgrade.
        db.commit()
        db.execute(text("BEGIN IMMEDIATE"))
    else:
        # Production Postgres: a stable per-user row is the lock target. The
        # lock remains held until the document insert commits or the request is
        # rolled back by the session dependency.
        db.query(User.id).filter(User.id == user_id).with_for_update().one()

    project_count = db.query(Pdf).filter(Pdf.owner_id == user_id).count()
    if project_count >= limit:
        # Release the lock before returning a plan error. The exception itself
        # does not invalidate a SQLAlchemy transaction.
        db.rollback()
        raise PlanLimitError(
            "plan_limit_projects",
            f"Plan {plan_name} pozwala na maksymalnie {limit} projekt(y). "
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


def assert_template_allowed(
    db: Session,
    user: User,
    template_id: str,
    *,
    existing_pdf: Pdf | None = None,
) -> None:
    """Block paid templates unless this is an owned legacy document.

    ``existing_pdf`` is an intentionally narrow downgrade exception: a Free
    user may continue editing/rendering an already saved paid-template document
    only when that exact owned row still records the same template. It must
    never be supplied by new-document creation or anonymous template fill.
    """
    entitlements = get_entitlements(db, user)
    allowed = entitlements["allowed_template_ids"]
    if allowed is None:
        return
    if template_id not in allowed:
        if (
            existing_pdf is not None
            and existing_pdf.owner_id == user.id
            and existing_pdf.template_id == template_id
        ):
            return
        raise PlanLimitError(
            "plan_feature_template",
            "Ten szablon jest dostępny w planie Pro.",
        )


def record_export(db: Session, user_id: int) -> UsageCounter:
    """Atomically claim one provisional export slot before costly local work.

    The route may perform an early read-only gate to avoid an unnecessary
    render, but this conditional UPSERT is the authoritative quota decision.
    Concurrent requests cannot increment a finite plan beyond its limit. A
    caller must not start ReportLab, storage migration, or private-object reads
    unless this function returns. If local work then fails before bytes are
    returned, the caller must invoke :func:`refund_export` with the returned
    row's ``period_key``. The committed provisional increment is intentional:
    it makes the cross-worker admission decision visible immediately.
    """
    subscription = _expire_pro_if_needed(
        db, get_or_create_subscription(db, user_id),
    )
    plan = get_plan(db, subscription.plan_slug)
    limit = plan.max_exports_per_month
    plan_name = plan.name
    if limit is not None and limit <= 0:
        raise PlanLimitError(
            "plan_limit_exports",
            f"Wykorzystano limit {limit} eksportów w tym miesiącu na planie "
            f"{plan_name}. Odblokuj Pro, aby pobrać więcej PDF.",
        )

    key = current_period_key()
    values = {
        "user_id": user_id,
        "period_key": key,
        "exports_count": 1,
        "cv_imports_count": 0,
        "ai_actions_count": 0,
        "ai_credits_reserved": 0,
    }
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "postgresql":
        statement = postgresql_insert(UsageCounter).values(**values)
    elif dialect_name == "sqlite":
        # The subscription/plan reads above opened a deferred transaction.
        # Finish it before the atomic writer statement so concurrent SQLite
        # callers queue as writers instead of deadlocking on lock upgrades.
        db.commit()
        statement = sqlite_insert(UsageCounter).values(**values)
    else:
        # Unsupported development dialects use the same user-scope lock as the
        # project quota before falling back to a conditional ORM update.
        db.query(User.id).filter(User.id == user_id).with_for_update().one()
        row = _usage_row(db, user_id, key)
        if limit is not None and row.exports_count >= limit:
            db.rollback()
            raise PlanLimitError(
                "plan_limit_exports",
                f"Wykorzystano limit {limit} eksportów w tym miesiącu na planie "
                f"{plan_name}. Odblokuj Pro, aby pobrać więcej PDF.",
            )
        row.exports_count += 1
        db.commit()
        db.refresh(row)
        return row

    update_where = None if limit is None else UsageCounter.exports_count < limit
    statement = statement.on_conflict_do_update(
        index_elements=["user_id", "period_key"],
        set_={"exports_count": UsageCounter.exports_count + 1},
        where=update_where,
    ).returning(UsageCounter.id)
    claimed_id = db.execute(statement).scalar_one_or_none()
    if claimed_id is None:
        db.rollback()
        raise PlanLimitError(
            "plan_limit_exports",
            f"Wykorzystano limit {limit} eksportów w tym miesiącu na planie "
            f"{plan_name}. Odblokuj Pro, aby pobrać więcej PDF.",
        )
    db.commit()
    return db.query(UsageCounter).filter(UsageCounter.id == claimed_id).one()


def refund_export(db: Session, user_id: int, *, period_key: str) -> None:
    """Atomically release one provisional export claim after a local failure.

    ``period_key`` comes from the successful :func:`record_export` result, not
    from the current clock. This matters when a render spans a UTC month
    boundary: the refund must adjust the same counter that admitted the work.
    Callers must compensate each successful claim at most once; the
    ``exports_count > 0`` predicate is a final guard against a negative meter.
    A missing/already-empty row is a no-op.
    """

    # Image authorization or storage reads may have opened a read transaction.
    # End it before SQLite's write so concurrent refunds queue safely instead
    # of attempting an unsupported deferred read-to-write upgrade.
    if db.get_bind().dialect.name == "sqlite":
        db.commit()
    try:
        db.query(UsageCounter).filter(
            UsageCounter.user_id == int(user_id),
            UsageCounter.period_key == str(period_key),
            UsageCounter.exports_count > 0,
        ).update(
            {UsageCounter.exports_count: UsageCounter.exports_count - 1},
            synchronize_session=False,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise


def record_cv_import(
    db: Session,
    user_id: int,
    *,
    commit: bool = True,
) -> UsageCounter:
    """Atomically increment the UTC month's import meter after model success.

    Failed provider calls never reach this function, so transient Cloudflare
    errors do not consume a user's allowance. The route performs the quota gate
    before the provider call and records only a normalized successful result.
    The conditional SQL update repeats the limit check so concurrent imports
    cannot push a Free account past its allowance after both provider calls end.

    Set ``commit=False`` only when the caller must include another database
    mutation in the same success transaction. The CV extraction route uses it
    to make the quota claim and snapshot transition indivisible.
    """
    row = _usage_row(db, user_id)
    subscription = _expire_pro_if_needed(db, get_or_create_subscription(db, user_id))
    plan = get_plan(db, subscription.plan_slug)
    limit = plan.max_cv_imports_per_month
    row_id = row.id
    if db.get_bind().dialect.name == "sqlite":
        # End read transactions opened by the usage/plan lookups before the
        # conditional writer statement. This lets concurrent SQLite imports
        # queue for the write lock instead of deadlocking during lock upgrade.
        # No usage has been claimed yet, and the processing snapshot was
        # committed before the external provider call.
        db.commit()
    query = db.query(UsageCounter).filter(UsageCounter.id == row_id)
    if limit is not None:
        query = query.filter(UsageCounter.cv_imports_count < limit)
    updated = query.update(
        {UsageCounter.cv_imports_count: UsageCounter.cv_imports_count + 1},
        synchronize_session=False,
    )
    if updated != 1:
        db.rollback()
        raise PlanLimitError(
            "plan_limit_cv_imports",
            f"Wykorzystano limit {limit} importów CV w tym miesiącu. "
            "Odblokuj Pro, aby importować bez limitu.",
        )
    if not commit:
        return row
    db.commit()
    return db.query(UsageCounter).filter(UsageCounter.id == row_id).one()


def reset_ai_credits(db: Session, user_id: int) -> UsageCounter:
    """Set this month's AI credit usage to zero (full plan allowance again)."""
    row = _usage_row(db, user_id)
    row.ai_actions_count = 0
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


AI_RESERVATION_TTL = timedelta(minutes=10)


class AiReservationError(HTTPException):
    """Stable conflict/rate-limit response for an idempotent AI operation."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        retry_after: int | None = None,
    ) -> None:
        headers = {"Retry-After": str(max(1, retry_after))} if retry_after else None
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message},
            headers=headers,
        )


@dataclass(frozen=True)
class AiReservationClaim:
    """Reservation outcome; replay_response is populated for a settled retry."""

    reservation_id: str
    reserved_credits: int
    replay_response: dict[str, Any] | None = None


def _begin_ai_credit_transaction(db: Session) -> str:
    """Start a writer transaction suitable for the supported SQL dialect."""
    # Entitlement lookups may have opened a read transaction. A clean boundary
    # is required before SQLite can acquire its writer reservation and before
    # Postgres takes the usage-row lock.
    db.commit()
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    return dialect_name


def _locked_ai_usage_row(
    db: Session,
    *,
    user_id: int,
    period_key: str,
    dialect_name: str,
) -> UsageCounter:
    """Create and lock the monthly meter without committing the transaction."""
    values = {
        "user_id": user_id,
        "period_key": period_key,
        "exports_count": 0,
        "cv_imports_count": 0,
        "ai_actions_count": 0,
        "ai_credits_reserved": 0,
    }
    if dialect_name == "postgresql":
        statement = postgresql_insert(UsageCounter).values(**values)
        db.execute(statement.on_conflict_do_nothing(
            index_elements=["user_id", "period_key"],
        ))
    elif dialect_name == "sqlite":
        statement = sqlite_insert(UsageCounter).values(**values)
        db.execute(statement.on_conflict_do_nothing(
            index_elements=["user_id", "period_key"],
        ))
    else:
        existing = db.query(UsageCounter.id).filter(
            UsageCounter.user_id == user_id,
            UsageCounter.period_key == period_key,
        ).first()
        if existing is None:
            db.add(UsageCounter(**values))
            db.flush()

    query = db.query(UsageCounter).filter(
        UsageCounter.user_id == user_id,
        UsageCounter.period_key == period_key,
    )
    if dialect_name == "postgresql":
        query = query.with_for_update()
    return query.one()


def _reconcile_pending_ai_reservations(
    db: Session,
    *,
    usage: UsageCounter,
    user_id: int,
    now: datetime,
    dialect_name: str,
) -> None:
    """Expire stale claims and release legacy assistant-wide active slots.

    Assistant requests are independently bounded by their atomically reserved
    credits, so a pending request must not block a distinct assistant action.
    ``active_slot=1`` is retained only for CV imports, whose monthly allowance
    is not represented by ``ai_credits_reserved``. Existing pending assistant
    rows created before this rule are converted in place without discarding
    their reservation or changing their conservative expiry settlement.
    """
    query = db.query(AiCreditReservation).filter(
        AiCreditReservation.user_id == user_id,
        AiCreditReservation.status == "pending",
    ).order_by(
        AiCreditReservation.period_key,
        AiCreditReservation.created_at,
        AiCreditReservation.id,
    )
    pending_rows = query.all()
    usage_by_period = {usage.period_key: usage}

    for pending in pending_rows:
        # Older deployments used this unique slot for both assistants and CV
        # imports. Clear it immediately for assistant rows so a stale request
        # cannot produce a false "another operation" error after deployment.
        if pending.action != "extract_cv" and pending.active_slot is not None:
            pending.active_slot = None
            db.add(pending)

        if (_as_utc(pending.expires_at) or now) > now:
            continue

        # The lease can cross a UTC month boundary. Release and charge against
        # the period captured by the original reservation, never the new
        # request's current-period row, or the old balance remains stranded.
        target_usage = usage_by_period.get(pending.period_key)
        if target_usage is None:
            target_usage = _locked_ai_usage_row(
                db,
                user_id=user_id,
                period_key=pending.period_key,
                dialect_name=dialect_name,
            )
            usage_by_period[pending.period_key] = target_usage
        reserved = max(0, int(pending.reserved_credits or 0))
        target_usage.ai_credits_reserved = max(
            0,
            int(target_usage.ai_credits_reserved or 0) - reserved,
        )
        if pending.action == "extract_cv":
            # The provider may have completed after the worker lost its
            # response. Consume the original period's import slot so a retry
            # cannot multiply extraction cost after an ambiguous crash.
            target_usage.cv_imports_count = int(target_usage.cv_imports_count or 0) + 1
        else:
            target_usage.ai_actions_count = (
                int(target_usage.ai_actions_count or 0) + reserved
            )
        pending.charged_credits = reserved
        pending.status = "expired"
        pending.active_slot = None
        pending.settled_at = now
        db.add_all([target_usage, pending])

    # Apply legacy slot releases before a CV-import reservation attempts to
    # claim the same unique `(user_id, active_slot)` value in this transaction.
    db.flush()


def reserve_ai_credits(
    db: Session,
    *,
    user_id: int,
    action: str,
    idempotency_key: str,
    request_hash: str,
    reserved_credits: int,
    now: datetime | None = None,
) -> AiReservationClaim:
    """Atomically reserve the bounded maximum cost of one AI provider call.

    The operation serializes on the monthly usage row (or SQLite writer lock),
    reserves quota for every distinct request and records idempotency before
    external I/O starts. A settled duplicate returns its stored response;
    every other same-key duplicate is rejected without contacting the provider.
    """
    moment = now or _utcnow()
    key = (idempotency_key or "").strip()
    if not key or len(key) > 128:
        raise AiReservationError(
            400,
            "invalid_idempotency_key",
            "Nagłówek Idempotency-Key jest nieprawidłowy.",
        )
    maximum = max(1, int(reserved_credits))
    subscription = _expire_pro_if_needed(db, get_or_create_subscription(db, user_id))
    plan = get_plan(db, subscription.plan_slug)
    limit = plan.max_ai_actions_per_month
    period_key = current_period_key(moment)
    dialect_name = _begin_ai_credit_transaction(db)
    try:
        usage = _locked_ai_usage_row(
            db,
            user_id=user_id,
            period_key=period_key,
            dialect_name=dialect_name,
        )
        _reconcile_pending_ai_reservations(
            db,
            usage=usage,
            user_id=user_id,
            now=moment,
            dialect_name=dialect_name,
        )

        existing = db.query(AiCreditReservation).filter(
            AiCreditReservation.user_id == user_id,
            AiCreditReservation.idempotency_key == key,
        ).first()
        if existing is not None:
            if existing.request_hash != request_hash:
                raise AiReservationError(
                    409,
                    "idempotency_payload_mismatch",
                    "Ten Idempotency-Key został już użyty z innym żądaniem.",
                )
            if existing.status == "settled" and existing.response_json is not None:
                db.commit()
                return AiReservationClaim(
                    reservation_id=existing.id,
                    reserved_credits=existing.reserved_credits,
                    replay_response=existing.response_json,
                )
            retry_after = max(
                1,
                int(((_as_utc(existing.expires_at) or moment) - moment).total_seconds()),
            )
            raise AiReservationError(
                409,
                "ai_request_in_progress" if existing.status == "pending" else "ai_request_finalized",
                "To żądanie AI zostało już rozpoczęte lub zakończone.",
                retry_after=retry_after if existing.status == "pending" else None,
            )

        consumed = int(usage.ai_actions_count or 0) + int(usage.ai_credits_reserved or 0)
        if limit is not None and consumed + maximum > limit:
            raise PlanLimitError(
                "plan_limit_ai_credits",
                "Brakuje kredytów na bezpieczne rozpoczęcie tej operacji AI.",
                upgrade_required="pro",
            )

        reservation = AiCreditReservation(
            id=str(uuid4()),
            user_id=user_id,
            period_key=period_key,
            action=action,
            idempotency_key=key,
            request_hash=request_hash,
            reserved_credits=maximum,
            charged_credits=0,
            status="pending",
            # Assistant concurrency is bounded by the atomically reserved
            # credit balance. The unique active slot is only for CV imports.
            active_slot=None,
            response_json=None,
            created_at=moment,
            expires_at=moment + AI_RESERVATION_TTL,
            settled_at=None,
        )
        usage.ai_credits_reserved = int(usage.ai_credits_reserved or 0) + maximum
        db.add_all([usage, reservation])
        db.commit()
        return AiReservationClaim(reservation.id, maximum)
    except (AiReservationError, PlanLimitError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.exception(
            "Unexpected AI reservation integrity conflict: user=%s action=%s",
            user_id,
            action,
        )
        raise AiReservationError(
            409,
            "ai_reservation_conflict",
            "Nie udało się zapisać operacji AI. Spróbuj ponownie.",
            retry_after=1,
        ) from exc


def reserve_cv_import(
    db: Session,
    *,
    user_id: int,
    idempotency_key: str,
    request_hash: str,
    now: datetime | None = None,
) -> AiReservationClaim:
    """Claim the user's single provider slot before CV extraction starts.

    CV imports have their own monthly counter and must not consume assistant
    credits. They nevertheless share the durable reservation ledger and active
    slot so concurrent import/assistant calls cannot multiply provider cost.
    A successful retry replays only a snapshot reference plus provider usage;
    private CV data remains in the owner-scoped snapshot table.
    """
    moment = now or _utcnow()
    key = (idempotency_key or "").strip()
    if not key or len(key) > 128:
        raise AiReservationError(
            400,
            "invalid_idempotency_key",
            "Nagłówek Idempotency-Key jest nieprawidłowy.",
        )
    subscription = _expire_pro_if_needed(db, get_or_create_subscription(db, user_id))
    plan = get_plan(db, subscription.plan_slug)
    if not plan.extract_cv:
        raise PlanLimitError(
            "plan_feature_extract_cv",
            "Ekstrakcja CV z PDF jest dostępna w planie Pro.",
        )
    limit = plan.max_cv_imports_per_month
    period_key = current_period_key(moment)
    dialect_name = _begin_ai_credit_transaction(db)
    try:
        usage = _locked_ai_usage_row(
            db,
            user_id=user_id,
            period_key=period_key,
            dialect_name=dialect_name,
        )
        _reconcile_pending_ai_reservations(
            db,
            usage=usage,
            user_id=user_id,
            now=moment,
            dialect_name=dialect_name,
        )

        existing = db.query(AiCreditReservation).filter(
            AiCreditReservation.user_id == user_id,
            AiCreditReservation.idempotency_key == key,
        ).first()
        if existing is not None:
            if existing.request_hash != request_hash:
                raise AiReservationError(
                    409,
                    "idempotency_payload_mismatch",
                    "Ten Idempotency-Key został już użyty z innym żądaniem.",
                )
            if existing.status == "settled" and existing.response_json is not None:
                db.commit()
                return AiReservationClaim(
                    reservation_id=existing.id,
                    reserved_credits=0,
                    replay_response=existing.response_json,
                )
            retry_after = max(
                1,
                int(((_as_utc(existing.expires_at) or moment) - moment).total_seconds()),
            )
            raise AiReservationError(
                409,
                "ai_request_in_progress" if existing.status == "pending" else "ai_request_finalized",
                "To żądanie importu zostało już rozpoczęte lub zakończone.",
                retry_after=retry_after if existing.status == "pending" else None,
            )

        active = db.query(AiCreditReservation).filter(
            AiCreditReservation.user_id == user_id,
            AiCreditReservation.action == "extract_cv",
            AiCreditReservation.status == "pending",
            AiCreditReservation.active_slot == 1,
        ).first()
        if active is not None:
            retry_after = max(
                1,
                int(((_as_utc(active.expires_at) or moment) - moment).total_seconds()),
            )
            raise AiReservationError(
                429,
                "ai_operation_active",
                "Inny import CV dla tego konta nadal trwa.",
                retry_after=retry_after,
            )
        if limit is not None and int(usage.cv_imports_count or 0) >= limit:
            raise PlanLimitError(
                "plan_limit_cv_imports",
                f"Wykorzystano limit {limit} importów CV w tym miesiącu. "
                "Odblokuj Pro, aby importować bez limitu.",
            )

        reservation = AiCreditReservation(
            id=str(uuid4()),
            user_id=user_id,
            period_key=period_key,
            action="extract_cv",
            idempotency_key=key,
            request_hash=request_hash,
            reserved_credits=0,
            charged_credits=0,
            status="pending",
            active_slot=1,
            response_json=None,
            created_at=moment,
            expires_at=moment + AI_RESERVATION_TTL,
            settled_at=None,
        )
        db.add(reservation)
        db.commit()
        return AiReservationClaim(reservation.id, 0)
    except (AiReservationError, PlanLimitError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise AiReservationError(
            429,
            "ai_operation_active",
            "Inny import CV dla tego konta nadal trwa.",
            retry_after=int(AI_RESERVATION_TTL.total_seconds()),
        ) from exc


def stage_cv_import_reservation_success(
    db: Session,
    *,
    user_id: int,
    reservation_id: str,
    snapshot_id: int,
    usage_payload: dict[str, Any],
) -> None:
    """Stage import idempotency replay in the caller's success transaction.

    The route has already conditionally incremented the monthly import counter
    and staged the snapshot. Keeping this state transition in the same commit
    prevents a replay record from pointing at an unfinished snapshot.
    """
    query = db.query(AiCreditReservation).filter(
        AiCreditReservation.id == reservation_id,
        AiCreditReservation.user_id == user_id,
    )
    if db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update()
    reservation = query.one()
    if reservation.status != "pending":
        raise RuntimeError("CV import reservation is no longer pending.")
    reservation.status = "settled"
    reservation.active_slot = None
    reservation.response_json = {
        "snapshot_id": int(snapshot_id),
        "usage": dict(usage_payload or {}),
    }
    reservation.settled_at = _utcnow()
    db.add(reservation)


def settle_failed_cv_import_reservation(
    db: Session,
    *,
    user_id: int,
    reservation_id: str,
) -> None:
    """Consume one import slot after a paid provider response is unusable.

    Invalid or empty HTTP-200 model output is not safe to persist or replay,
    but it has already consumed provider capacity. Recording a terminal failed
    reservation prevents new idempotency keys from turning that paid boundary
    into an unlimited retry oracle. Transport ambiguity stays pending instead
    and is handled conservatively by lease expiry.
    """

    dialect_name = _begin_ai_credit_transaction(db)
    try:
        reservation_query = db.query(AiCreditReservation).filter(
            AiCreditReservation.id == reservation_id,
            AiCreditReservation.user_id == user_id,
        )
        if dialect_name == "postgresql":
            reservation_query = reservation_query.with_for_update()
        reservation = reservation_query.one()
        if reservation.status != "pending":
            db.commit()
            return
        if reservation.action != "extract_cv":
            raise RuntimeError("Reservation is not a CV import.")
        usage = _locked_ai_usage_row(
            db,
            user_id=user_id,
            period_key=reservation.period_key,
            dialect_name=dialect_name,
        )
        usage.cv_imports_count = int(usage.cv_imports_count or 0) + 1
        reservation.status = "failed"
        reservation.active_slot = None
        reservation.response_json = None
        reservation.settled_at = _utcnow()
        db.add_all([usage, reservation])
        db.commit()
    except Exception:
        db.rollback()
        raise


def settle_ai_reservation(
    db: Session,
    *,
    user_id: int,
    reservation_id: str,
    cost_pln: float,
    response_payload: dict[str, Any],
) -> dict[str, Any]:
    """Convert a pending reservation to actual usage and store replay data."""
    dialect_name = _begin_ai_credit_transaction(db)
    try:
        reservation_query = db.query(AiCreditReservation).filter(
            AiCreditReservation.id == reservation_id,
            AiCreditReservation.user_id == user_id,
        )
        if dialect_name == "postgresql":
            reservation_query = reservation_query.with_for_update()
        reservation = reservation_query.one()
        if reservation.status == "settled" and reservation.response_json is not None:
            db.commit()
            return reservation.response_json
        if reservation.status != "pending":
            raise RuntimeError("AI reservation is no longer pending.")

        usage = _locked_ai_usage_row(
            db,
            user_id=user_id,
            period_key=reservation.period_key,
            dialect_name=dialect_name,
        )
        actual = credits_for_cost(cost_pln)
        if actual > reservation.reserved_credits:
            logger.error(
                "AI actual credits exceeded reservation: reservation=%s reserved=%s actual=%s",
                reservation.id,
                reservation.reserved_credits,
                actual,
            )
            actual = reservation.reserved_credits
        usage.ai_credits_reserved = max(
            0,
            int(usage.ai_credits_reserved or 0) - reservation.reserved_credits,
        )
        usage.ai_actions_count = int(usage.ai_actions_count or 0) + actual

        stored_response = dict(response_payload)
        stored_usage = dict(stored_response.get("usage") or {})
        stored_usage["credits_charged"] = actual
        stored_response["usage"] = stored_usage
        reservation.status = "settled"
        reservation.active_slot = None
        reservation.charged_credits = actual
        reservation.response_json = stored_response
        reservation.settled_at = _utcnow()
        db.add_all([usage, reservation])
        db.commit()
        return stored_response
    except Exception:
        db.rollback()
        raise


def settle_failed_ai_reservation(
    db: Session,
    *,
    user_id: int,
    reservation_id: str,
    cost_pln: float,
) -> None:
    """Charge reported usage when the provider response cannot be consumed.

    The provider completed and supplied metering, but malformed or empty
    content cannot be replayed as a successful assistant response. Persist a
    terminal failed state, release the active slot, and charge only the actual
    bounded usage instead of the full reservation ceiling.
    """
    dialect_name = _begin_ai_credit_transaction(db)
    try:
        reservation_query = db.query(AiCreditReservation).filter(
            AiCreditReservation.id == reservation_id,
            AiCreditReservation.user_id == user_id,
        )
        if dialect_name == "postgresql":
            reservation_query = reservation_query.with_for_update()
        reservation = reservation_query.one()
        if reservation.status != "pending":
            db.commit()
            return
        usage = _locked_ai_usage_row(
            db,
            user_id=user_id,
            period_key=reservation.period_key,
            dialect_name=dialect_name,
        )
        actual = credits_for_cost(cost_pln)
        if actual > reservation.reserved_credits:
            logger.error(
                "AI failed-response credits exceeded reservation: reservation=%s reserved=%s actual=%s",
                reservation.id,
                reservation.reserved_credits,
                actual,
            )
            actual = reservation.reserved_credits
        usage.ai_credits_reserved = max(
            0,
            int(usage.ai_credits_reserved or 0) - reservation.reserved_credits,
        )
        usage.ai_actions_count = int(usage.ai_actions_count or 0) + actual
        reservation.status = "failed"
        reservation.active_slot = None
        reservation.charged_credits = actual
        reservation.response_json = None
        reservation.settled_at = _utcnow()
        db.add_all([usage, reservation])
        db.commit()
    except Exception:
        db.rollback()
        raise


def release_ai_reservation(
    db: Session,
    *,
    user_id: int,
    reservation_id: str,
) -> None:
    """Release credits after a confirmed provider failure before a response."""
    dialect_name = _begin_ai_credit_transaction(db)
    try:
        reservation_query = db.query(AiCreditReservation).filter(
            AiCreditReservation.id == reservation_id,
            AiCreditReservation.user_id == user_id,
        )
        if dialect_name == "postgresql":
            reservation_query = reservation_query.with_for_update()
        reservation = reservation_query.one_or_none()
        if reservation is None or reservation.status != "pending":
            db.commit()
            return
        usage = _locked_ai_usage_row(
            db,
            user_id=user_id,
            period_key=reservation.period_key,
            dialect_name=dialect_name,
        )
        usage.ai_credits_reserved = max(
            0,
            int(usage.ai_credits_reserved or 0) - reservation.reserved_credits,
        )
        reservation.status = "released"
        reservation.active_slot = None
        reservation.settled_at = _utcnow()
        db.add_all([usage, reservation])
        db.commit()
    except Exception:
        db.rollback()
        raise


def charge_ai_credits(db: Session, user_id: int, cost_pln: float) -> UsageCounter:
    """Add credit cost for one AI call to this month's usage meter and commit."""
    row = _usage_row(db, user_id)
    row.ai_actions_count = int(row.ai_actions_count or 0) + credits_for_cost(cost_pln)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
