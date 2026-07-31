# Plan-at-signup + Credit-based AI Metering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users register directly onto Free / Standard / Premium without payment, and meter AI usage as credits (1 credit = 5 groszy) charged at each call's real cost.

**Architecture:** The backend billing scaffold already exists (`Plan`, `UserSubscription`, `UsageCounter`, plus per-call PLN cost via `openai_pricing.py`). We reinterpret existing columns as credits (no schema migration), change seed values, rename slug `pro`→`premium` via an idempotent startup migration, add a plan field to registration plus a `/billing/select-plan` endpoint gated by a config flag, and update the Hero + Register + entitlements display copy on the frontend.

**Tech Stack:** FastAPI + SQLAlchemy (backend, Python), `unittest` + in-memory SQLite (tests), React + Vite + react-router-dom (frontend).

## Global Constraints

- **1 credit = 0.05 zł (5 groszy).** Credit cost of a call = `max(1, ceil(cost_pln / 0.05))`.
- **Credit allowances:** Free = 0, Standard = 150, Premium = 300 (per calendar month).
- **No schema migration:** reuse `Plan.max_ai_actions_per_month` as the credit allowance and `UsageCounter.ai_actions_count` as credits consumed. Column names stay; only meaning + seed values + API/UI copy change.
- **Slug rename:** internal `pro` → `premium`, migrated idempotently in `bootstrap_billing`.
- **Displayed prices unchanged:** Standard 29 zł, Premium 49 zł.
- **All user-facing copy is Polish.** AI meter is called "kredyty AI" everywhere in the UI.
- **Stripe seam:** unpaid plan activation is gated behind config flag `ALLOW_UNPAID_PLAN_SELECTION` (default `True` now); this is the single place to lock down when billing lands.
- **Tests run from the `backend/` directory** with `python -m unittest tests.<module> -v` (existing tests use `unittest.TestCase` + in-memory SQLite; no pytest).
- **Entitlements payload key renames** (DB columns unchanged): `limits.max_ai_actions_per_month`→`limits.monthly_ai_credits`, `usage.ai_actions_count`→`usage.ai_credits_used`, `remaining.ai_actions`→`remaining.ai_credits`.

---

## File Structure

**Backend**
- Modify `backend/app/services/entitlements.py` — seeds (150/300, premium), slug migration, `credits_for_cost`, `charge_ai_credits`, renamed payload keys, `set_user_plan`, updated `PlanLimitError` copy.
- Modify `backend/app/schemas/user_schema.py` — `plan` field on `UserCreateRequest`.
- Modify `backend/app/crud/user.py` — assign chosen plan on create.
- Create `backend/app/api/routes/billing.py` — `POST /billing/select-plan`.
- Modify `backend/app/main.py` — register billing router.
- Modify `backend/app/core/config.py` — `ALLOW_UNPAID_PLAN_SELECTION`.
- Modify `backend/app/api/routes/ai.py` and `backend/app/api/routes/ai_assistant.py` — call `charge_ai_credits(...)` with the call's `cost_pln`.
- Tests: `backend/tests/test_ai_credits.py`, `backend/tests/test_plan_selection.py`; extend `backend/tests/test_entitlements.py`.

**Frontend**
- Modify `frontend/src/pages/Hero/Hero.jsx` — pricing copy + plan-aware CTAs.
- Modify `frontend/src/pages/Register/Register.jsx` — plan selector, send `plan`.
- Create `frontend/src/pages/Register/PlanSelector.jsx` (+ `.module.css`) — segmented Free/Standard/Premium control.
- Modify `frontend/src/components/editor/Sidebar/Sidebar.jsx` — show remaining AI credits.

---

## Task 1: Plan seeds → credit values + `pro`→`premium` migration

**Files:**
- Modify: `backend/app/services/entitlements.py` (`PLAN_SEEDS` ~lines 27-64; `bootstrap_billing` ~lines 149-153)
- Test: `backend/tests/test_entitlements.py` (extend existing `unittest` file)

