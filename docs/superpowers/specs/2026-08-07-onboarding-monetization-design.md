# Onboarding and monetization redesign — design

**Date:** 2026-08-07
**Status:** Approved for planning (Etap 1 scope)
**Origin:** Product review of README + landing page; user confirmed the diagnosis and made the decisions recorded below.

---

## 1. Problem

The product is ~90% feature-complete (14 templates, AI import, guided wizard, structural + freeform editor, template switching, content AI, layout AI, autosave, 1:1 PDF export) but the funnel forces registration before any value is shown:

```
Landing → choose intent → Register/Login → protected /pdfcanvas → first value
```

`ProtectedRoute` ([frontend/src/ProtectedRoute.jsx](../../../frontend/src/ProtectedRoute.jsx)) redirects to `/login` whenever `localStorage.token` is absent, so nothing — not the canvas, not a template, not the wizard — can be seen before an account exists. Registration also asks the new user to pick a paid plan up front ([frontend/src/pages/Register/PlanSelector.jsx](../../../frontend/src/pages/Register/PlanSelector.jsx)), before they know what they're buying.

Separately, CV import (`POST /ai/extract_cv`) calls a paid OpenAI vision endpoint ([backend/app/services/ai_service.py](../../../backend/app/services/ai_service.py) `extract_cv_data`), so it cannot simply be opened to anonymous traffic without a cost-abuse risk.

## 2. Decisions (confirmed by the user)

