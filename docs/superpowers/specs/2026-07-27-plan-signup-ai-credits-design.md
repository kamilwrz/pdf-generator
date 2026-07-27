# Plan-at-signup + credit-based AI metering — Design

**Date:** 2026-07-27
**Status:** Approved (design), pending implementation plan

## Goal

Let users register directly onto Free, Standard, or Premium **without payment**
(pre-Stripe), and convert the flat "AI actions" meter into **AI credits** priced
at the real cost of each AI call. Reshape the Hero/onboarding so plan selection
flows smoothly into signup.

- **1 credit = 5 groszy (0.05 zł).**
- Standard = **150 credits / month** (~7.50 zł of AI at cost).
- Premium = **300 credits / month** (~15.00 zł of AI at cost).
- Free = **0 credits** (no AI assistant), unchanged.

## Context — what already exists

The backend already carries a full billing scaffold, so this is an adaptation,
not a green-field build:

- Models: `Plan`, `UserSubscription`, `UsageCounter`, `Payment`
  (`backend/app/models/models.py`) — Stripe columns already stubbed, null until
  billing lands.
- `backend/app/services/entitlements.py` seeds **Free / Standard / Pro**, enforces
  gates (`assert_can_use_ai_assistant`, `assert_can_export`,
  `assert_can_create_project`, `assert_can_extract_cv`, `assert_template_allowed`),
  and records usage (`record_ai_action`, `record_export`).
- `backend/app/services/openai_pricing.py` already computes the **real PLN cost of
  every AI call** — `usage_from_response(...)["cost_pln_estimate"]`.
- Both AI entry points already have that cost in hand at the line where they record
  the action:
  - `backend/app/api/routes/ai.py:77` (`extract_cv`) — has `usage`.
  - `backend/app/api/routes/ai_assistant.py:93` (`assistant`) — has `result["usage"]`.
- Registration (`backend/app/crud/user.py:create_user`) always assigns **Free** via
  `ensure_free_subscription`; there is no plan picker anywhere today.
- Hero (`frontend/src/pages/Hero/Hero.jsx`) has a Cennik section (Free / Standard /
  Pro at 0 / 29 / 49 zł) and a Register page that is a plain form → `/login`.

## Decisions (locked)

1. **Plan selection:** Hero plan cards link to `/register?plan=<slug>`; the register
   form shows the chosen plan (changeable) and the backend **instantly activates**
   it on account creation. No payment.
2. **Credit metering:** charge the **real cost**, block at 0. Pre-check allows a call
   when remaining > 0; after the call, deduct `ceil(cost_pln / 0.05)` (min 1).
3. **Rename** internal slug `pro` → `premium` (with one-time data migration).
4. **Keep displayed prices** at 29 / 49 zł.
5. **Reinterpret existing columns** as credits — no schema migration.

## Design

### 1. No schema migration — reinterpret columns

The existing columns already fit; change meaning + seed values, not structure:

- `Plan.max_ai_actions_per_month` → **monthly credit allowance** (Free 0 · Standard
  150 · Premium 300). The `Plan` table is fully re-seeded on every startup by
  `seed_plans`, so new values apply on next boot.
- `UsageCounter.ai_actions_count` → **credits consumed this period**.

Outward-facing JSON keys and all UI copy switch to "credits" so nothing reads
"actions" while holding credits. Column names stay; only their interpretation and
the API contract change.

### 2. Credit metering (`entitlements.py`)

- `credits_for_cost(cost_pln: float) -> int = max(1, ceil(cost_pln / 0.05))`.
  Example: 0.15 zł → 3 credits; any successful call ≥ 1 credit.
- Replace `record_ai_action(db, user_id)` with
  `charge_ai_credits(db, user_id, cost_pln)` that increments
  `ai_actions_count` by `credits_for_cost(cost_pln)`. Both call sites pass
  `usage["cost_pln_estimate"]`.
