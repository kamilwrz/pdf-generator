# Progressive Page-Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find the loosest spacing that fits a CV on its target page count (descending only as far as a hidden hard floor), escalate to AI only when spacing alone would look cramped, and after AI shortening relax spacing back toward baseline to reclaim whitespace.

**Architecture:** A new pure engine `fitToPages.js` owns the "loosest-that-fits" search, tier classification, and the routing decision. `PdfCanvas` wires it as inline callbacks (where all the required editor state already lives), repurposes the existing too-long detection into a gentle badge + one-time toast, adds post-AI auto-relax, and drives a rewritten two-variant `LongCvModal`. `SectionsPanel` renders a tier-honest page-fit hint. `layoutDensity.js` is untouched.

**Tech Stack:** React 19 (function components, `use(Context)`), Node's built-in test runner (`node --test`), no jsdom/testing-library.

**Spec:** `docs/superpowers/specs/2026-08-22-progressive-page-fit-design.md` — the plan argues from this spec; executors read both.

> **Deviation from spec, deliberate:** the spec names a `useFitToPages` hook. Because the orchestration needs ~10 pieces of `PdfCanvas` state already co-located there (`A4_Elements`, `baselineFlowSpacing`, `setFlowSpacing`, `setA4_Elements`, `pageCount`, `isSidebarTemplate`, `requestAssistantAction`, `pushToast`, the modal setters), and the existing too-long logic is already inline in `PdfCanvas`, we implement the executor as inline `PdfCanvas` callbacks and keep only the pure, unit-tested `resolveFitAction` + engine in `fitToPages.js`. This honors the spec's real requirement — the routing *decision* is pure and tested — without a 15-dependency hook. Everything else follows the spec exactly.

## Global Constraints

- **Frontend only.** No backend, no AI-endpoint, no generator changes.
- **`layoutDensity.js` untouched.** Its `proposeAutoFitSpacing` keeps its distinct balance/density objective.
- **Hidden hard floor:** `MIN_FLOW_SPACING = { stack: 2, record: 2, section: 10, after_rule: 2 }` — copied verbatim. Never a visible density preset; exposed only as the emergency "Maksymalnie zacieśnij".
- **Loosest-that-fits, never tightest.** The engine returns the first (loosest) candidate meeting the target.
- **Tier vocabulary (exact strings):** `"clean"`, `"tight"`, `"emergency"`, `"impossible"`.
- **Commit = one undoable history entry:** `setFlowSpacing` + `setA4_Elements(reconcileDocumentPages(...).elements)`, matching every other layout mutation.
- **Component tests are source-assertion** (`readFile` + `assert.match` on the `.jsx`), matching `SectionsPanel.test.js` / `ChangeTemplateModal.test.js`. Pure utils get real behavioral tests.
- **Polish copy is normative** — use the exact strings in each task.
- **Test run (single file):** from `frontend/`, `node --test src/<path>.test.js`. **Full suite:** from `frontend/`, `node ./scripts/run-tests.mjs`.
- **Commit trailer:** every commit message ends with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File Structure

- **Modify** `frontend/src/utils/flowSpacing.js` — add `MIN_FLOW_SPACING`.
- **Modify** `frontend/src/utils/flowSpacing.test.js` — floor invariants.
- **Create** `frontend/src/utils/fitToPages.js` — engine (`buildSpacingLadder`, `classifyFitTier`, `applyFitPack`, `findFitForTarget`, `resolveFitAction`, `formatFitTargetLabel`).
- **Create** `frontend/src/utils/fitToPages.test.js` — engine behavioral tests.
- **Modify** `frontend/src/components/editor/LongCvModal/LongCvModal.jsx` — rewrite to two variants.
- **Create** `frontend/src/components/editor/LongCvModal/LongCvModal.test.js` — source-assertion tests.
- **Modify** `frontend/src/components/common/SidebarControls/SidebarControls.jsx` — optional `badge` dot.
- **Modify** `frontend/src/components/editor/Sidebar/Sidebar.jsx` — badge on the "Układ CV" tile.
- **Modify** `frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx` — tier-honest fit hint + CTA.
- **Modify** `frontend/src/components/editor/SectionsPanel/SectionsPanel.test.js` — hint assertions.
- **Modify** `frontend/src/pages/PdfCanvas.jsx` — inline orchestration, repurposed detection, post-AI relax, modal props, context additions.

---

## Task 1: Hard-floor constant + invariants (`flowSpacing.js`)

**Files:**
- Modify: `frontend/src/utils/flowSpacing.js` (add export after `DENSITY_SPACING_MIN`, ~line 100)
- Test: `frontend/src/utils/flowSpacing.test.js`

**Interfaces:**
- Consumes: existing `DENSITY_SPACING_MIN`, `scaleFlowSpacing`, `COMPACT_FLOW_SPACING`.
- Produces: `MIN_FLOW_SPACING` — a frozen `{ stack, record, section, after_rule }`, tighter than `DENSITY_SPACING_MIN`.

- [ ] **Step 1: Write the failing test** — append to `flowSpacing.test.js`:

```js
import {
  COMPACT_FLOW_SPACING,
  DENSITY_SPACING_MIN,
  MIN_FLOW_SPACING,
} from "./flowSpacing.js";

describe("MIN_FLOW_SPACING hard floor", () => {
  it("is the tightest legible rhythm the fit engine may reach", () => {
    assert.deepEqual(MIN_FLOW_SPACING, {
      stack: 2, record: 2, section: 10, after_rule: 2,
    });
  });

  it("is tighter than the density minimum on record/section/after_rule", () => {
    assert.ok(MIN_FLOW_SPACING.record < DENSITY_SPACING_MIN.record);
    assert.ok(MIN_FLOW_SPACING.section < DENSITY_SPACING_MIN.section);
    assert.ok(MIN_FLOW_SPACING.after_rule < DENSITY_SPACING_MIN.after_rule);
  });

  it("is below the compact preset on every knob (engine descends past compact)", () => {
    for (const key of ["stack", "record", "section", "after_rule"]) {
      assert.ok(MIN_FLOW_SPACING[key] <= COMPACT_FLOW_SPACING[key]);
    }
  });

  it("scaleFlowSpacing cannot reach the floor (it clamps to DENSITY_SPACING_MIN)", () => {
    // A huge shrink still bottoms out at the density minimum, never the floor.
    const scaled = scaleFlowSpacing({ stack: 4, record: 10, section: 21, after_rule: 8 }, 0.01);
    assert.deepEqual(scaled, DENSITY_SPACING_MIN);
    assert.notDeepEqual(scaled, MIN_FLOW_SPACING);
  });
});
```

