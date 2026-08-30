# Progressive page-fit — design

**Date:** 2026-08-22
**Status:** approved design, pending implementation plan
**Scope:** frontend only (no backend / no AI-endpoint changes)

## Problem

A too-long CV today is handled by one fixed remedy: the `LongCvModal` applies a
single hardcoded `COMPACT_FLOW_SPACING = {3,7,15,6}` pass and, if that is not
enough, routes to AI content shortening. Two gaps:

1. **No search between compact and a real hard floor.** If a CV needs only a
   little more compression than `COMPACT` to drop a page, there is no path to
   it short of AI. Conversely, when a looser spacing than `COMPACT` would
   already fit, the fixed pass over-tightens — the document looks cramped for no
   reason (the exact failure the reference screenshot shows at `2/2/10/2`).
2. **AI only ever cuts text.** After shortening drops a page, spacing stays at
   whatever the compact pass set, so the reclaimed vertical space is wasted.

## Goal

Find the **loosest** spacing that fits the target page count, descending only as
far as necessary toward a hidden hard floor; escalate to AI only when spacing
alone cannot do it *without* looking cramped; and after AI, **relax spacing back
toward baseline** so shortening reclaims whitespace instead of just deleting
text.

The engine never prefers the tightest fit. "Loosest that fits the target" is the
single objective.

## Decisions (locked)

- **Entry point:** a user-initiated **"Zmieść na …"** flow. The only
  automatic signal for a too-long CV is a gentle badge + one-time toast; no
  auto-opening modal.
- **Proactive panel hint:** the *Układ CV* panel shows a page-fit affordance
  when `pageCount > targetPages`, with tier-honest copy.
- **Target:** `pages - 1`, never below `1`, for every layout. Sidebar templates
  still surface the long-CV nudge one page sooner, but a three-page document
  first targets two pages instead of promising an implausible jump to one.
  The label adapts.
- **Clean-vs-emergency boundary:** named tiers relative to `COMPACT` and the
  hard floor (see the tier table).
- **Commit:** apply immediately + toast + undo (one history entry), consistent
  with every other layout mutation.
- **Post-AI:** auto-relax loosest-that-still-fits toward baseline, silently.
- **Hard floor:** hidden `MIN_FLOW_SPACING = {2,2,10,2}`, exposed only as the
  emergency **"Maksymalnie zacieśnij"** action.
- **`impossible` tier still shows the panel hint** (honest "skróć treść" copy),
  not suppressed — a genuinely-long CV still gets a calm path to fewer pages.

## Architecture

Three units, each single-purpose:

```
fitToPages.js (pure)         useFitToPages (React side effects)     UI
  findFitForTarget()   ──▶     resolveFitAction() [pure]      ──▶   SectionsPanel hint + badge
  classifyFitTier()            commit / open modal / route AI       LongCvModal (rewritten)
  applyFitPack()
```

- `layoutDensity.js` is **untouched** — its `proposeAutoFitSpacing` keeps its
  distinct balance/density objective. Page-count targeting lives in the new
  module so the two objectives never tangle in one scorer.
- Reuses existing primitives: `applyFlowSpacing`, `collapseSpilledMainIntoSidebar`,
  `reconcileDocumentPages`, `contentMaxPage`, `diagnoseDocumentLength`.

### Unit 1 — `frontend/src/utils/fitToPages.js` (pure, no React)

**New floor** (added to `flowSpacing.js`, beside `DENSITY_SPACING_MIN = {2,5,12,4}`):

```js
export const MIN_FLOW_SPACING = Object.freeze({
  stack: 2, record: 2, section: 10, after_rule: 2,
});
```

`MIN_FLOW_SPACING` is tighter than `DENSITY_SPACING_MIN`. Crucially,
`scaleFlowSpacing` clamps to `DENSITY_SPACING_MIN`, so it can never reach this
floor — the fit engine builds its **own** candidate ladder to get there. This
invariant is pinned by a test.

**`applyFitPack(elements, spacing, pageHeight)`** — the offline pack used in both
trials and (pre-reconcile) commit:

```
packed    = applyFlowSpacing(elements, spacing, pageHeight)
collapsed = collapseSpilledMainIntoSidebar(packed, { spacing, pageHeight })
return collapsed            // page count read via contentMaxPage(collapsed)
```

Stays pure: does **not** call `reconcileDocumentPages` (which needs `nanoid`) —
the orchestrator reconciles at commit time.

**`buildSpacingLadder(loosest, tightest, steps = 10)`** — a monotone list of
`steps + 1` candidates, per-knob linear interpolation from `loosest` (index 0)
to `tightest` (last), each knob rounded and normalized. Index 0 is exactly
`loosest`; last is exactly `tightest`.

**`findFitForTarget({ elements, loosest, tightest, targetPages, pageHeight = 842, packFn = applyFitPack })`**
→ `{ fits, spacing, pageCount, elements, tier }`