**Interfaces:**
- Consumes: existing `seed_plans(db)`, `Plan`, `UserSubscription` models.
- Produces: seeds with slugs `free`/`standard`/`premium` and credit allowances 0/150/300; `migrate_pro_to_premium(db) -> int` (returns number of subscriptions migrated), called from `bootstrap_billing`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_entitlements.py`:

```python
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

    def test_seed_credit_allowances_and_premium_slug(self):
        ent.seed_plans(self.db)
        from app.models.models import Plan
        slugs = {p.slug: p for p in self.db.query(Plan).all()}
        self.assertEqual(slugs["free"].max_ai_actions_per_month, 0)
        self.assertEqual(slugs["standard"].max_ai_actions_per_month, 150)
        self.assertEqual(slugs["premium"].max_ai_actions_per_month, 300)
        self.assertEqual(slugs["premium"].name, "Premium")
        self.assertNotIn("pro", slugs)

    def test_migrate_pro_subscription_to_premium_is_idempotent(self):
        from app.models.models import UserSubscription
        now = datetime.now(timezone.utc)
        self.db.add(UserSubscription(
            user_id=1, plan_slug="pro", status="active",
            current_period_start=now, updated_at=now,
        ))
        self.db.commit()
        ent.seed_plans(self.db)
        first = ent.migrate_pro_to_premium(self.db)
        second = ent.migrate_pro_to_premium(self.db)
        sub = self.db.query(UserSubscription).filter_by(user_id=1).first()
        self.assertEqual(first, 1)
        self.assertEqual(second, 0)
        self.assertEqual(sub.plan_slug, "premium")
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `python -m unittest tests.test_entitlements -v`
Expected: FAIL — `standard` allowance is 40 not 150, no `premium` slug, `migrate_pro_to_premium` does not exist (AttributeError).

- [ ] **Step 3: Implement seeds + migration**

In `backend/app/services/entitlements.py`, change the `standard` seed `max_ai_actions_per_month` from `40` to `150`, and replace the `pro` seed dict with:

```python
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
```

Add this function (near `seed_plans`):

```python
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
```

Update `bootstrap_billing` to call it after `seed_plans`:

```python
def bootstrap_billing(db: Session) -> None:
    """Called from app startup after create_all."""
    seed_plans(db)
    migrate_pro_to_premium(db)
    backfill_free_subscriptions(db)
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `python -m unittest tests.test_entitlements -v`
Expected: PASS (all classes, including the existing tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/entitlements.py backend/tests/test_entitlements.py
git commit -m "feat(billing): seed AI credit allowances and migrate pro->premium"
```

---

## Task 2: Credit metering + entitlements payload rename

**Files:**
- Modify: `backend/app/services/entitlements.py` (`get_entitlements` ~lines 195-239; `assert_can_use_ai_assistant` ~lines 268-281; `record_ai_action` ~lines 314-320; `PlanLimitError` copy)
- Modify: `backend/app/api/routes/ai.py` (line 14 import, line 77 call)
- Modify: `backend/app/api/routes/ai_assistant.py` (line 11 import, line 93 call)
- Test: `backend/tests/test_ai_credits.py` (new)