Note: `scaleFlowSpacing` and `describe`/`it`/`assert` are already imported at the top of the file — add only `COMPACT_FLOW_SPACING`, `DENSITY_SPACING_MIN`, `MIN_FLOW_SPACING` to the existing import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/flowSpacing.test.js`
Expected: FAIL — `MIN_FLOW_SPACING` is `undefined` (import resolves to undefined; `deepEqual` throws).

- [ ] **Step 3: Write minimal implementation** — in `flowSpacing.js`, immediately after the `DENSITY_SPACING_MIN` export:

```js
/**
 * Absolute hard floor for the progressive page-fit engine (fitToPages.js).
 * Tighter than DENSITY_SPACING_MIN — this is the lowest legible rhythm we will
 * ever apply, and only to save a page. `scaleFlowSpacing` clamps to
 * DENSITY_SPACING_MIN and can never reach this; the fit engine builds its own
 * candidate ladder to descend here. Never surfaced as a density preset.
 */
export const MIN_FLOW_SPACING = Object.freeze({
  stack: 2,
  record: 2,
  section: 10,
  after_rule: 2,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/flowSpacing.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/flowSpacing.js frontend/src/utils/flowSpacing.test.js
git commit -m "$(cat <<'EOF'
feat(fit): add MIN_FLOW_SPACING hard floor for progressive page-fit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `buildSpacingLadder` (`fitToPages.js`)

**Files:**
- Create: `frontend/src/utils/fitToPages.js`
- Test: `frontend/src/utils/fitToPages.test.js`

**Interfaces:**
- Consumes: `normalizeFlowSpacing` from `./flowSpacing.js`.
- Produces: `buildSpacingLadder(loosest, tightest, steps = 10) → object[]` — `steps + 1` normalized spacings, index 0 exactly `normalizeFlowSpacing(loosest)`, last exactly `normalizeFlowSpacing(tightest)`, every knob non-increasing from index 0 to last.

- [ ] **Step 1: Write the failing test** — create `fitToPages.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSpacingLadder } from "./fitToPages.js";

const BASELINE = { stack: 4, record: 10, section: 21, after_rule: 8 };
const FLOOR = { stack: 2, record: 2, section: 10, after_rule: 2 };

describe("buildSpacingLadder", () => {
  it("returns steps + 1 candidates with exact endpoints", () => {
    const ladder = buildSpacingLadder(BASELINE, FLOOR, 10);
    assert.equal(ladder.length, 11);
    assert.deepEqual(ladder[0], BASELINE);
    assert.deepEqual(ladder[ladder.length - 1], FLOOR);
  });

  it("is monotone non-increasing on every knob from loosest to tightest", () => {
    const ladder = buildSpacingLadder(BASELINE, FLOOR, 10);
    for (let i = 1; i < ladder.length; i += 1) {
      for (const key of ["stack", "record", "section", "after_rule"]) {
        assert.ok(
          ladder[i][key] <= ladder[i - 1][key],
          `${key} rose at step ${i}: ${ladder[i - 1][key]} -> ${ladder[i][key]}`,
        );
      }
    }
  });

  it("collapses to a single candidate when endpoints are equal", () => {
    const ladder = buildSpacingLadder(FLOOR, FLOOR, 10);
    assert.ok(ladder.length >= 1);
    assert.deepEqual(ladder[0], FLOOR);
    assert.deepEqual(ladder[ladder.length - 1], FLOOR);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: FAIL — module `./fitToPages.js` does not exist / `buildSpacingLadder` not exported.

- [ ] **Step 3: Write minimal implementation** — create `fitToPages.js`:

```js
/**
 * Progressive page-fit engine (pure — no React state).
 *
 * Finds the LOOSEST spacing rhythm that fits a CV on a target page count,
 * descending only as far as necessary toward MIN_FLOW_SPACING. Never returns
 * the tightest fit. After AI shortening, the same search (with COMPACT as the
 * tight end) relaxes spacing back toward baseline to reclaim whitespace.
 *
 * layoutDensity.js's proposeAutoFitSpacing has a different objective
 * (balance/fill density around baseline); this module keeps the page-count
 * target objective separate so the two never tangle in one scorer.
 */
import { normalizeFlowSpacing } from "./flowSpacing.js";

const KNOBS = ["stack", "record", "section", "after_rule"];

/**
 * A monotone ladder of `steps + 1` candidate rhythms interpolating per-knob
 * from `loosest` (index 0) to `tightest` (last). Endpoints are exact.
 *
 * @param {object} loosest
 * @param {object} tightest
 * @param {number} [steps=10]
 * @returns {object[]}
 */
export function buildSpacingLadder(loosest, tightest, steps = 10) {
  const from = normalizeFlowSpacing(loosest);
  const to = normalizeFlowSpacing(tightest);
  const count = Math.max(1, Math.trunc(steps));
  const ladder = [];
  for (let i = 0; i <= count; i += 1) {
    if (i === 0) { ladder.push(from); continue; }
    if (i === count) { ladder.push(to); continue; }
    const t = i / count;
    const candidate = {};
    for (const key of KNOBS) {
      candidate[key] = Math.round(from[key] + (to[key] - from[key]) * t);
    }
    ladder.push(normalizeFlowSpacing(candidate));
  }
  return ladder;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/fitToPages.js frontend/src/utils/fitToPages.test.js
git commit -m "$(cat <<'EOF'
feat(fit): buildSpacingLadder for progressive page-fit search

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `classifyFitTier` (`fitToPages.js`)

**Files:**
- Modify: `frontend/src/utils/fitToPages.js`
- Test: `frontend/src/utils/fitToPages.test.js`

**Interfaces:**
- Consumes: `COMPACT_FLOW_SPACING`, `MIN_FLOW_SPACING` from `./flowSpacing.js`; `normalizeFlowSpacing`.
- Produces: `classifyFitTier(spacing, { compact = COMPACT_FLOW_SPACING, floor = MIN_FLOW_SPACING } = {}) → "clean" | "tight" | "emergency"`. (`"impossible"` is assigned by `findFitForTarget`, not here.) `clean` = every knob ≥ compact; `emergency` = every knob ≤ floor + 1; else `tight`.

- [ ] **Step 1: Write the failing test** — append to `fitToPages.test.js`:

```js
import { classifyFitTier } from "./fitToPages.js";
import {
  COMPACT_FLOW_SPACING,
  MIN_FLOW_SPACING,
} from "./flowSpacing.js";

describe("classifyFitTier", () => {
  it("classifies baseline / compact-or-looser as clean", () => {
    assert.equal(classifyFitTier({ stack: 4, record: 10, section: 21, after_rule: 8 }), "clean");
    assert.equal(classifyFitTier(COMPACT_FLOW_SPACING), "clean");
  });

  it("classifies the hard floor as emergency", () => {
    assert.equal(classifyFitTier(MIN_FLOW_SPACING), "emergency");
  });

  it("classifies a candidate within 1px of the floor as emergency", () => {
    assert.equal(classifyFitTier({ stack: 3, record: 3, section: 11, after_rule: 3 }), "emergency");
  });

  it("classifies between compact and floor as tight", () => {
    // record 5 < compact.record(7) but well above floor+1(3) → tight.
    assert.equal(classifyFitTier({ stack: 3, record: 5, section: 13, after_rule: 5 }), "tight");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: FAIL — `classifyFitTier` not exported.

- [ ] **Step 3: Write minimal implementation** — add to `fitToPages.js`. Extend the top import to include the presets:

```js
import {
  COMPACT_FLOW_SPACING,
  MIN_FLOW_SPACING,
  normalizeFlowSpacing,
} from "./flowSpacing.js";
```

Then add:

```js
/** Per-knob tolerance so a candidate that rounds onto the floor reads as floor. */
const FLOOR_EPSILON = 1;

/**
 * Where a fitting rhythm sits between the compact preset and the hard floor.
 * `"impossible"` is never returned here — findFitForTarget assigns it when
 * nothing on the ladder fits.
 *
 * @param {object} spacing
 * @param {{ compact?: object, floor?: object }} [refs]
 * @returns {"clean"|"tight"|"emergency"}
 */
export function classifyFitTier(
  spacing,
  { compact = COMPACT_FLOW_SPACING, floor = MIN_FLOW_SPACING } = {},
) {
  const s = normalizeFlowSpacing(spacing);
  const c = normalizeFlowSpacing(compact);
  const f = normalizeFlowSpacing(floor);
  if (KNOBS.every((key) => s[key] >= c[key])) return "clean";
  if (KNOBS.every((key) => s[key] <= f[key] + FLOOR_EPSILON)) return "emergency";
  return "tight";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/fitToPages.js frontend/src/utils/fitToPages.test.js
git commit -m "$(cat <<'EOF'
feat(fit): classifyFitTier (clean/tight/emergency) for page-fit routing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `applyFitPack` + `findFitForTarget` (`fitToPages.js`)

**Files:**
- Modify: `frontend/src/utils/fitToPages.js`
- Test: `frontend/src/utils/fitToPages.test.js`

**Interfaces:**
- Consumes: `buildSpacingLadder`, `classifyFitTier` (this module); `applyFlowSpacing` from `./sectionStructure.js`; `collapseSpilledMainIntoSidebar` from `./collapseMainIntoSidebar.js`; `contentMaxPage` from `./structureOperation.js`.
- Produces:
  - `applyFitPack(elements, spacing, pageHeight) → object[]` — `applyFlowSpacing` then `collapseSpilledMainIntoSidebar` (no reconcile).
  - `findFitForTarget({ elements, loosest, tightest, targetPages, pageHeight = 842, packFn = applyFitPack }) → { fits: boolean, spacing: object, pageCount: number, elements: object[], tier: "clean"|"tight"|"emergency"|"impossible" }`. Returns the FIRST (loosest) ladder candidate whose packed `contentMaxPage <= targetPages`; if none, `fits:false`, `spacing = tightest`, `tier:"impossible"`.

- [ ] **Step 1: Write the failing test** — append to `fitToPages.test.js`. These use an injected `packFn` mapping spacing→pageCount deterministically, so no real layout fixture is needed:

```js
import { findFitForTarget } from "./fitToPages.js";

// Fake pack: page count = 1 once `section` drops to/below `threshold`, else 2.
// Tags each returned array so we can assert WHICH candidate won.
function fakePackFn(threshold) {
  return (elements, spacing) => {
    const pages = spacing.section <= threshold ? 1 : 2;
    const tagged = [{ element_id: "probe", page: pages, top: 0, height: 10 }];
    tagged._spacing = spacing;
    return tagged;
  };
}

describe("findFitForTarget", () => {
  it("returns the LOOSEST candidate that fits, never the tightest", () => {
    // With threshold 16, the first ladder rung whose section<=16 wins — that is
    // well above the floor (section 10), proving we do not over-tighten.
    const r = findFitForTarget({
      elements: [],
      loosest: BASELINE,           // section 21
      tightest: FLOOR,             // section 10
      targetPages: 1,
      packFn: fakePackFn(16),
    });
    assert.equal(r.fits, true);
    assert.equal(r.pageCount, 1);
    assert.ok(r.spacing.section <= 16, "winner must actually fit");
    assert.ok(r.spacing.section > FLOOR.section, "winner must be looser than the floor");
    assert.ok(["clean", "tight"].includes(r.tier));
  });

  it("classifies a floor-only fit as emergency", () => {
    // Only section<=10 (the floor) fits.
    const r = findFitForTarget({
      elements: [], loosest: BASELINE, tightest: FLOOR, targetPages: 1,
      packFn: fakePackFn(10),
    });
    assert.equal(r.fits, true);
    assert.equal(r.tier, "emergency");
    assert.deepEqual(r.spacing, FLOOR);
  });

  it("returns impossible when even the floor exceeds the target", () => {
    const r = findFitForTarget({
      elements: [], loosest: BASELINE, tightest: FLOOR, targetPages: 1,
      packFn: fakePackFn(5), // nothing on the ladder reaches section<=5
    });
    assert.equal(r.fits, false);
    assert.equal(r.tier, "impossible");
    assert.deepEqual(r.spacing, FLOOR);
    assert.equal(r.pageCount, 2);
  });

  it("relax direction: picks baseline when baseline already fits the achieved target", () => {
    const r = findFitForTarget({
      elements: [], loosest: BASELINE, tightest: COMPACT_FLOW_SPACING, targetPages: 1,
      packFn: fakePackFn(25), // section 21 (baseline) already <= 25
    });
    assert.equal(r.fits, true);
    assert.deepEqual(r.spacing, BASELINE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: FAIL — `findFitForTarget` not exported.

- [ ] **Step 3: Write minimal implementation** — add to `fitToPages.js`. Add imports at top:

```js
import { applyFlowSpacing } from "./sectionStructure.js";
import { collapseSpilledMainIntoSidebar } from "./collapseMainIntoSidebar.js";
import { contentMaxPage } from "./structureOperation.js";
```

Then:

```js
/**
 * Offline pack used in both trials and (pre-reconcile) commit: repack at the
 * candidate rhythm, then rail any main-column overflow into the sidebar. Pure —
 * does NOT reconcile fixed page chrome (that needs an id factory); the caller
 * reconciles at commit time. Page count is read via contentMaxPage on the
 * returned list.
 *
 * @param {object[]} elements
 * @param {object} spacing
 * @param {number} pageHeight
 * @returns {object[]}
 */
export function applyFitPack(elements, spacing, pageHeight) {
  const packed = applyFlowSpacing(elements, spacing, pageHeight);
  return collapseSpilledMainIntoSidebar(packed, { spacing, pageHeight });
}

/**
 * Loosest rhythm on the [loosest…tightest] ladder that packs the document to
 * `targetPages` or fewer. Returns the FIRST (loosest) fit — never the tightest.
 * When nothing fits, returns the tightest candidate with tier "impossible".
 *
 * @param {{
 *   elements: object[],
 *   loosest: object,
 *   tightest: object,
 *   targetPages: number,
 *   pageHeight?: number,
 *   packFn?: (elements: object[], spacing: object, pageHeight: number) => object[],
 * }} args
 * @returns {{ fits: boolean, spacing: object, pageCount: number, elements: object[], tier: string }}
 */
export function findFitForTarget({
  elements,
  loosest,
  tightest,
  targetPages,
  pageHeight = 842,
  packFn = applyFitPack,
}) {
  const list = Array.isArray(elements) ? elements : [];
  const target = Math.max(1, Math.trunc(Number(targetPages) || 1));
  const ladder = buildSpacingLadder(loosest, tightest);

  for (const candidate of ladder) {
    const packed = packFn(list, candidate, pageHeight) || list;
    const pageCount = contentMaxPage(packed);
    if (pageCount <= target) {
      return {
        fits: true,
        spacing: candidate,
        pageCount,
        elements: packed,
        tier: classifyFitTier(candidate),
      };
    }
  }

  const tightestSpacing = ladder[ladder.length - 1];
  const packed = packFn(list, tightestSpacing, pageHeight) || list;
  return {
    fits: false,
    spacing: tightestSpacing,
    pageCount: contentMaxPage(packed),
    elements: packed,
    tier: "impossible",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/fitToPages.js frontend/src/utils/fitToPages.test.js
git commit -m "$(cat <<'EOF'
feat(fit): findFitForTarget — loosest spacing that fits the target page count

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `resolveFitAction` + `formatFitTargetLabel` (`fitToPages.js`)

**Files:**
- Modify: `frontend/src/utils/fitToPages.js`
- Test: `frontend/src/utils/fitToPages.test.js`

**Interfaces:**
- Produces:
  - `resolveFitAction(result) → { action: "commit" | "emergency" | "impossible" }` — `clean`/`tight` → `commit`; `emergency` → `emergency`; `impossible` → `impossible`.
  - `formatFitTargetLabel(targetPages) → string` — Polish locative noun phrase WITHOUT "na": `1 → "1 stronie"`, `2 → "2 stronach"`, `5 → "5 stronach"` (callers write ``na ${label}``).

- [ ] **Step 1: Write the failing test** — append to `fitToPages.test.js`:

```js
import { resolveFitAction, formatFitTargetLabel } from "./fitToPages.js";

describe("resolveFitAction", () => {
  it("commits clean and tight fits", () => {
    assert.deepEqual(resolveFitAction({ tier: "clean" }), { action: "commit" });
    assert.deepEqual(resolveFitAction({ tier: "tight" }), { action: "commit" });
  });
  it("opens the emergency modal for a floor-only fit", () => {
    assert.deepEqual(resolveFitAction({ tier: "emergency" }), { action: "emergency" });
  });
  it("routes impossible straight to the AI modal", () => {
    assert.deepEqual(resolveFitAction({ tier: "impossible" }), { action: "impossible" });
  });
});

describe("formatFitTargetLabel", () => {
  it("uses the Polish locative noun form", () => {
    assert.equal(formatFitTargetLabel(1), "1 stronie");
    assert.equal(formatFitTargetLabel(2), "2 stronach");
    assert.equal(formatFitTargetLabel(5), "5 stronach");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: FAIL — exports missing.

- [ ] **Step 3: Write minimal implementation** — add to `fitToPages.js`:

```js
/**
 * Map an engine result to a UI action. Pure — keeps the routing decision out
 * of the effectful orchestrator so it can be unit-tested.
 *
 * @param {{ tier: string }} result
 * @returns {{ action: "commit"|"emergency"|"impossible" }}
 */
export function resolveFitAction(result) {
  const tier = result?.tier;
  if (tier === "clean" || tier === "tight") return { action: "commit" };
  if (tier === "emergency") return { action: "emergency" };
  return { action: "impossible" };
}

/**
 * Polish locative page label ("1 stronie" / "N stronach"), without the leading
 * "na". Callers write `na ${formatFitTargetLabel(n)}`.
 *
 * @param {number} targetPages
 * @returns {string}
 */
export function formatFitTargetLabel(targetPages) {
  const n = Math.max(1, Math.trunc(Number(targetPages) || 1));
  return n === 1 ? "1 stronie" : `${n} stronach`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/fitToPages.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/fitToPages.js frontend/src/utils/fitToPages.test.js
git commit -m "$(cat <<'EOF'
feat(fit): resolveFitAction + formatFitTargetLabel for page-fit routing/copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `LongCvModal` into two variants

**Files:**
- Modify: `frontend/src/components/editor/LongCvModal/LongCvModal.jsx` (full rewrite of the component body)
- Create: `frontend/src/components/editor/LongCvModal/LongCvModal.test.js`

**Interfaces:**
- Consumes: `formatFitTargetLabel` from `../../../utils/fitToPages.js`; `DialogShell`; `classes`.
- Produces: `LongCvModal({ open, variant, targetPages, canUseAi, onForceTighten, onRequestAiShorten, onClose })` where `variant` is `"emergency" | "impossible"`. Emergency renders three actions incl. **Maksymalnie zacieśnij** (→ `onForceTighten`); impossible omits it. Both render an AI CTA whose label is `canUseAi ? "Skróć treść z AI" : "Skróć z AI (Pro)"` (→ `onRequestAiShorten`).

- [ ] **Step 1: Write the failing test** — create `LongCvModal.test.js` (source-assertion, matching the repo pattern):

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalUrl = new URL("./LongCvModal.jsx", import.meta.url);

test("modal is a two-variant page-fit decision (emergency | impossible)", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /variant/);
  assert.match(source, /"emergency"/);
  assert.match(source, /"impossible"/);
  // The old multi-step spacing dance is gone.
  assert.doesNotMatch(source, /intro-spacing|result-success|result-still|onApplyCompact/);
});

test("emergency variant offers Maksymalnie zacieśnij; impossible does not", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /Maksymalnie zacieśnij/);
  assert.match(source, /onForceTighten/);
  // Guarded so it only renders in the emergency branch.
  assert.match(source, /variant === "emergency"/);
});

test("both variants route to AI shortening with Pro-gated copy", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /onRequestAiShorten/);
  assert.match(source, /Skróć treść z AI/);
  assert.match(source, /Skróć z AI \(Pro\)/);
  assert.match(source, /canUseAi/);
});

test("copy leads with the honest titles and uses the target label helper", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /Zmieścimy na/);          // emergency title
  assert.match(source, /Trzeba skrócić treść/);  // impossible title
  assert.match(source, /formatFitTargetLabel/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/components/editor/LongCvModal/LongCvModal.test.js`
Expected: FAIL — old source has `intro-spacing`/`onApplyCompact`, no `variant`.

- [ ] **Step 3: Write minimal implementation** — replace the entire `LongCvModal.jsx` file with:

```jsx
/**
 * Page-fit decision modal. Reached only when spacing alone cannot cleanly fit
 * the CV on its target page count — the SectionsPanel + fit engine handle the
 * clean/tight cases silently. Two variants:
 *
 *   emergency  — the hard floor DOES fit, but the result is cramped. Offer AI
 *                shortening (recommended) or "Maksymalnie zacieśnij" (apply the
 *                floor anyway).
 *   impossible — spacing alone cannot reach the target. AI shortening only.
 *
 * Pure presenter over DialogShell; the parent (PdfCanvas) owns the document and
 * the fit result. "Skróć z AI" closes the modal and opens the assistant via
 * the parent's onRequestAiShorten.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import { formatFitTargetLabel } from "../../../utils/fitToPages.js";
import classes from "./LongCvModal.module.css";

/**
 * @param {{
 *   open: boolean,
 *   variant: "emergency"|"impossible",
 *   targetPages: number,
 *   canUseAi: boolean,
 *   onForceTighten: () => void,   // emergency only: apply the hard-floor fit
 *   onRequestAiShorten: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function LongCvModal({
  open,
  variant,
  targetPages,
  canUseAi,
  onForceTighten,
  onRequestAiShorten,
  onClose,
}) {
  if (!open || !variant) return null;

  const targetLabel = formatFitTargetLabel(targetPages ?? 1);
  const aiLabel = canUseAi ? "Skróć treść z AI" : "Skróć z AI (Pro)";

  let title;
  let body;
  if (variant === "emergency") {
    title = `Zmieścimy na ${targetLabel}`;
    body = (
      <p className={classes.lead}>
        Żeby zmieścić CV na {targetLabel}, możemy mocno zmniejszyć odstępy albo
        skrócić treść. Skrócenie treści wygląda lepiej.
      </p>
    );
  } else {
    title = "Trzeba skrócić treść";
    body = (
      <p className={classes.lead}>
        Samo zmniejszenie odstępów nie zmieści CV na {targetLabel} — jest za dużo
        treści. Możemy wskazać fragmenty do skrócenia, bez zmiany faktów.
      </p>
    );
  }

  const actions = (
    <>
      <button type="button" className={classes.ghost} onClick={onClose}>
        Nie teraz
      </button>
      {variant === "emergency" ? (
        <button type="button" className={classes.ghost} onClick={onForceTighten}>
          Maksymalnie zacieśnij
        </button>
      ) : null}
      <button type="button" className={classes.primary} onClick={onRequestAiShorten}>
        {aiLabel}
      </button>
    </>
  );

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      width={520}
      radius={2}
      title={title}
      footer={<div className={classes.actions}>{actions}</div>}
    >
      <div className={classes.body}>{body}</div>
    </DialogShell>
  );
}
```

Note: `LongCvModal.module.css` already defines `.lead`, `.ghost`, `.primary`, `.actions`, `.body` — no CSS change needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/components/editor/LongCvModal/LongCvModal.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/LongCvModal/LongCvModal.jsx frontend/src/components/editor/LongCvModal/LongCvModal.test.js
git commit -m "$(cat <<'EOF'
feat(fit): rewrite LongCvModal into two-variant page-fit decision

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `SidebarControls` badge dot + Sidebar wiring

**Files:**
- Modify: `frontend/src/components/common/SidebarControls/SidebarControls.jsx`
- Modify: `frontend/src/components/common/SidebarControls/SidebarControls.module.css` (add `.badge`)
- Modify: `frontend/src/components/editor/Sidebar/Sidebar.jsx`
- Test: reuse `frontend/src/components/editor/SectionsPanel/SectionsPanel.test.js` already reads `Sidebar.jsx` — add a Sidebar assertion there in Task 9. This task has no standalone test; it is verified by Task 9's Sidebar assertion and the full suite. (Right-sized: a lone dot prop is not worth its own reviewer gate; it is exercised by Task 9.)

**Interfaces:**
- Consumes: nothing new.
- Produces: `SidebarControls` accepts an optional `badge` boolean; when true, renders a `<span className={classes.badge}>` dot inside the tile. Sidebar passes `badge={fitTooLong}` on the "Układ CV" tile, reading `fitTooLong` from `PdfContext`.

- [ ] **Step 1: Add the `badge` prop** — replace `SidebarControls.jsx` body:

```jsx
/**
 * Icon tile button for the left Sidebar tool rail. `badge` renders a small
 * attention dot (used by "Układ CV" when the CV can be fit onto fewer pages).
 */
import classes from "./SidebarControls.module.css";

export default function SidebarControls({ icon, labelText, sidebarEvent, documents, badge = false }) {
    return (
        <button
            type="button"
            className={classes.tile}
            onClick={sidebarEvent}
            aria-label={labelText}
            title={documents != null && documents !== false ? `${labelText}: ${documents}` : labelText}
        >
            <span className={classes.iconBox}>{icon}</span>
            {badge ? <span className={classes.badge} aria-hidden="true" /> : null}
        </button>
    );
}
```

- [ ] **Step 2: Add the `.badge` style** — append to `SidebarControls.module.css`. The tile is a positioned button; if it is not already `position: relative`, add that to `.tile`. Then:

```css
.tile {
    position: relative;
}

.badge {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent, #B8954A);
    box-shadow: 0 0 0 2px var(--surface, #fff);
}
```

(If `.tile` already declares `position: relative`, keep the single declaration — do not duplicate the selector; merge into the existing rule.)

- [ ] **Step 3: Wire the badge in `Sidebar.jsx`** — add `fitTooLong` to the destructured `use(PdfContext)` block (alongside `showSections`), then pass it on the "Układ CV" tile:

```jsx
        showSections,
        fitTooLong,
```

```jsx
                        <SidebarControls
                            icon={<LuListTree />}
                            labelText="Układ CV"
                            sidebarEvent={showSections}
                            badge={fitTooLong}
                        />
```

- [ ] **Step 4: Verify nothing else broke** — run the full frontend suite (the pre-existing 4 `sectionRecord.test.js` failures are unrelated and expected):

Run: `cd frontend && node ./scripts/run-tests.mjs 2>&1 | grep -E "^# (fail|pass|tests)|✖" | head`
Expected: no NEW failures beyond the known 4 `sectionRecord.test.js` cases.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/SidebarControls/SidebarControls.jsx frontend/src/components/common/SidebarControls/SidebarControls.module.css frontend/src/components/editor/Sidebar/Sidebar.jsx
git commit -m "$(cat <<'EOF'
feat(fit): attention badge on the Układ CV tile when a CV can be fit smaller

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `SectionsPanel` tier-honest fit hint + CTA

**Files:**
- Modify: `frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx`
- Modify: `frontend/src/components/editor/SectionsPanel/SectionsPanel.module.css` (add `.fitHint`, `.fitCta`)
- Modify: `frontend/src/components/editor/SectionsPanel/SectionsPanel.test.js`

**Interfaces:**
- Consumes from `PdfContext` (added in Task 9): `fitStatus` — `{ reducible: boolean, tier: string, targetLabel: string } | null` — and `onFitToPages: () => void`.
- Produces: below `pageStatus`, when `fitStatus?.reducible`, a status line + one CTA "Zmieść na {targetLabel}" calling `onFitToPages`. Status-line copy is tier-driven (`clean`/`tight` → "można zmieścić na …"; `emergency` → "zmieścisz na … po skróceniu treści"; `impossible` → "aby zmieścić na …, skróć treść").

- [ ] **Step 1: Write the failing test** — append to `SectionsPanel.test.js`:

```js
test("shows a tier-honest page-fit hint and a single CTA when reducible", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /fitStatus/);
  assert.match(source, /onFitToPages/);
  assert.match(source, /Zmieść na /);
  // Tier-driven status-line copy.
  assert.match(source, /można zmieścić na/);
  assert.match(source, /po skróceniu treści/);
  assert.match(source, /skróć treść/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/components/editor/SectionsPanel/SectionsPanel.test.js`
Expected: FAIL — none of `fitStatus` / `onFitToPages` / the copy exist yet.

- [ ] **Step 3: Implement the hint.**

3a. Add to the `use(PdfContext)` destructure (near `pushToast`, ~line 79):

```jsx
    fitStatus,
    onFitToPages,
```

3b. Add a pure helper above the component (after `displaySectionTitle`, ~line 66):

```jsx
/**
 * Tier-honest status line for the page-fit hint. The CTA label stays constant
 * ("Zmieść na …"); only this sentence changes so `clean` never reads like
 * `impossible`.
 * @param {"clean"|"tight"|"emergency"|"impossible"} tier
 * @param {string} targetLabel  e.g. "1 stronie"
 * @returns {string}
 */
function fitHintText(tier, targetLabel) {
  if (tier === "emergency") return `zmieścisz na ${targetLabel} po skróceniu treści`;
  if (tier === "impossible") return `aby zmieścić na ${targetLabel}, skróć treść`;
  return `można zmieścić na ${targetLabel}`;
}
```

3c. Render the hint directly under the existing `pageStatus` line (the `<p className={classes.pageStatus}>` around line 228). Replace that single `<p>` with:

```jsx
          <p className={classes.pageStatus} aria-live="polite">
            {pageStatus}
            {fitStatus?.reducible ? (
              <> · {fitHintText(fitStatus.tier, fitStatus.targetLabel)}</>
            ) : null}
          </p>
          {fitStatus?.reducible ? (
            <button
              type="button"
              className={classes.fitCta}
              onClick={onFitToPages}
            >
              Zmieść na {fitStatus.targetLabel}
            </button>
          ) : null}
```

3d. Add styles — append to `SectionsPanel.module.css`:

```css
.fitCta {
    margin-top: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--ink, #171717);
    border-radius: 0;
    background: var(--ink, #171717);
    color: var(--paper, #fff);
    font: 600 12px/1.2 var(--body, inherit);
    cursor: pointer;
}

.fitCta:hover {
    opacity: 0.92;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/components/editor/SectionsPanel/SectionsPanel.test.js`
Expected: PASS (new test + all existing SectionsPanel tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx frontend/src/components/editor/SectionsPanel/SectionsPanel.module.css frontend/src/components/editor/SectionsPanel/SectionsPanel.test.js
git commit -m "$(cat <<'EOF'
feat(fit): tier-honest page-fit hint + CTA in the Układ CV panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `PdfCanvas` orchestration — commit, detection, relax, context, modal props

**Files:**
- Modify: `frontend/src/pages/PdfCanvas.jsx`
- Test: `frontend/src/pages/PdfCanvas.test.js` (create — source-assertion; there is no existing PdfCanvas test)

**Interfaces:**
- Consumes: `findFitForTarget`, `resolveFitAction`, `formatFitTargetLabel` from `../utils/fitToPages`; `MIN_FLOW_SPACING`, `COMPACT_FLOW_SPACING`, `flowSpacingEquals` from `../utils/flowSpacing`; existing `reconcileDocumentPages`, `nanoid`, `diagnoseDocumentLength`, `isSidebarTemplate`, `A4_Elements`, `baselineFlowSpacing`, `setFlowSpacing`, `setA4_Elements`, `pageCount`, `pushToast`, `requestAssistantAction`, `handleRequestAiShorten`, `canUseAiAssistant`.
- Produces on `PdfContext` value (`ctxValue`): `fitTooLong: boolean`, `fitStatus: {reducible, tier, targetLabel}|null`, `onFitToPages: () => void`. Modal state shape becomes `{ open, variant, fit }`.

- [ ] **Step 1: Write the failing test** — create `frontend/src/pages/PdfCanvas.test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = new URL("./PdfCanvas.jsx", import.meta.url);

test("uses the page-fit engine instead of a single fixed compact pass", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /findFitForTarget/);
  assert.match(source, /resolveFitAction/);
  assert.match(source, /MIN_FLOW_SPACING/);
  // The old single-preset entry point is gone.
  assert.doesNotMatch(source, /applyCompactSpacingPass/);
});

test("shrink searches baseline->floor; post-AI relax searches baseline->COMPACT", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /tightest:\s*MIN_FLOW_SPACING/);
  assert.match(source, /tightest:\s*COMPACT_FLOW_SPACING/);
});

test("routes tiers via resolveFitAction to commit / emergency / impossible", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /"commit"/);
  assert.match(source, /variant:\s*"emergency"/);
  assert.match(source, /variant:\s*"impossible"/);
});

test("commit is a single undoable entry (setFlowSpacing + reconciled setA4_Elements)", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /const commitFit/);
  assert.match(source, /setFlowSpacing\(/);
  assert.match(source, /reconcileDocumentPages/);
});