```
ladder = buildSpacingLadder(loosest, tightest)
for candidate in ladder:                       // loosest → tightest
    packed = packFn(elements, candidate, pageHeight)
    if contentMaxPage(packed) <= targetPages:
        return { fits: true, spacing: candidate, pageCount, elements: packed,
                 tier: classifyFitTier(candidate) }
// nothing fit, even at the floor:
tightestPacked = packFn(elements, tightest, pageHeight)
return { fits: false, spacing: tightest, pageCount: contentMaxPage(tightestPacked),
         elements: tightestPacked, tier: "impossible" }
```

Returns the **first (loosest)** candidate that fits — never the tightest.

**`classifyFitTier(spacing, { compact = COMPACT_FLOW_SPACING, floor = MIN_FLOW_SPACING })`**

| tier | condition | meaning |
|---|---|---|
| `clean` | every knob ≥ `compact` | fits without looking cramped |
| `tight` | between `compact` and `floor` | fits, but visibly denser |
| `emergency` | within ε of `floor` (only the floor fits) | fits at the design's lower limit |
| `impossible` | (set by `findFitForTarget` when nothing fits) | spacing alone can't reach target |

ε is a per-knob tolerance (e.g. each knob ≤ its floor value + 1) so a candidate
that rounds onto the floor classifies as `emergency`.

**Shrink** call: `loosest = baseline`, `tightest = MIN_FLOW_SPACING`.
**Relax** (post-AI) call: `loosest = baseline`, `tightest = COMPACT_FLOW_SPACING`,
`targetPages = achievedPages`. Same function — loosest-that-fits naturally
reclaims whitespace; the looser tight-end just keeps post-AI results ≥ `COMPACT`.

### Unit 2 — routing + orchestration

**`resolveFitAction(result)`** (pure, unit-tested) maps a `findFitForTarget`
result to an action, keeping the decision out of the effectful hook:

```
clean | tight  → { action: "commit" }
emergency      → { action: "emergency" }   // modal: AI (rec) + Maksymalnie zacieśnij
impossible     → { action: "impossible" }  // modal: AI only
```

**`useFitToPages` hook** (thin executor) exposes:

- `onFitToPages()` — the flagship action:
  ```
  target = diagnoseDocumentLength({ pageCount, elements, isSidebarLayout }).targetPages
  r = findFitForTarget({ elements, loosest: baseline, tightest: MIN_FLOW_SPACING, targetPages: target })
  switch resolveFitAction(r).action:
    "commit"     → commitFit(r) + toast
    "emergency"  → openLongCvModal({ variant: "emergency", fit: r })
    "impossible" → openLongCvModal({ variant: "impossible" })
  ```
- `commitFit(r)` — `setFlowSpacing(r.spacing)` +
  `setA4_Elements(reconcileDocumentPages(r.elements, nanoid, { collapseEmpty: true }).elements)`
  + success toast. One undoable history entry.
- `onForceTighten(r)` — the emergency modal's "Maksymalnie zacieśnij" → `commitFit(r)`.
- `probeFit()` — memoized `findFitForTarget` for the panel hint (see Unit 3).

**PdfCanvas wiring changes:**

- The existing auto-open detection effect (`PdfCanvas.jsx:906`) is **repurposed**:
  it no longer opens `LongCvModal`. It sets a `tooLong` flag (when
  `pageCount > minTooLongPages`) that drives the badge + one-time toast, reusing
  `longCvOfferedForRef` as the once-per-document guard and `shouldResetLongCvOffer`
  for re-arming.
- The success effect (`PdfCanvas.jsx:948`) gains the **post-AI relax**: when
  `pageCount < shortenBaselinePagesRef`, run
  `findFitForTarget({ loosest: baseline, tightest: COMPACT_FLOW_SPACING, targetPages: pageCount })`
  and `commitFit` the result silently, then fire the existing "CV skrócone…" toast.

### Unit 3 — UI

**Gentle badge + one-time toast** (`SectionsPanel` opener + `pushToast`): when
`tooLong`, a dot/badge on the *Układ CV* control and one toast per document:
*"Twoje CV zajmuje N stron — zobacz, jak zmieścić je na mniej."* with an
"Otwórz Układ CV" action.

**Panel hint** (`SectionsPanel` header, replacing the bare `pageStatus` when
`pageCount > targetPages`): runs `probeFit()` — memoized on
`[A4_Elements, baselineSpacing, pageHeight]`, only while the panel is open — and
renders tier-driven copy with one consistent CTA:

| tier | status line | CTA | click → |
|---|---|---|---|
| `clean` / `tight` | "N stron · **można zmieścić na M**" | **Zmieść na M** | silent commit + toast |
| `emergency` | "N stron · zmieścisz na M po skróceniu treści" | **Zmieść na M** | emergency modal |
| `impossible` | "N stron · aby zmieścić na M, **skróć treść**" | **Zmieść na M** | impossible modal |