- `assert_can_use_ai_assistant` keeps its **pre-check: block when remaining ≤ 0**.
  Because the true cost is only known after the call, a single call may push the
  counter slightly past the limit; the next call is then blocked. Copy: "akcje AI"
  → "kredyty AI".

### 3. Plan seeds (`PLAN_SEEDS`)

| slug     | credits/mo | projects | exports/mo | assistant | extract_cv | templates |
|----------|-----------:|---------:|-----------:|-----------|------------|-----------|
| free     | 0          | 1        | 3          | no        | no         | starter   |
| standard | 150        | 10       | 30         | yes       | yes        | all       |
| premium  | 300        | ∞        | ∞          | yes       | yes        | all       |

(Only `max_ai_actions_per_month` values and the `pro`→`premium` slug/name change
versus today; projects/exports keep their current values.)

### 4. Slug rename `pro` → `premium`

`bootstrap_billing` (runs on startup after `seed_plans`) idempotently:

- `UPDATE user_subscriptions SET plan_slug='premium' WHERE plan_slug='pro'`.
- Deactivates any stale `pro` plan row (`is_active=False`) if present.

DB-agnostic (SQLite + Postgres) and safe to run every boot.

### 5. Backend — plan activation

- `UserCreateRequest` gains `plan: Literal["free","standard","premium"] = "free"`.
  `create_user` activates the chosen plan instantly (writes/updates
  `UserSubscription.plan_slug`), replacing the unconditional
  `ensure_free_subscription`.
- New authenticated `POST /billing/select-plan` with body `{ "plan_slug": ... }`,
  validates the slug against the active catalog and upserts the subscription to
  `active`. Reused later for in-app plan changes.
- **Stripe seam:** a config flag `ALLOW_UNPAID_PLAN_SELECTION` (default `True`
  now). When billing lands, selecting standard/premium routes through Stripe
  checkout instead of instant-activating; free stays instant. This is the single
  place to lock down, commented clearly so free Premium cannot reach production by
  accident.

### 6. Frontend

- **Hero** (`Hero.jsx`): Cennik + account panel copy — Standard "150 kredytów AI /
  mies.", Premium (renamed from Pro) "300 kredytów AI / mies.", small note
  "1 kredyt ≈ 5 gr". Plan CTAs link to `/register?plan=free|standard|premium`.
- **Register** (`Register.jsx`): read `?plan=` query param, show a Free / Standard /
  Premium segmented control (defaulted from the param, changeable), send `plan` on
  submit, adapt the subheading to the chosen plan.
- **AiAssistant + entitlements display** (`useEntitlements.js` consumers,
  `AiAssistant.jsx`): "akcje AI" → "kredyty AI", read the renamed payload keys,
  show remaining credits.

### 7. Entitlements API payload

Rename the outward keys (DB columns unchanged):

- `limits.max_ai_actions_per_month` → `limits.monthly_ai_credits`
- `usage.ai_actions_count` → `usage.ai_credits_used`
- `remaining.ai_actions` → `remaining.ai_credits`

All frontend consumers updated to the new keys.

## Testing

Backend:

- `credits_for_cost`: 0.15 → 3; 0.004 → 1 (min); 0.05 → 1; 0.11 → 3 (ceil).
- `charge_ai_credits` decrements the period counter by the credit cost.
- Pre-check blocks a Free user (0 credits) and a Standard user at/over 150.
- Register with `plan=standard`/`premium` activates that subscription; default is
  free; an invalid plan is rejected.
- `bootstrap_billing` migrates an existing `pro` subscription to `premium` and is
  idempotent on a second run.
- Seed values: standard=150, premium=300, free=0.

Frontend (light): `/register?plan=premium` preselects Premium; changing the
selector changes the submitted `plan`.

## Out of scope (YAGNI)

- Stripe checkout / webhooks.
- Credit top-up / one-off purchases.
- Account-settings redesign (the `select-plan` endpoint is built to be reused, but
  no settings UI is part of this work).
