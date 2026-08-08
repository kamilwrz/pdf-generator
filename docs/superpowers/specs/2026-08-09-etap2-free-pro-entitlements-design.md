# Etap 2 — Free/Pro entitlements, watermark, import gating — carry-over draft

**Date:** 2026-08-09 (drafted 2026-08-08, for pickup tomorrow)
**Status:** NOT approved — this is a carry-over draft, not a brainstormed-and-approved spec. It exists so tomorrow's session can start from grounded facts instead of re-deriving them. Do not implement against this file directly; run it through `superpowers:brainstorming` first (see "Next steps" at the bottom).
**Origin:** Etap 1 (guest-mode onboarding) shipped 2026-08-07/08. The original design doc's own scope cut (`docs/superpowers/specs/2026-08-07-onboarding-monetization-design.md`, §7) sketched Etap 2 but explicitly deferred it: "separate spec before implementation."

---

## 1. Why Etap 2, and why now

Etap 1 solved the funnel-entry problem (no forced registration before value). It deliberately shipped **zero** billing/entitlement changes. The product still has:

- Three plans (`Free` / `Standard` / `Premium`) with AI-credit-based differentiation that's hard to explain to a new user in one sentence.
- No watermark — Free already gets 3 real exports/month with zero cost signal to upgrade.
- Free limited to **5 starter templates**, not all 14 — a wall that Etap 1's guest mode doesn't remove (guests get the same 5-template allowlist as Free, per `FREE_STARTER_TEMPLATE_IDS`).
- CV import gated behind `Standard` outright, with no free trial at all.

Etap 2 is the piece that actually turns free-editor traffic (now flowing in thanks to Etap 1) into paying accounts.

## 2. Verified current state (read from code 2026-08-08, not guessed)

`backend/app/services/entitlements.py`:

```python
FREE_STARTER_TEMPLATE_IDS = ("ledger", "nimbus", "kernel", "regent", "nova")  # 5 of 14

PLAN_SEEDS = [
  {"slug": "free",     "max_projects": 1,    "max_exports_per_month": 3,  "max_ai_actions_per_month": 0,   "ai_assistant": False, "extract_cv": False, "template_tier": "starter"},
  {"slug": "standard", "max_projects": 10,   "max_exports_per_month": 30, "max_ai_actions_per_month": 150, "ai_assistant": True,  "extract_cv": True,  "template_tier": "all"},
  {"slug": "premium",  "max_projects": None, "max_exports_per_month": None,"max_ai_actions_per_month": 300,"ai_assistant": True,  "extract_cv": True,  "template_tier": "all"},
]
```

Gate functions already in place (all in `entitlements.py`):
- `assert_can_export(db, user)` — checks `max_exports_per_month`, raises `plan_limit_exports` — hooked in `backend/app/api/routes/pdf.py:201` inside `download_pdf`.
- `assert_can_extract_cv(db, user)` — checks the `extract_cv` flag + AI credits, raises `plan_feature_extract_cv` — hooked in `backend/app/api/routes/ai.py:96` inside `extract_cv`.
- `assert_template_allowed(db, user, template_id)` — checks `allowed_template_ids` from `template_tier`.
- `assert_can_use_ai_action`, `charge_ai_credits`, `CREDIT_PLN = 0.05`.

No watermark code exists anywhere in `backend/app/services/pdf_generator.py` today — Etap 2's watermark is a genuinely new render path, not a toggle on an existing one.

`frontend/src/hooks/useEntitlements.js` and `PlanSelectModal` already read/display this three-plan shape; Hero's pricing section (`frontend/src/pages/Hero/Hero.jsx`) has its own hardcoded plan cards, currently AI-credit-framed per this session's earlier finding: "17 szablonów" / "Wszystkie 18 szablonów" copy is already inconsistent with the real 14-template registry — a pre-existing bug unrelated to Etap 2, worth fixing whenever that copy is touched next.

## 3. Etap 2 sketch as originally approved (2026-08-07, §7 of the onboarding design doc)

