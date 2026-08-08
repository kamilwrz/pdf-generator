# Etap 2a: Free-plan watermark + 1-lifetime-free-import — design

**Date:** 2026-08-09
**Status:** Approved for planning
**Origin:** Split off `docs/superpowers/specs/2026-08-09-etap2-free-pro-entitlements-design.md` (the Etap 2 carry-over draft) via `superpowers:brainstorming`. The original Etap 2 sketch bundled a Free/Pro plan collapse with watermarking and import gating; this spec ships only the watermark + import-gate half, on the **existing, unchanged** Free/Standard/Premium plan structure, so the change stays small the way Etap 1 (guest-mode onboarding) did.

---

## 1. Problem

Etap 1 (guest mode) fixed the funnel-entry problem — visitors no longer have to register before touching the editor. But once a guest claims their document into a Free account, nothing about the Free plan signals that upgrading buys anything:

- Free already gets 3 real, clean PDF exports per month (`PLAN_SEEDS["free"].max_exports_per_month = 3`) — no visible cost to staying Free.
- CV import (`POST /ai/extract_cv`) is hard-blocked for Free accounts outright (`entitlements["extract_cv"] = False`) — a new Free user who wants to try importing their existing CV gets an unconditional wall with zero trial, which is a worse first experience than Etap 1's guest funnel was designed to avoid.

This spec closes both gaps without touching plan structure, pricing, or template access — those are deferred to Etap 2b once this ships and there's usage data to inform them.

## 2. Decisions (confirmed via brainstorming, 2026-08-09)

| Question | Decision |
|---|---|
| Ship with the Free/Pro plan collapse, or split? | **Split** — this spec (2a) only; plan collapse + pricing copy is Etap 2b |
| Which plans get watermarked exports? | **Free only** — Standard/Premium exports are byte-for-byte unchanged |
| Watermark visual | **Diagonal repeated text**, low-opacity gray, 2-3× per page |
| Watermark timing after upgrade | **Immediate** — re-rendered fresh at every download from the account's current plan, not baked into a cached file |
| Free import tracking | **Boolean flag** on `UserSubscription` (`free_import_used`), not a new table or a monthly counter |
| Failed import (OpenAI error, bad PDF) | **Does not consume** the free import — only a successful `extract_cv_data()` call sets the flag |

## 3. Scope

**In scope:**
- `download_pdf` re-renders from stored `PdfElements` at download time (all plans) instead of serving a cached file, so watermark state always reflects the account's *current* plan.
- New `watermark: bool` parameter threaded through `PDF_Generator.render_elements` — an overlay pass drawn after normal element rendering, not a change to element drawing itself.
- `UserSubscription.free_import_used` column + migration.
- `assert_can_extract_cv` gains a Free-specific bypass: succeeds once (consuming the flag on success), blocks with an upgrade-prompt error after.
- Frontend surfaces the free-import state (used/available) via `useEntitlements` so the UI doesn't have to guess from a generic 403.

**Explicitly out of scope (Etap 2b or later):**
- Collapsing Free/Standard/Premium → Free/Pro.
- Pricing copy rewrite (`PlanSelectModal`, Hero pricing cards, `useEntitlements.js` labels).
- Template-tier changes — Free stays at the current 5 `FREE_STARTER_TEMPLATE_IDS`, not all 14.
- Premium's `layout` (Układ) AI action — untouched, still Premium-only.
- Stripe, Google login, CV Score — already out of scope for the whole Etap 2 family.

### Why re-rendering at download time is safe

`create_pdf_document` / `update_pdf_document` already call `PDF_Generator.render_elements` synchronously (local disk) or `build_pdf_to_buffer` (S3) at save time — this is deterministic ReportLab drawing from stored `PdfElements`, not an OpenAI call, so repeating it at download time adds server CPU/latency but zero new external cost or risk. Making `download_pdf` always re-render (not just for Free) keeps the endpoint's behavior uniform — no plan-specific branching beyond computing the `watermark` flag — and self-heals a previously-watermarked file the moment a user upgrades, without a separate "re-render all my documents" migration step.