`M = formatFitTargetLabel(targetPages)` ("na 1 stronie" / "na 2 stronach"). The
CTA label is consistent across tiers; the **status line** carries the honesty so
`clean` never reads like `impossible`. The 2→1 flagship case triggers
automatically (`targetPages` of a 2-page CV = 1).

Cost: ≈10 offline packs per panel-open (memoized, not per render) — acceptable.

**`LongCvModal` — rewritten** into a single-decision modal with two variants
(the old 4-step spacing dance is dead — the panel + engine handle `clean`/`tight`
silently):

*Emergency* (floor fits, but cramped):
- Title: **"Zmieścimy na 1 stronie"**
- Body: *"Żeby zmieścić CV na 1 stronie, możemy mocno zmniejszyć odstępy albo
  skrócić treść. Skrócenie treści wygląda lepiej."*
- Actions: `Nie teraz` (ghost) · `Maksymalnie zacieśnij` (ghost → `onForceTighten`)
  · **`Skróć treść z AI`** (primary; "Skróć z AI (Pro)" for free users)

*Impossible* (spacing alone can't):
- Title: **"Trzeba skrócić treść"**
- Body: *"Samo zmniejszenie odstępów nie zmieści CV na 1 stronie — jest za dużo
  treści. Możemy wskazać fragmenty do skrócenia, bez zmiany faktów."*
- Actions: `Nie teraz` (ghost) · **`Skróć treść z AI`** (primary). No
  "Maksymalnie zacieśnij".

"Skróć z AI" closes the modal and opens the assistant via the existing
`requestAssistantAction('shorten')`; post-AI relax + the existing success toast
close the loop. No result screens needed.

Target label in titles/bodies is templated from `targetPages`, not hardcoded to
"1", so single-column "N → N-1" also reads correctly.

## Data flow

```
too long detected ─▶ tooLong flag ─▶ badge + one-time toast
user opens Układ CV ─▶ probeFit() (memoized) ─▶ tier-driven hint + CTA
click "Zmieść na M"
   ├ clean/tight ─▶ commitFit ─▶ toast ─▶ (done)
   ├ emergency   ─▶ modal ─┬ Maksymalnie zacieśnij ─▶ commitFit(floor) ─▶ toast
   │                        └ Skróć z AI ─▶ assistant(shorten) ─┐
   └ impossible  ─▶ modal ── Skróć z AI ─▶ assistant(shorten) ─┤
                                                                ▼
                                          AI drops a page ─▶ post-AI relax
                                          (findFitForTarget loosest→COMPACT) ─▶ commitFit ─▶ success toast
```

## Error handling / edge cases

- **Nothing reducible** (`pageCount ≤ targetPages`): no badge, no hint, panel
  shows only `pageStatus`. `onFitToPages` is never offered.
- **Elements empty / single page**: `findFitForTarget` returns the loosest
  candidate (baseline) as `clean`; guarded so the flagship button never appears.
- **`collapseSpilledMainIntoSidebar` returns the same array** (nothing to
  collapse): still valid input to `contentMaxPage`; no special-casing.
- **Free-plan user hits an AI action**: unchanged — routes to the plan upsell via
  the existing `canUseAiAssistant` / `handleShowPlanModal` gate.
- **Undo** after any commit restores the prior spacing + elements in one step
  (single history entry, as today).

## Testing

Frontend `node --test`, colocated `*.test.js`, injected `packFn` for determinism.

- **`fitToPages.test.js`** — loosest-that-fits guarantee (both `4/5/14/5` and the
  floor fit `target=1` → picks `4/5/14/5`, not the floor); `impossible` when even
  floor exceeds target; every tier boundary via an injected spacing→pageCount
  `packFn`; relax picks baseline when baseline fits; `buildSpacingLadder`
  monotonicity + exact endpoints.
- **`resolveFitAction`** — each tier → correct action (pure, no renderer needed).
- **`flowSpacing.test.js`** (extend) — `MIN_FLOW_SPACING` shape; tighter than
  `DENSITY_SPACING_MIN` on record/section/after_rule; `scaleFlowSpacing` still
  clamps to `DENSITY_SPACING_MIN` (cannot reach the new floor).
- **`LongCvModal` test** (new) — emergency variant renders "Maksymalnie
  zacieśnij"; impossible variant does not; both render the AI CTA with Pro-gating
  copy for free users.
- **Flagship regression** — a fixture 2-page CV that fits at a reasonable spacing
  classifies `clean`/`tight` and commits a spacing strictly looser than the floor.

## Out of scope

- Backend generators / AI endpoints (unchanged).
- `layoutDensity.js` / `proposeAutoFitSpacing` (untouched).
- The density preset controls (Kompaktowa/Standardowa/Przestronna) — the floor is
  never exposed there.
- Live preview before commit (rejected in favor of apply + undo).