**Interfaces:**
- Consumes: `usage["cost_pln_estimate"]` (float) already produced at both AI routes; `_usage_row`, `get_entitlements`, `get_plan`.
- Produces:
  - `credits_for_cost(cost_pln: float) -> int` = `max(1, ceil(cost_pln / 0.05))`.
  - `charge_ai_credits(db: Session, user_id: int, cost_pln: float) -> UsageCounter` (increments `ai_actions_count` by the credit cost).
  - `get_entitlements(...)` returns `limits.monthly_ai_credits`, `usage.ai_credits_used`, `remaining.ai_credits` (other keys unchanged).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ai_credits.py`:

```python
"""Credit conversion, charging, and the block-at-zero gate."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, User, UserSubscription
from app.services import entitlements as ent


def _make_user(db, username="u", plan="standard"):
    now = datetime.now(timezone.utc)
    user = User(username=username, email=f"{username}@e.pl",
                hashed_password="x", created_at=now, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(UserSubscription(user_id=user.id, plan_slug=plan, status="active",
                            current_period_start=now, updated_at=now))
    db.commit()
    return user


class CreditMeteringTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_credits_for_cost_rounds_up_with_minimum_one(self):
        self.assertEqual(ent.credits_for_cost(0.15), 3)
        self.assertEqual(ent.credits_for_cost(0.05), 1)
        self.assertEqual(ent.credits_for_cost(0.11), 3)
        self.assertEqual(ent.credits_for_cost(0.004), 1)  # min 1
        self.assertEqual(ent.credits_for_cost(0.0), 1)     # a successful call always costs >=1

    def test_charge_decrements_remaining_credits(self):
        user = _make_user(self.db)
        ent.charge_ai_credits(self.db, user.id, 0.15)  # 3 credits
        ents = ent.get_entitlements(self.db, user)
        self.assertEqual(ents["usage"]["ai_credits_used"], 3)
        self.assertEqual(ents["limits"]["monthly_ai_credits"], 150)
        self.assertEqual(ents["remaining"]["ai_credits"], 147)

    def test_free_user_is_blocked(self):
        user = _make_user(self.db, username="f", plan="free")
        with self.assertRaises(ent.PlanLimitError):
            ent.assert_can_use_ai_assistant(self.db, user)

    def test_block_when_credits_exhausted(self):
        user = _make_user(self.db)
        ent.charge_ai_credits(self.db, user.id, 150 * 0.05)  # exactly 150 credits
        with self.assertRaises(ent.PlanLimitError):
            ent.assert_can_use_ai_assistant(self.db, user)
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `python -m unittest tests.test_ai_credits -v`
Expected: FAIL — `credits_for_cost` / `charge_ai_credits` don't exist; payload has no `monthly_ai_credits`/`ai_credits_used`/`ai_credits` keys.

- [ ] **Step 3: Implement metering + payload rename**

In `backend/app/services/entitlements.py`:

Add `import math` at the top (with the other stdlib imports), then add:

```python
CREDIT_PLN = 0.05  # 1 AI credit = 5 groszy


def credits_for_cost(cost_pln: float) -> int:
    """Credit cost of one AI call, charged at real cost, minimum 1 per call."""
    try:
        cost = float(cost_pln)
    except (TypeError, ValueError):
        cost = 0.0
    return max(1, math.ceil(cost / CREDIT_PLN))
```

Replace `record_ai_action` with:

```python
def charge_ai_credits(db: Session, user_id: int, cost_pln: float) -> UsageCounter:
    row = _usage_row(db, user_id)
    row.ai_actions_count = int(row.ai_actions_count or 0) + credits_for_cost(cost_pln)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
```

In `get_entitlements`, rename the three output keys (values/logic unchanged):
- under `"limits"`: `"max_ai_actions_per_month": max_ai` → `"monthly_ai_credits": max_ai`
- under `"usage"`: `"ai_actions_count": usage.ai_actions_count` → `"ai_credits_used": usage.ai_actions_count`
- under `"remaining"`: `"ai_actions": remaining(usage.ai_actions_count, max_ai)` → `"ai_credits": remaining(usage.ai_actions_count, max_ai)`

In `assert_can_use_ai_assistant`, update the reads to the new keys:

```python
def assert_can_use_ai_assistant(db: Session, user: User) -> None:
    entitlements = get_entitlements(db, user)
    if not entitlements["ai_assistant"]:
        raise PlanLimitError(
            "plan_feature_ai_assistant",
            "Asystent AI jest dostępny w planie Standard.",
        )
    limit = entitlements["limits"]["monthly_ai_credits"]
    if limit is not None and entitlements["usage"]["ai_credits_used"] >= limit:
        raise PlanLimitError(
            "plan_limit_ai_credits",
            "Wykorzystano miesięczny limit kredytów AI.",
            upgrade_required="premium" if entitlements["plan_slug"] == "standard" else "standard",
        )
```

- [ ] **Step 4: Update the two AI route call sites**

In `backend/app/api/routes/ai.py`: change the import on line 14 from `record_ai_action,` to `charge_ai_credits,`, and change line 77 from `record_ai_action(db, user.id)` to:

```python
        charge_ai_credits(db, user.id, usage.get("cost_pln_estimate", 0.0))
```

In `backend/app/api/routes/ai_assistant.py`: change the import on line 11 from `record_ai_action` to `charge_ai_credits`, and change line 93 from `record_ai_action(db, user.id)` to:

```python
        charge_ai_credits(db, user.id, result.get("usage", {}).get("cost_pln_estimate", 0.0))
```

- [ ] **Step 5: Update the existing exception-handling test's patch target**

`backend/tests/test_ai_assistant_exception_handling.py` patches the old function name by string (line ~57-59). Change it to the new name so the patch still resolves:

```python
        self._record_patch = patch.object(
            ai_assistant_route, "charge_ai_credits", return_value=None
        )
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `backend/`):
```bash
python -m unittest tests.test_ai_credits -v
python -m unittest tests.test_entitlements -v
python -m unittest tests.test_ai_cv_routes tests.test_ai_chat_command tests.test_ai_assistant_exception_handling -v
```
Expected: PASS (route tests confirm the renamed call sites still work).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/entitlements.py backend/app/api/routes/ai.py backend/app/api/routes/ai_assistant.py backend/tests/test_ai_credits.py backend/tests/test_ai_assistant_exception_handling.py
git commit -m "feat(billing): meter AI usage as credits charged at real cost"
```

---

## Task 3: Registration plan field + `/billing/select-plan` endpoint

**Files:**
- Modify: `backend/app/core/config.py` (add flag)
- Modify: `backend/app/schemas/user_schema.py`
- Modify: `backend/app/services/entitlements.py` (add `set_user_plan`)
- Modify: `backend/app/crud/user.py` (`create_user`)
- Create: `backend/app/api/routes/billing.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_plan_selection.py` (new)

**Interfaces:**
- Consumes: `get_or_create_subscription`, `get_plan`, `verify_token`, `get_user_by_username`, `get_db`.
- Produces:
  - `SELECTABLE_PLANS: frozenset[str]` = `{"free", "standard", "premium"}` in `entitlements.py`.
  - `set_user_plan(db, user_id: int, plan_slug: str) -> UserSubscription` — validates slug ∈ `SELECTABLE_PLANS`, upserts the subscription to `status="active"`, raises `ValueError` on an unknown slug.
  - `UserCreateRequest.plan: str = "free"`.
  - `POST /billing/select-plan` body `{ "plan_slug": str }` → `200 { "plan_slug": str }`.
  - `ALLOW_UNPAID_PLAN_SELECTION: bool` in config.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_plan_selection.py`:

```python
"""Choosing a plan at registration and via the select-plan endpoint."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.crud import user as user_crud
from app.services import entitlements as ent


class PlanSelectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _plan_of(self, username):
        u = user_crud.get_user_by_username(self.db, username)
        return self.db.query(UserSubscription).filter_by(user_id=u.id).first().plan_slug

    def test_register_defaults_to_free(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="a", email="a@e.pl", password="pw"))
        self.assertEqual(self._plan_of("a"), "free")

    def test_register_with_premium_activates_premium(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="b", email="b@e.pl", password="pw", plan="premium"))
        self.assertEqual(self._plan_of("b"), "premium")

    def test_set_user_plan_rejects_unknown_slug(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="c", email="c@e.pl", password="pw"))
        u = user_crud.get_user_by_username(self.db, "c")
        with self.assertRaises(ValueError):
            ent.set_user_plan(self.db, u.id, "enterprise")
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `python -m unittest tests.test_plan_selection -v`
Expected: FAIL — `UserCreateRequest` has no `plan`; `set_user_plan` does not exist.

- [ ] **Step 3: Implement schema + `set_user_plan` + create_user**

In `backend/app/schemas/user_schema.py`:

```python
from pydantic import BaseModel


class UserCreateRequest(BaseModel):
    username: str
    password: str
    email: str
    plan: str = "free"
```

In `backend/app/services/entitlements.py` add:

```python
SELECTABLE_PLANS: frozenset[str] = frozenset({"free", "standard", "premium"})


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
```

In `backend/app/crud/user.py`, replace the `ensure_free_subscription` import and its use in `create_user`. Change the import line to:

```python
from app.services.entitlements import ensure_free_subscription, set_user_plan
```