## 4. Watermark rendering

**Visual:** Diagonal text, repeated 2–3 times down the page depending on page height, rotated ~45°, low-opacity gray (e.g. `alpha ≈ 0.12`, mid-gray fill), centered horizontally. Copy: **"CV STUDIO — WERSJA DARMOWA"**.

**Mechanics:** `PDF_Generator.render_elements(elements, resolver, pages, watermark=False)` — after the existing per-page element drawing loop completes for a page, if `watermark` is true, an overlay step (`_draw_watermark(canvas, page_width, page_height)`) draws the repeated diagonal text using `canvas.saveState()` / `setFillAlpha` / `rotate` / `restoreState()`, so it never interferes with the coordinate system element drawing relies on.

**Call sites:**
- `create_pdf_document` / `update_pdf_document` (`document_service.py`): compute `watermark = (get_entitlements(db, user)["plan_slug"] == "free")` before calling `render_elements`, so the file on disk/S3 already matches the plan at save time (fast path — most downloads follow a recent save).
- `download_pdf` (`pdf.py`): **before** serving, re-fetch the owned `Pdf` row's `PdfElements`, recompute `watermark` from the account's *current* plan, call `render_elements` again into the same file path (local) or re-upload (S3), then serve. This is the step that makes a post-upgrade download come back clean without the user needing to re-save.

## 5. Import gating

`assert_can_extract_cv(db, user)` (in `entitlements.py`) changes from:

```python
if not entitlements["extract_cv"]:
    raise PlanLimitError("plan_feature_extract_cv", "...")
assert_has_ai_credits(db, user)
```

to, roughly:

```python
if not entitlements["extract_cv"]:
    if entitlements["plan_slug"] == "free" and not user.subscription.free_import_used:
        return  # allowed: consumes on success, not here
    raise PlanLimitError("plan_feature_extract_cv", "...")
assert_has_ai_credits(db, user)
```

The flag is set in `extract_cv` (`ai.py`), **after** `extract_cv_data(data)` returns successfully — not before the call and not in the entitlements gate itself, so a failed extraction never consumes the free try.

Standard/Premium behavior is completely unchanged (`entitlements["extract_cv"] = True` short-circuits before any Free-specific branch is reached).

## 6. Testing

Backend (`backend/tests/`):
- `assert_can_extract_cv`: Free user's first `extract_cv` call succeeds; second call (flag now set) is blocked with `plan_feature_extract_cv`; a simulated `extract_cv_data` failure leaves the flag unset and a retry still succeeds.
- `download_pdf`: Free-plan download contains the watermark; Standard/Premium download does not; a Free→Standard upgrade followed by a download of a previously-watermarked document comes back clean.
- Migration test / model test for `UserSubscription.free_import_used` default `false`.

Frontend:
- `useEntitlements.test.js` (or equivalent): surfaces `free_import_used` in the entitlements shape consumers can read.
- Manual/browser verification (per this project's `/verify` habit) of the full loop: register as Free → import once (succeeds) → import again (blocked, upgrade prompt shown) → download an exported PDF (watermark visible) → activate Standard via the existing manual/ops path → re-download the same PDF (clean).

## 7. Non-goals (explicit)

- No change to `max_exports_per_month`, `max_projects`, or any other existing Free/Standard/Premium limit.
- No change to which templates Free can use.
- No Stripe, no automatic billing — the manual/ops plan-activation path (`ALLOW_UNPAID_PLAN_SELECTION`, `POST /billing/select-plan`) is exactly how a Free user still becomes Standard/Premium in this spec's test plan.
- No retroactive watermark removal mechanism beyond "download again after upgrading" — there is no separate admin tool to bulk-clean a user's file history.