These were agreed at a sketch level during Etap 1's brainstorming, not re-validated since:

1. **Collapse `Free` / `Standard` / `Premium` → `Free` / `Pro`.**
   - Free: `max_projects=1`, **all 14 templates** (not just the 5 starters), **watermarked** export, **1 lifetime** free `extract_cv` call (a new counter — not the existing monthly `max_ai_actions_per_month` shape), no other AI actions.
   - Pro: clean (no watermark) export, multiple documents/imports, full AI actions.
2. **Watermark** rendered in `PDF_Generator`, gated by plan, applied in `create_pdf_document` / `download_pdf`.
3. **Import gate** moves from "Standard-only" to "Free: 1 lifetime, rate-limited" / "Pro: more" — enforced in `ai.py` + `entitlements.py`.
4. **Pricing copy** rewritten around outcomes, not AI-credit counts (`PlanSelectModal`, Hero pricing section, `useEntitlements.js`).
5. **No Stripe** — manual/ops plan activation stays exactly as-is (`ALLOW_UNPAID_PLAN_SELECTION`, `POST /billing/select-plan`).

## 4. What is genuinely undecided (needs a real brainstorming pass, not assumed here)

Listed as open questions so tomorrow's session can resolve them quickly instead of rediscovering them mid-implementation:

1. **Watermark design** — visual treatment (diagonal text? footer stamp? logo?), whether it's removable by re-export after upgrade, whether it touches the *stored* PDF file or is applied at download time only (affects whether upgrading retroactively unlocks already-exported files).
2. **"1 lifetime free import" mechanics** — is it a new `usage_counters`-style row (`period_key` doesn't fit "lifetime"), a boolean flag on `User`/`UserSubscription`, or a dedicated table? What happens if a Free user's one import fails mid-call (OpenAI error) — does it still consume the lifetime credit?
3. **Migration of existing Standard/Premium users** — do they get grandfathered into Pro automatically? Does `Premium`'s `layout` action (Układ, currently Premium-only) become part of `Pro`, or does a third tier need to survive for that one feature? The sketch says "Free/Pro (2 plans)" but Premium's `layout` AI action isn't mentioned — this is a real gap in the sketch, not just an implementation detail.
4. **Template tier change fallout** — Free jumping from 5 to all 14 templates removes the `template_tier: "starter"` distinction entirely. Does `assert_template_allowed` / `allowed_template_ids` become dead code, or does some other differentiation replace it?
5. **Pricing copy and numbers** — actual Pro price point, whether monthly/annual, and the specific outcome-framed copy are not decided at all; the sketch only says "rewritten around outcomes."
6. **Rollout sequencing** — does watermarking ship before or after the Free/Pro plan collapse? They're separable; bundling them into one plan risks a repeat of Etap 1's scope-discipline problem if not split.

## 5. Suggested next steps (tomorrow)

1. Run `superpowers:brainstorming` against this draft — resolve the open questions in §4 the same way Etap 1's monetization redesign was scoped (multiple-choice `AskUserQuestion` rounds), producing a real approved design doc (`docs/superpowers/specs/2026-08-09-etap2-...-design.md`, replacing this carry-over file or superseding it).
2. Once approved, run `superpowers:writing-plans` to turn it into a task-by-task implementation plan under `docs/superpowers/plans/`.
3. Execute via `superpowers:subagent-driven-development` on `main`, matching the pattern used for Etap 1 (fresh implementer per task, task review, final whole-branch review, live browser verification before calling it done).
4. Given §4.6, seriously consider **not** bundling watermarking and the Free/Pro plan collapse into one Etap 2 — they can ship as two independent, smaller slices with their own review cycles, the same lesson Etap 1 already validated (guest-mode alone was the right size).

## 6. Explicit non-goals (carried over from the original sketch, still true)

- No Stripe Checkout.
- No Google login.
- No CV Score / heuristic scoring.
- No changes to Etap 1's guest-mode mechanics themselves.