| Question | Decision |
|---|---|
| Access before registration | **Demo + full guest mode**: a canned example CV to click around AND full editor/wizard usage with the user's own data, stored client-side, before any account exists |
| Import cost control | **Account + 1 free import**: import requires a free account; each account gets exactly one free `extract_cv` call, rate-limited |
| Pricing model | **Free / Pro** (two plans; Premium shelved until there's usage data) |
| Payments | **No Stripe this phase** — entitlements stay on manual/existing activation path |
| Primary paywall | **Export** — Free exports a real, working PDF with a watermark; Pro removes it |
| Free templates | **All 14**, usable and exportable (watermarked) — no template-tier gate |
| AI actions | **Pro-only** (grammar/improve/ATS/layout), except the one free import |
| Free document limit | **1 saved document** |
| Google login | Deferred to a later phase |
| CV Score / Final check | Deferred to a later phase |
| First shippable slice | **Etap 1: guest mode + demo + landing + registration cleanup** — zero OpenAI calls, zero payment code, biggest funnel impact |

## 3. Scope for this spec: Etap 1 only

Etap 1 delivers the `value → auth` reordering with **no backend AI or billing changes**. Etap 2 (Free/Pro entitlements + watermark + import gating) and Etap 3+ (Stripe, Google login, CV Score, contextual onboarding, SEO landings) are sketched at the end for context but are separate specs/plans, built after Etap 1 ships and funnel data exists.

### Why this order is safe

Template loading and the guided wizard are entirely frontend/deterministic — `handleLoadTemplate` materializes static specs ([frontend/src/utils/materializeElementSpecs.js](../../../frontend/src/utils/materializeElementSpecs.js)), and the wizard builds `cv_data` locally before any fill call. Only `POST /ai/extract_cv` (PDF import) and `POST /ai/fill_template` touch the backend in ways that cost money or require ownership. So a guest can experience the canvas, every template, and the wizard's data entry with **zero backend calls and zero OpenAI cost** — the exact gap the product review identified.

---

## 4. Guest mode

### 4.1 Routing

`ProtectedRoute` currently hard-redirects to `/login` when `localStorage.token` is missing. It becomes a no-op passthrough for `/pdfcanvas`: the route renders unconditionally, and `PdfCanvas` itself decides guest vs. authenticated behavior from token presence.

**Critical existing behavior to guard:** `PdfCanvas.jsx` (`frontend/src/pages/PdfCanvas.jsx:349-361`) runs a mount effect that calls `GET /auth/verify-token/{token}` unconditionally and clears the token + navigates to `/` on 401/403. With no token, `localStorage.getItem("token")` is `null`, the request still fires (`.../verify-token/null`), predictably 401s, and today's code path would clear "the token" (already absent) and bounce back to `/`. This effect must skip entirely when there is no token — guest mode is not an invalid session, it is the default state.

### 4.2 Guest document state

A new util, `frontend/src/utils/guestDocument.js`, owns a single `localStorage` key (`cvstudio.guest.doc`) holding `{ elements, deletedIds, title, pageCount, pageSize, templateId, editorMode, spacingPx, updatedAt }` — the same shape `useA4Elements` already keeps in memory. Functions: `loadGuestDocument()`, `saveGuestDocument(snapshot)`, `clearGuestDocument()`.

`useA4Elements` ([frontend/src/hooks/useA4Elements.js](../../../frontend/src/hooks/useA4Elements.js)) and `usePdfExport` ([frontend/src/hooks/usePdfExport.js](../../../frontend/src/hooks/usePdfExport.js)) gain a guest branch: when there is no token, the debounced autosave writes to `guestDocument` via `saveGuestDocument` instead of `PUT /pdf/save_elements`, and `createPdf`/`updatePdf` (which render and store a real PDF file) are unavailable — guest "export" is blocked behind the save-prompt described in §4.4, not silently degraded.

Everything else in `useA4Elements` (undo/redo, reflow, template load, section/record add, drag/resize) is pure frontend state and needs no guest-specific branching — it already operates on the in-memory `A4_Elements` array regardless of persistence backend.

### 4.3 Demo CV

`frontend/src/templates/demoCv.js` exports a static, realistic example document (fictional name/role/experience/education) in the same materialized-element shape as `frontend/src/templates/index.js` entries, so it flows through the exact same `handleLoadTemplate` path. Loading it sets guest mode's `templateId` and marks it as demo content (`isDemoContent: true` in guest state, not per-element) so the editor can show a persistent banner:

> "To jest przykładowe CV. [Użyj własnych danych] [Zacznij od zera]"

Both banner actions clear the demo flag and either open the wizard/import entry or reset to blank, matching the existing `handleClearA4` / `handleLoadTemplate` machinery.

### 4.4 Save-gate (registration at the point of value)

The first time a guest clicks **Zapisz PDF** or **Pobierz PDF** (the two actions that require a real backend-rendered file, per `usePdfExport`), instead of firing the API call, a modal appears:

> **Nie zgub swojej pracy**
> Utwórz darmowe konto, aby zapisać CV i pobrać gotowy PDF.
> [Utwórz konto] [Mam już konto]

On successful registration/login, `claimGuestDocument()` runs: it reads the current guest snapshot, calls the existing `POST /pdf/create_pdf` with those elements (same payload shape `createPdf` already builds), clears `guestDocument` from localStorage, and sets the new `pdfId` — after which the export action the user originally clicked re-fires automatically so the flow feels uninterrupted.

Registration itself drops `PlanSelector` from `frontend/src/pages/Register/Register.jsx` — every new account is Free by default (already the DB default via `bootstrap_billing`/`seed_plans`); asking a brand-new user to pick a plan before they've seen the product is removed entirely, independent of any Etap 2 pricing change.

### 4.5 Landing page

`frontend/src/pages/Hero/Hero.jsx` gets a copy/CTA change (not a full visual redesign — that stays a candidate for a later `/design-review` pass):

- One primary message instead of enumerating every feature.
- Two primary paths: **"Mam CV" → import** and **"Tworzę CV" → wizard/blank**, both landing directly in guest `/pdfcanvas` (no auth detour).
- A secondary, lower-emphasis link: **"Zobacz edytor"** → loads the demo CV.
- Sub-CTA line: "Bez karty • Zacznij bez konta."

Import specifically: clicking "Mam CV" still lets the guest drop a PDF file and see it staged, but the **actual `POST /ai/extract_cv` call is deferred to Etap 2's account gate** — in Etap 1, since there is no free-import accounting yet, import either (a) is temporarily still behind login as today, or (b) shows the staged file with "Utwórz darmowe konto, aby przeanalizować Twoje CV" before calling the endpoint. Given Etap 1 explicitly excludes backend AI/entitlement changes, **(b) is not implementable yet without the Etap 2 free-import counter** — so Etap 1 ships the wizard/blank/demo guest paths fully, and leaves the import entry point wired to today's login-gated flow with updated copy, until Etap 2 lands the accounting needed to safely open it pre-registration. This is called out explicitly so it isn't mistaken for scope creep later.

### 4.6 Funnel analytics

A small guest-side event buffer (`frontend/src/utils/guestEvents.js`) queues events in `localStorage` (`cvstudio.guest.events`) for anonymous users and flushes them through the existing `POST /events/log` once a user_id exists (right after registration/login, alongside `claimGuestDocument`). Authenticated events continue exactly as today.

Events added: `landing_cta_clicked` (with which CTA), `guest_editor_opened`, `guest_demo_loaded`, `guest_first_edit`, `save_gate_shown`, `register_completed`, `guest_doc_claimed`. This is intentionally minimal — enough to see where guests drop off before investing in Etap 2/3.

---

## 5. Explicit non-goals for Etap 1

- No changes to `entitlements.py`, `billing.py`, `pdf_generator.py`, or the `plans` table.
- No watermarking.
- No import gating changes (stays behind login as today, copy-only tweaks).
- No Google OAuth.
- No CV Score / heuristic scoring feature.
- No Stripe.
- No visual redesign of Hero beyond copy/CTA restructuring (a follow-up `/design-review` can handle animation/mockups).

## 6. Testing

- Frontend unit: `guestDocument.js` (load/save/clear round-trip), `guestEvents.js` (queue/flush), the `PdfCanvas` mount-effect guard (no verify-token call when token is absent — regression test for the redirect-loop risk in §4.1).
- Manual/browser verification (per this project's `/verify` habit): guest can load demo, edit, switch template, trigger save-gate, register, and land back in the editor with the claimed document and correct `pdfId` — no console 401 redirect loop.

---

## 7. Etap 2 (sketch — separate spec before implementation)

- Collapse `Free/Standard/Premium` → `Free/Pro` in `PLAN_SEEDS` ([backend/app/services/entitlements.py](../../../backend/app/services/entitlements.py)); Free: `max_projects=1`, all 14 templates, watermarked export, 1 lifetime free `extract_cv` (new counter, not monthly), no AI actions; Pro: clean export, multiple documents/imports, AI actions.
- Watermark rendering in `PDF_Generator` (backend/app/services/pdf_generator.py) gated by plan, applied in `create_pdf_document`/`download_pdf`.
- Import gate moves from "Standard" to "Free: 1 lifetime, rate-limited" / "Pro: more", enforced in `ai.py` + `entitlements.py`.
- Pricing copy rewritten around outcomes, not AI credits (`PlanSelectModal`, Hero pricing section, `useEntitlements.js`).
- Manual/ops plan activation stays in place (no Stripe yet).

## 8. Etap 3+ (backlog, not scheduled)

Stripe Checkout, Google login (+ drop `username` from registration), heuristic CV Score/Final-check (no AI cost) as an upgrade driver, contextual in-editor onboarding (pulse hints instead of a tour), animated hero (one CV → many templates), SEO landing pages, two-tier import (PyMuPDF text extraction before falling back to vision) to cut OpenAI cost per import.