test("detection now drives a badge flag, not an auto-opened modal", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /fitTooLong/);
  assert.match(source, /onFitToPages/);
  assert.match(source, /fitStatus/);
});

test("LongCvModal receives the two-variant props (no onApplyCompact)", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /variant={longCvModal\.variant}/);
  assert.match(source, /onForceTighten=/);
  assert.doesNotMatch(source, /onApplyCompact=/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/pages/PdfCanvas.test.js`
Expected: FAIL — `findFitForTarget` etc. absent; `applyCompactSpacingPass` still present.

- [ ] **Step 3: Implement the orchestration.**

3a. **Imports** — add to the existing import from `../utils/fitToPages` (create the import line) and extend the `flowSpacing` import:

```jsx
import {
  findFitForTarget,
  resolveFitAction,
  formatFitTargetLabel,
} from '../utils/fitToPages';
```

Ensure the `flowSpacing` import includes `MIN_FLOW_SPACING`, `COMPACT_FLOW_SPACING`, `flowSpacingEquals` (COMPACT is already imported; add the others).

3b. **Modal state shape** — change the `longCvModal` state initializer (~line 231) from `{ open: false, diagnosis: null }` to:

```jsx
  const [longCvModal, setLongCvModal] = useState({ open: false, variant: null, fit: null });
```

Update `closeLongCvModal` (~line 235) to reset the new shape:

```jsx
  const closeLongCvModal = useCallback(() => {
    longCvOpenRef.current = false;
    setLongCvModal({ open: false, variant: null, fit: null });
  }, []);
```

And the reset branch inside the detection effect (~line 913) likewise sets `{ open: false, variant: null, fit: null }`.

3c. **Replace `applyCompactSpacingPass`** (~lines 860–871) with `commitFit` + `onFitToPages`:

```jsx
  // Commit a fit result as ONE undoable entry: set the winning rhythm, reconcile
  // fixed page chrome, and (unless silent) toast. Matches every other layout
  // mutation's history footprint.
  const commitFit = useCallback((fit, { silent = false } = {}) => {
    if (!fit) return;
    setFlowSpacing(fit.spacing);
    setA4_Elements(
      reconcileDocumentPages(fit.elements, nanoid, { collapseEmpty: true }).elements,
    );
    if (!silent) {
      pushToast({ title: 'Układ dopasowany.', variant: 'success' });
    }
  }, [setFlowSpacing, setA4_Elements, pushToast]);

  // Target page count: sidebar rails only ever render on page 1, so exactly 1;
  // single-column shrinks one page at a time. Mirrors diagnoseDocumentLength.
  const fitTargetPages = useMemo(
    () => (isSidebarTemplate ? 1 : Math.max(1, (pageCount ?? 1) - 1)),
    [isSidebarTemplate, pageCount],
  );

  // Flagship action: find the loosest rhythm that fits the target, then route.
  const onFitToPages = useCallback(() => {
    const pageHeight = pageSize?.height ?? 842;
    const fit = findFitForTarget({
      elements: A4_Elements,
      loosest: baselineFlowSpacing,
      tightest: MIN_FLOW_SPACING,
      targetPages: fitTargetPages,
      pageHeight,
    });
    const { action } = resolveFitAction(fit);
    if (action === 'commit') {
      commitFit(fit);
    } else if (action === 'emergency') {
      longCvOpenRef.current = true;
      setLongCvModal({ open: true, variant: 'emergency', fit });
    } else {
      longCvOpenRef.current = true;
      setLongCvModal({ open: true, variant: 'impossible', fit: null });
    }
  }, [A4_Elements, baselineFlowSpacing, fitTargetPages, pageSize, commitFit]);

  // Emergency modal's "Maksymalnie zacieśnij": apply the hard-floor fit.
  const onForceTighten = useCallback(() => {
    const fit = longCvModal.fit;
    closeLongCvModal();
    commitFit(fit);
  }, [longCvModal.fit, closeLongCvModal, commitFit]);
```

3d. **`fitTooLong` + `fitStatus`.** `fitTooLong` is cheap (no packing); `fitStatus` runs the ~10-pack probe only while the panel is open. Add after `onFitToPages`:

```jsx
  const fitTooLong = useMemo(
    () => editorMode === EDITOR_MODE_TEMPLATE && (pageCount ?? 1) > fitTargetPages,
    [editorMode, pageCount, fitTargetPages],
  );

  // Expensive probe for the panel hint — gated on the panel being open so we
  // never pack ~10 times on every canvas edit. `panel` is the open-flyout id.
  const fitStatus = useMemo(() => {
    if (panel !== 'sections' || !fitTooLong) return null;
    const pageHeight = pageSize?.height ?? 842;
    const fit = findFitForTarget({
      elements: A4_Elements,
      loosest: baselineFlowSpacing,
      tightest: MIN_FLOW_SPACING,
      targetPages: fitTargetPages,
      pageHeight,
    });
    return {
      reducible: true,
      tier: fit.tier,
      targetLabel: formatFitTargetLabel(fitTargetPages),
    };
  }, [panel, fitTooLong, A4_Elements, baselineFlowSpacing, fitTargetPages, pageSize]);
```

(If `panel` is not the exact state variable holding the open-flyout id, use the existing boolean the render uses — `isSectionsPanel` — instead: `if (!isSectionsPanel || !fitTooLong) return null;` and add `isSectionsPanel` to deps.)

3e. **Repurpose the detection effect** (~lines 906–944). It must NO LONGER open a modal. Replace the block from `if (editorMode !== EDITOR_MODE_TEMPLATE) return;` down to the `setLongCvModal({ open: true, diagnosis })` with a one-time toast only:

```jsx
    if (editorMode !== EDITOR_MODE_TEMPLATE) return;
    if (longCvOfferedForRef.current) return;
    const minTooLongPages = isSidebarTemplate ? SIDEBAR_TOO_LONG_MIN_PAGES : TOO_LONG_MIN_PAGES;
    if (pageCount < minTooLongPages) return;
    // One gentle, non-blocking nudge per document — the badge (fitTooLong) stays
    // visible; the panel owns the actual fit affordance.
    longCvOfferedForRef.current = identity;
    pushToast({
      title: 'Twoje CV jest dość długie',
      msg: `Zajmuje ${pageCount} stron — w panelu „Układ CV” zobaczysz, jak zmieścić je na mniej.`,
      variant: 'info',
    });
```

Keep the identity-reset logic above it unchanged (it still clears `longCvOfferedForRef`). Remove the now-unused `dialog || panel` guard and the `diagnoseDocumentLength` call in this effect (the badge/toast do not need `mode`/`utilization`). Update the effect deps to drop `A4_Elements`, `dialog`, `panel` if no longer referenced and add `pushToast`.

3f. **Post-AI relax** — extend the success effect (~lines 948–959). After confirming `pageCount < baseline`, relax before nulling the ref:

```jsx
  useEffect(() => {
    const baseline = shortenBaselinePagesRef.current;
    if (baseline == null) return;
    if (pageCount < baseline) {
      // AI reclaimed a page — now recover whitespace: loosest rhythm (down to
      // COMPACT) that still fits the achieved page count. Silent, undoable.
      const pageHeight = pageSize?.height ?? 842;
      const relaxed = findFitForTarget({
        elements: A4_Elements,
        loosest: baselineFlowSpacing,
        tightest: COMPACT_FLOW_SPACING,
        targetPages: pageCount,
        pageHeight,
      });
      if (relaxed.fits && !flowSpacingEquals(relaxed.spacing, flowSpacing)) {
        commitFit(relaxed, { silent: true });
      }
      pushToast({
        title: 'Gotowe',
        msg: `CV skrócone z ${baseline} do ${pageCount} stron.`,
        variant: 'success',
      });
      shortenBaselinePagesRef.current = null;
    }
  }, [pageCount, pushToast, A4_Elements, baselineFlowSpacing, flowSpacing, pageSize, commitFit]);
```

Re-entry is safe: `shortenBaselinePagesRef.current` is nulled at the end, so `commitFit`'s re-render re-runs the effect but returns early (`baseline == null`).

3g. **Modal props** — update the `<LongCvModal .../>` render (~lines 1646–1653) to the new interface:

```jsx
              <LongCvModal
                open={longCvModal.open}
                variant={longCvModal.variant}
                targetPages={fitTargetPages}
                canUseAi={canUseAiAssistant}
                onForceTighten={onForceTighten}
                onRequestAiShorten={handleRequestAiShorten}
                onClose={closeLongCvModal}
              />
```

3h. **Context value** — add three keys to `ctxValue` (the `useMemo` object ending ~line 1497) and to its dependency array:

```jsx
    fitTooLong,
    fitStatus,
    onFitToPages,
```

Add `fitTooLong, fitStatus, onFitToPages` to the `ctxValue` deps array as well.

- [ ] **Step 4: Run tests** — the new PdfCanvas guards, then the full suite:

Run: `cd frontend && node --test src/pages/PdfCanvas.test.js`
Expected: PASS.

Run: `cd frontend && node ./scripts/run-tests.mjs 2>&1 | grep -E "✖" | sort -u`
Expected: only the 4 pre-existing `sectionRecord.test.js` failures (`placeholderContentsForRecord / inferRecordLayout`, `appendRecordToSection`, `buildRecordClone / pickRecordTemplateGroup`, `listUpperRecordMembers / insertRecordBlockAfterRecord`). No new failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PdfCanvas.jsx frontend/src/pages/PdfCanvas.test.js
git commit -m "$(cat <<'EOF'
feat(fit): wire progressive page-fit — commit/detect/relax + two-variant modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Documentation (README EN + PL)

**Files:**
- Modify: `README.md` (the landing/editor "Układ CV" and "CV too long" sections, both English and Polish)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the English section.** Find the passage describing the long-CV / auto-fit flow (search `LongCvModal`, `COMPACT_FLOW_SPACING`, `proposeAutoFitSpacing`). Replace the "single fixed compact pass then AI" description with the progressive engine: `fitToPages.js` finds the loosest rhythm (baseline → `MIN_FLOW_SPACING = {2,2,10,2}`) that fits `targetPages`; tiers `clean`/`tight` apply silently, `emergency` opens the two-variant `LongCvModal` (`Maksymalnie zacieśnij` vs AI), `impossible` routes to AI; a too-long CV shows a gentle badge on the *Układ CV* tile + one-time toast (no auto-modal); the panel shows a tier-honest fit hint + "Zmieść na …" CTA; after AI shortening, spacing auto-relaxes back toward baseline to reclaim whitespace. Note `layoutDensity.js`/`proposeAutoFitSpacing` is unchanged.

- [ ] **Step 2: Update the Polish section** with the same content, mirroring the exact UI strings used in the code (`Zmieść na …`, `Maksymalnie zacieśnij`, `Zmieścimy na …`, `Trzeba skrócić treść`).

- [ ] **Step 3: Reference the new files** in whichever implementation-file list the README keeps for this area: `frontend/src/utils/fitToPages.js` (engine), the `MIN_FLOW_SPACING` addition in `flowSpacing.js`, the rewritten `LongCvModal.jsx`, and the `SectionsPanel`/`Sidebar` hint+badge. Cite tests: `fitToPages.test.js`, the `flowSpacing.test.js` floor invariants, `LongCvModal.test.js`, and the `PdfCanvas.test.js` guards.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: progressive page-fit flow (EN + PL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Engine `findFitForTarget` (loosest-that-fits) + `applyFitPack` + ladder → Tasks 2, 4. ✅
- `MIN_FLOW_SPACING` floor + scale-can't-reach invariant → Task 1. ✅
- Tier table (`clean`/`tight`/`emergency`/`impossible`) → Tasks 3, 4. ✅
- `resolveFitAction` pure routing + `formatFitTargetLabel` → Task 5. ✅
- Shrink (baseline→floor) and post-AI relax (baseline→COMPACT) → Task 9 (3c, 3f), asserted in tests. ✅
- Repurposed detection → badge + one-time toast (no auto-modal) → Tasks 7, 9 (3e). ✅
- Tier-honest panel hint + single CTA → Task 8. ✅
- Rewritten two-variant `LongCvModal` (emergency has "Maksymalnie zacieśnij", impossible doesn't; Pro-gated AI CTA) → Task 6. ✅
- Commit = one undoable entry (`setFlowSpacing` + reconciled `setA4_Elements`) → Task 9 (3c). ✅
- Context wiring (`fitTooLong`, `fitStatus`, `onFitToPages`) → Task 9 (3d, 3h), consumed in Tasks 7, 8. ✅
- Testing strategy (injected `packFn`, floor invariants, flagship no-over-tighten, modal variants) → Tasks 1–6, 9. ✅
- Out-of-scope (`layoutDensity.js` untouched; density presets unchanged; no live preview) → respected across all tasks. ✅

**Placeholder scan:** no TBD/TODO; every code step carries full source. The one CSS caveat (merge `.tile { position: relative }` if already present) is a concrete instruction, not a placeholder.

**Type consistency:** `findFitForTarget` returns `{ fits, spacing, pageCount, elements, tier }` — consumed as `fit.spacing`/`fit.elements`/`fit.tier` in Task 9 and `resolveFitAction(fit)` in Task 5/9. `fitStatus` shape `{ reducible, tier, targetLabel }` produced in Task 9 (3d), consumed identically in Task 8. `LongCvModal` props `{ open, variant, targetPages, canUseAi, onForceTighten, onRequestAiShorten, onClose }` produced in Task 6, passed identically in Task 9 (3g). `formatFitTargetLabel` returns the "na"-less locative in Task 5, and every caller prepends "na " (Tasks 6, 8). Consistent.

**One open runtime detail flagged for the executor:** Task 9 (3d) gates the expensive `fitStatus` probe on the open-flyout id. The plan uses `panel === 'sections'`; if the actual state variable differs, the plan gives the fallback (`isSectionsPanel`). The executor confirms the real identifier when editing `PdfCanvas.jsx` and picks the matching one — both are already in scope.