and replace the final two lines of `create_user` (`ensure_free_subscription(db, db_user.id)` / `return ...`) with:

```python
    requested = getattr(user, "plan", "free") or "free"
    try:
        set_user_plan(db, db_user.id, requested)
    except ValueError:
        ensure_free_subscription(db, db_user.id)
    return "user registration complete"
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `python -m unittest tests.test_plan_selection -v`
Expected: PASS.

- [ ] **Step 5: Add config flag + billing route + register router**

In `backend/app/core/config.py`, add:

```python
# Pre-Stripe: allow choosing a paid plan without payment. Flip to False (or gate
# standard/premium through Stripe checkout) when billing lands — this is the one
# place that lets a user self-activate Standard/Premium for free.
ALLOW_UNPAID_PLAN_SELECTION = os.getenv("ALLOW_UNPAID_PLAN_SELECTION", "true").lower() == "true"
```

Create `backend/app/api/routes/billing.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import ALLOW_UNPAID_PLAN_SELECTION
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.dependencies import get_db
from app.services.entitlements import SELECTABLE_PLANS, set_user_plan

router = APIRouter(prefix="/billing", tags=["billing"])


class SelectPlanRequest(BaseModel):
    plan_slug: str


@router.post("/select-plan")
async def select_plan(
    request: SelectPlanRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    if request.plan_slug not in SELECTABLE_PLANS:
        raise HTTPException(status_code=400, detail="Nieznany plan.")
    if request.plan_slug != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        raise HTTPException(status_code=402, detail="Ten plan wymaga płatności.")
    sub = set_user_plan(db, user.id, request.plan_slug)
    return {"plan_slug": sub.plan_slug}
```

In `backend/app/main.py`, add `billing` to the route import on line 7 and register it near the other routers (after line 74):

```python
from app.api.routes import auth, pdf, images, ai, events, billing
```
```python
app.include_router(billing.router)
```

- [ ] **Step 6: Verify the app imports cleanly**

Run (from `backend/`): `python -c "import app.main"`
Expected: no ImportError (prints the DIST_DIR path line, which is fine).

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/config.py backend/app/schemas/user_schema.py backend/app/services/entitlements.py backend/app/crud/user.py backend/app/api/routes/billing.py backend/app/main.py backend/tests/test_plan_selection.py
git commit -m "feat(billing): choose plan at registration + /billing/select-plan"
```

---

## Task 4: Hero — credit copy + plan-aware CTAs

**Files:**
- Modify: `frontend/src/pages/Hero/Hero.jsx` (Cennik section ~lines 522-571; account priceCard ~lines 432-443)

**Interfaces:**
- Consumes: nothing new. Plan CTAs use existing `<Link to="/register?plan=...">`.
- Produces: Hero links carrying `?plan=free|standard|premium`, consumed by Task 5's Register.

- [ ] **Step 1: Update the Cennik plan cards**

In `frontend/src/pages/Hero/Hero.jsx`, in the Cennik section:

- Free card CTA (`<Link to="/register" className={classes.planCtaSecondary}>`) → `to="/register?plan=free"`.
- Standard card: change the feature line `<li>AI Assistant (40 akcji / mies.)</li>` to `<li>Asystent AI — 150 kredytów / mies.</li>`; change its CTA `to="/register"` → `to="/register?plan=standard"`.
- Replace the entire third plan card (currently "Pro", ~lines 556-570) with Premium:

```jsx
                    <div className={classes.planCard}>
                        <div className={classes.planName}>Premium</div>
                        <div className={classes.planPrice}>
                            <span className={classes.planAmount}>49</span>
                            <span className={classes.planCurrency}>zł</span>
                        </div>
                        <p className={classes.planPeriod}>miesięcznie · 469 zł / rok</p>
                        <ul className={classes.planFeatures}>
                            <li>Asystent AI — 300 kredytów / mies.</li>
                            <li>Wszystkie 25 szablonów</li>
                            <li>Bez limitu projektów i eksportów</li>
                            <li>Wiele wersji CV pod oferty</li>
                        </ul>
                        <Link to="/register?plan=premium" className={classes.planCtaSecondary}>Wybierz Premium</Link>
                    </div>
```

Under the Cennik `<p className={classes.cennikText}>` paragraph (~line 518-520), append a credit note inside that paragraph or as a sibling line:

```jsx
                    <p className={classes.cennikText}>1 kredyt AI ≈ 5 gr — płacisz tylko za realne użycie.</p>
```

- [ ] **Step 2: Update the account-panel price card**

In the account panel (~lines 432-443), change the Free priceCard paragraph text to reference credits and point its CTA at the free plan:

- `<p className={classes.cardP}>Edytor, wybrane szablony i eksport PDF. AI Assistant — w planie Standard.</p>` → `...eksport PDF. Kredyty AI — w planach Standard i Premium.`
- `<Link to="/register" className={classes.priceCta}>` → `to="/register?plan=free"`.

- [ ] **Step 3: Verify the build compiles**

Run (from `frontend/`): `npm run build`
Expected: build succeeds (no unresolved identifiers / JSX errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Hero/Hero.jsx
git commit -m "feat(hero): AI-credit pricing copy and plan-aware signup CTAs"
```

---

## Task 5: Register — plan selector wired to `?plan=`

**Files:**
- Create: `frontend/src/pages/Register/PlanSelector.jsx`
- Create: `frontend/src/pages/Register/PlanSelector.module.css`
- Modify: `frontend/src/pages/Register/Register.jsx`

**Interfaces:**
- Consumes: `?plan=` query param (via `useSearchParams`); Task 3's `POST /auth/register` accepting `plan`.
- Produces: register request body `{ username, email, password, plan }`.

- [ ] **Step 1: Create the PlanSelector component**

Create `frontend/src/pages/Register/PlanSelector.jsx`:

```jsx
const PLANS = [
    { slug: "free", name: "Free", note: "0 zł · bez kredytów AI" },
    { slug: "standard", name: "Standard", note: "29 zł · 150 kredytów AI" },
    { slug: "premium", name: "Premium", note: "49 zł · 300 kredytów AI" },
];

export default function PlanSelector({ value, onChange, classes, disabled }) {
    return (
        <div className={classes.planSelector} role="radiogroup" aria-label="Wybierz plan">
            {PLANS.map((plan) => (
                <button
                    type="button"
                    key={plan.slug}
                    role="radio"
                    aria-checked={value === plan.slug}
                    disabled={disabled}
                    className={`${classes.planOption} ${value === plan.slug ? classes.planOptionActive : ""}`}
                    onClick={() => onChange(plan.slug)}
                >
                    <span className={classes.planOptionName}>{plan.name}</span>
                    <span className={classes.planOptionNote}>{plan.note}</span>
                </button>
            ))}
        </div>
    );
}

export const PLAN_SLUGS = PLANS.map((p) => p.slug);
```

- [ ] **Step 2: Create the PlanSelector styles**

Create `frontend/src/pages/Register/PlanSelector.module.css`:

```css
.planSelector {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 4px;
}

.planOption {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    border: 1px solid #2A2F37;
    border-radius: 10px;
    background: transparent;
    color: #C7CED8;
    cursor: pointer;
    text-align: left;
    transition: border-color 120ms ease, background 120ms ease;
}

.planOption:hover:not(:disabled) {
    border-color: #46617F;
}

.planOptionActive {
    border-color: #6C9BE6;
    background: rgba(108, 155, 230, 0.12);
    color: #FFFFFF;
}

.planOptionName {
    font-weight: 600;
    font-size: 14px;
}

.planOptionNote {
    font-size: 11px;
    color: #97A1B0;
}
```

- [ ] **Step 3: Wire Register.jsx to the selector and query param**

In `frontend/src/pages/Register/Register.jsx`:

Update the react-router import (line 6) to include `useSearchParams`:

```jsx
import { useNavigate, useSearchParams, Link } from "react-router-dom";
```

Add the PlanSelector import after the existing imports:

```jsx
import PlanSelector, { PLAN_SLUGS } from "./PlanSelector";
```

Inside the component, after `const navigate = useNavigate();`, add:

```jsx
    const [searchParams] = useSearchParams();
    const initialPlan = PLAN_SLUGS.includes(searchParams.get("plan"))
        ? searchParams.get("plan")
        : "free";
    const [plan, setPlan] = useState(initialPlan);
```

In `handleSubmit`, add `plan` to the request body:

```jsx
        api.httpRequest(ENDPOINTS.AUTH.REGISTER, "POST", JSON.stringify({ username, email, password, plan }), "Rejestracja nie powiodła się")
```

Render the selector: after the `<p className={classes.subHeading}>...</p>` line, add a labelled control block (reusing the register `classes` plus the plan-selector styles):

```jsx
                <div className={classes.control}>
                    <label>Plan</label>
                    <PlanSelector value={plan} onChange={setPlan} classes={planClasses} disabled={isLoading} />
                </div>
```

Import the plan-selector CSS module at the top alongside the existing `classes` import:

```jsx
import planClasses from "./PlanSelector.module.css";
```

- [ ] **Step 4: Verify the build compiles**

Run (from `frontend/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manually verify plan preselection**

Run (from `frontend/`): `npm run dev`, open `/register?plan=premium`.
Expected: the Premium option is highlighted on load; clicking Standard changes the highlight; the register POST body includes the selected `plan` (check Network tab).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Register/PlanSelector.jsx frontend/src/pages/Register/PlanSelector.module.css frontend/src/pages/Register/Register.jsx
git commit -m "feat(register): plan selector preseeded from ?plan= and sent on signup"
```

---

## Task 6: Sidebar — show remaining AI credits

**Files:**
- Modify: `frontend/src/components/editor/Sidebar/Sidebar.jsx` (planBadge ~lines 71-82)

**Interfaces:**
- Consumes: entitlements payload keys from Task 2 (`usage.ai_credits_used`, `limits.monthly_ai_credits`).
- Produces: nothing downstream.

- [ ] **Step 1: Add a credits line to the plan badge title**

In `frontend/src/components/editor/Sidebar/Sidebar.jsx`, replace the `planBadge` `title` expression (lines 74-78) so it shows both exports and AI credits when present:

```jsx
                    title={[
                        entitlements.plan_name,
                        entitlements.remaining?.exports != null
                            ? `Eksporty: ${entitlements.usage?.exports_count ?? 0}/${entitlements.limits?.max_exports_per_month ?? "∞"}`
                            : null,
                        entitlements.limits?.monthly_ai_credits != null
                            ? `Kredyty AI: ${entitlements.usage?.ai_credits_used ?? 0}/${entitlements.limits.monthly_ai_credits}`
                            : null,
                    ].filter(Boolean).join(" · ")}
```

- [ ] **Step 2: Verify the build compiles**

Run (from `frontend/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/editor/Sidebar/Sidebar.jsx
git commit -m "feat(sidebar): show remaining AI credits in the plan badge"
```

---

## Final verification

- [ ] **Backend test suite**

Run (from `backend/`):
```bash
python -m unittest tests.test_entitlements tests.test_ai_credits tests.test_plan_selection tests.test_ai_cv_routes tests.test_ai_chat_command tests.test_ai_assistant_exception_handling tests.test_openai_pricing -v
```
Expected: all PASS.

- [ ] **Frontend build**

Run (from `frontend/`): `npm run build`
Expected: succeeds.

- [ ] **End-to-end smoke (manual)**

Start backend (`uvicorn app.main:app --reload` from `backend/`) and frontend (`npm run dev`). From the Hero "Wybierz Premium" CTA → register → log in → open the editor. Confirm the plan badge shows Premium with "Kredyty AI: 0/300", and that after one AI assistant action the used count increases by the call's credit cost.

---

## Notes for the implementer

- **Charge-after-success:** credits are only deducted on a successful AI call (the `charge_ai_credits` calls sit after the model call returns). A failed call costs nothing — this is intentional.
- **Monthly reset is automatic:** `UsageCounter` is keyed by `period_key` (`YYYY-MM`), so a new month starts every user at 0 credits used with no extra code.
- **Don't rename DB columns.** `ai_actions_count` / `max_ai_actions_per_month` stay as-is on purpose (no migration); only their meaning and the outward JSON keys change.
