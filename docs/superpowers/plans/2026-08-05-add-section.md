# Add Section (Structural Editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add a new section (single textarea, or an education/experience-style record) to a template-mode CV from the Sections panel; the section is appended at the end of the document in the template's governing rhythm and styled to match existing sections.

**Architecture:** A pure builder/placement layer in `frontend/src/utils` (style sampling in `sectionStructure.js`, element construction in a new `sectionBuilder.js`, surgical end-placement in `sectionStructure.js`) plus thin wiring: a `handleAddSection` handler in `useA4Elements.js` exposed through `PdfContext`, and a `DialogShell`-based `AddSectionModal` opened from a button in `SectionsPanel.jsx`. Existing sections are never repacked — only the new elements are positioned.

**Tech Stack:** React 19 (function components, `use(Context)`), plain-JS pure utils, `nanoid` for ids, Node's built-in test runner (`node:test` + `node:assert/strict`), CSS modules with the app's `--chrome-*` design tokens.

## Global Constraints

- Layouts in scope: **aa** (heading + chrome + one textarea) and **cc** (heading + chrome + one education/experience-style record). **bb** (columns) is OUT OF SCOPE (needs horizontal-row packer support — separate spec).
- New chrome elements MUST be tagged `flowRole: "section-chrome"`; new body elements MUST be tagged `flowRole: "content"`. This is how `isSectionHeading` / `packDocumentSections` detect and manage the section.
- Body textareas MUST set `autoHeight: true` so the runtime reflow manages their height and `isSectionHeading` never mis-detects them as headings.
- Vertical rhythm comes from the document's `flowSpacing` (`{ stack, record, section, after_rule }`); never hardcode gaps — read them via `normalizeFlowSpacing`.
- All new code comments and UI-facing strings follow the existing codebase: comments in professional English; user-facing UI copy in Polish (matching `SectionsPanel` / `UnlockFreeformModal`).
- Frontend unit tests run with `npm test` (from `frontend/`), which globs `*.test.js` under `src/utils`, `src/hooks`, etc. A single file runs with:
  `node --import ./scripts/register-hook.mjs --test src/utils/<file>.test.js` (run from `frontend/`).
- Per project rules (`CLAUDE.md`), update `README.md` (English + Polish) and its Features section with accurate file/symbol references as part of the feature (Task 7).

---

### Task 1: `deriveSectionStyle` — sample template look

**Files:**
- Modify: `frontend/src/utils/sectionStructure.js` (add `DEFAULT_SECTION_STYLE` const + `deriveSectionStyle` export near the existing exports; it may use the module-private `absoluteTop`, `absoluteBottom`, `elementHeight` helpers already defined in this file)
- Test: `frontend/src/utils/sectionStructure.test.js` (append a new `describe("deriveSectionStyle", …)`)

**Interfaces:**
- Consumes: existing `listDocumentSections(elements, pageHeight)` and `sectionElementIds(elements, headingId, pageHeight)` from the same module.
- Produces:
  - `deriveSectionStyle(elements: object[], pageHeight = 842): SectionStyle`
  - `SectionStyle = {`
    `  left: number, recordWidth: number,`
    `  heading: { fontSize: number, fontFamily: string, color: string, letterSpacing: number, bold: boolean },`
    `  rule: { width: number, height: number, backgroundColor: string } | null,`
    `  marker: { category: "rectangle"|"circle", width: number, height: number, backgroundColor: string, relLeft: number, relTop: number } | null,`
    `  body: { fontSize: number, fontFamily: string, lineHeight: number, color: string },`
    `  mutedColor: string`
    `}`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/utils/sectionStructure.test.js` (import `deriveSectionStyle` in the existing top `import { … } from "./sectionStructure.js";`):

```js
describe("deriveSectionStyle", () => {
  it("falls back to defaults when the document has no sections", () => {
    const style = deriveSectionStyle([]);
    assert.equal(style.marker, null);
    assert.ok(style.recordWidth > 0);
    assert.ok(style.heading.fontSize > 0);
    assert.equal(typeof style.body.color, "string");
  });

  it("samples the last section's heading, rule and body", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie",
        left: 76, top: 100, fontSize: 8.7, fontFamily: "Inter", color: "#111111", letterSpacing: 1.6 },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 112, width: 466, height: 1, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 130, width: 466, height: 40, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "Umiejętności",
        left: 76, top: 260, fontSize: 8.7, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.35 },
      { element_id: "r2", category: "line", flowRole: "section-chrome",
        left: 76, top: 272, width: 466, height: 1, backgroundColor: "#bbbbbb" },
      { element_id: "b2", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 290, width: 466, height: 20, fontSize: 9.1, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.left, 76);
    assert.equal(style.recordWidth, 466);
    assert.equal(style.heading.color, "#733B43"); // from the LAST section (Umiejętności)
    assert.equal(style.heading.letterSpacing, 1.35);
    assert.equal(style.rule.backgroundColor, "#bbbbbb");
    assert.equal(style.body.fontSize, 9.1);
  });

  it("captures a decorative marker offset from the heading", () => {
    const elements = [
      { element_id: "m1", category: "rectangle", flowRole: "section-chrome",
        left: 51, top: 101, width: 8, height: 8, backgroundColor: "#733B43" },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Profil",
        left: 76, top: 100, fontSize: 8.4, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.6 },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 111, width: 466, height: 1, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 128, width: 466, height: 30, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
    ];
    const style = deriveSectionStyle(elements);
    assert.ok(style.marker);
    assert.equal(style.marker.category, "rectangle");
    assert.equal(style.marker.relLeft, -25); // 51 - 76
    assert.equal(style.marker.width, 8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/sectionStructure.test.js` (from `frontend/`)
Expected: FAIL — `deriveSectionStyle is not a function` / not exported.

- [ ] **Step 3: Implement `deriveSectionStyle`**

Add near the other exports in `frontend/src/utils/sectionStructure.js`:

```js
/**
 * Template-neutral fallback used when a document has no detectable sections
 * (rare — the structural editor runs in template mode). Values mirror a mid
 * single-column CV: a thin ruled heading over ~9px body copy.
 */
const DEFAULT_SECTION_STYLE = Object.freeze({
  left: 66,
  recordWidth: 463,
  heading: { fontSize: 8.5, fontFamily: "Inter", color: "#24201E", letterSpacing: 1.4, bold: false },
  rule: { width: 463, height: 1, backgroundColor: "#BFB4AA" },
  marker: null,
  body: { fontSize: 9.3, fontFamily: "Inter", lineHeight: 13, color: "#24201E" },
  mutedColor: "#756F6B",
});

/**
 * Derive a style profile from the document's last section so a newly added
 * section matches the active template (heading font, rule, marker, body copy).
 *
 * Sampling the LAST section keeps the new section visually consistent with the
 * content it will sit directly beneath. When no section exists, returns a copy
 * of the template-neutral defaults.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {object} style profile (see plan `SectionStyle`)
 */
export function deriveSectionStyle(elements, pageHeight = 842) {
  const list = elements || [];
  const sections = listDocumentSections(list, pageHeight);
  if (sections.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_SECTION_STYLE));
  }

  const last = sections[sections.length - 1];
  const heading = list.find((element) => element.element_id === last.headingId) || null;
  const memberIds = sectionElementIds(list, last.headingId, pageHeight);
  const members = list.filter((element) => memberIds.has(element.element_id));

  // Widest thin line in the section is the heading rule.
  const rule = members
    .filter((element) => element.category === "line"
      && (Number(element.width) || 0) >= 120
      && (Number(element.height) || 0) <= 4)
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0] || null;

  // Small tagged shape offset from the label is the decorative marker.
  const marker = members.find((element) => element.element_id !== last.headingId
    && element.flowRole === "section-chrome"
    && (element.category === "rectangle" || element.category === "circle")
    && (Number(element.width) || 0) <= 40
    && (Number(element.height) || 0) <= 40) || null;

  // Body copy: non-chrome content elements, in reading order.
  const bodyElements = members
    .filter((element) => element.element_id !== last.headingId
      && element.flowRole !== "section-chrome"
      && element.category !== "line")
    .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight));
  const body = bodyElements[0] || null;

  const headingLeft = Number(heading?.left);
  const left = Number.isFinite(headingLeft) ? headingLeft : DEFAULT_SECTION_STYLE.left;
  const recordWidth = Number(body?.width) || Number(rule?.width) || DEFAULT_SECTION_STYLE.recordWidth;

  // Muted color: a body line whose color differs from the main body color
  // (typically the meta line). Best-effort — falls back to the body color.
  const bodyColor = String(body?.color || DEFAULT_SECTION_STYLE.body.color);
  const mutedElement = bodyElements.find((element) => String(element.color || "") && String(element.color) !== bodyColor);
  const mutedColor = mutedElement ? String(mutedElement.color) : DEFAULT_SECTION_STYLE.mutedColor;

  return {
    left,
    recordWidth,
    heading: {
      fontSize: Number(heading?.fontSize) || DEFAULT_SECTION_STYLE.heading.fontSize,
      fontFamily: String(heading?.fontFamily || DEFAULT_SECTION_STYLE.heading.fontFamily),
      color: String(heading?.color || DEFAULT_SECTION_STYLE.heading.color),
      letterSpacing: Number(heading?.letterSpacing) || 0,
      bold: Boolean(heading?.bold),
    },
    rule: rule
      ? {
        width: Number(rule.width) || recordWidth,
        height: Number(rule.height) || 1,
        backgroundColor: String(rule.backgroundColor || DEFAULT_SECTION_STYLE.rule.backgroundColor),
      }
      : null,
    marker: marker
      ? {
        category: marker.category,
        width: Number(marker.width) || 8,
        height: Number(marker.height) || 8,
        backgroundColor: String(marker.backgroundColor || DEFAULT_SECTION_STYLE.heading.color),
        relLeft: (Number(marker.left) || 0) - left,
        relTop: absoluteTop(marker, pageHeight) - absoluteTop(heading, pageHeight),
      }
      : null,
    body: {
      fontSize: Number(body?.fontSize) || DEFAULT_SECTION_STYLE.body.fontSize,
      fontFamily: String(body?.fontFamily || DEFAULT_SECTION_STYLE.body.fontFamily),
      lineHeight: Number(body?.lineHeight) || Math.round((Number(body?.fontSize) || DEFAULT_SECTION_STYLE.body.fontSize) * 1.4),
      color: bodyColor,
    },
    mutedColor,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/sectionStructure.test.js`
Expected: PASS (new `deriveSectionStyle` block green; existing tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sectionStructure.js frontend/src/utils/sectionStructure.test.js
git commit -m "feat(sections): derive section style profile from last section"
```

---

### Task 2: `placeStrip` refactor + `appendSectionAtEnd`

**Files:**
- Modify: `frontend/src/utils/sectionStructure.js` (extract the per-strip placement loop from `packDocumentSections` into a private `placeStrip`; add the `appendSectionAtEnd` export)
- Test: `frontend/src/utils/sectionStructure.test.js` (append a `describe("appendSectionAtEnd", …)`)

**Interfaces:**
- Consumes: private `compactSectionStrip`, `leadingChromeCount`, `placeAtFlowCursor`, `pageTopFromOrigin`, `elementHeight`, `absoluteBottom`, and `normalizeFlowSpacing` (all already in the module); `DEFAULT_PAGE_TOP` / `DEFAULT_BOTTOM_MARGIN` constants.
- Produces:
  - private `placeStrip(strip, cursorAbs, pageHeight, pageTop, bottomMargin): { placedById: Map<string, object>, bottomAbs: number }`
  - `appendSectionAtEnd(elements: object[], newElements: object[], pageHeight = 842, options?: { spacing?: object, pageTop?: number, bottomMargin?: number }): object[]`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/utils/sectionStructure.test.js` (add `appendSectionAtEnd` to the top import):

```js
describe("appendSectionAtEnd", () => {
  const pageHeight = 842;

  function sampleDoc() {
    return [
      // masthead (excluded from section packing but counts as flow content)
      { element_id: "name", category: "text", flowRole: "masthead", content: "Jan Kowalski", left: 76, top: 60, fontSize: 20, height: 24, page: 1 },
      // one existing section
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie", left: 76, top: 120, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r1", category: "line", flowRole: "section-chrome", left: 76, top: 132, width: 466, height: 1, page: 1 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 150, width: 466, height: 60, fontSize: 9.3, page: 1 },
    ];
  }

  function newSection() {
    return [
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "Umiejętności", left: 76, top: 0, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r2", category: "line", flowRole: "section-chrome", left: 76, top: 8.7, width: 466, height: 1, page: 1 },
      { element_id: "b2", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 30, width: 466, height: 40, fontSize: 9.3, page: 1 },
    ];
  }

  it("keeps existing elements untouched and appends the new ones", () => {
    const doc = sampleDoc();
    const result = appendSectionAtEnd(doc, newSection(), pageHeight, { spacing: { stack: 4, record: 10, section: 21, after_rule: 8 } });
    // Original four elements are byte-stable (same order, same positions).
    for (let i = 0; i < doc.length; i += 1) {
      assert.deepEqual(result[i], doc[i]);
    }
    assert.equal(result.length, doc.length + 3);
  });

  it("places the new heading below the previous section's body", () => {
    const doc = sampleDoc();
    const result = appendSectionAtEnd(doc, newSection(), pageHeight, { spacing: { stack: 4, record: 10, section: 21, after_rule: 8 } });
    const newHeading = result.find((element) => element.element_id === "h2");
    const prevBodyBottom = 150 + 60; // b1 top + height
    const newHeadingAbs = (newHeading.page - 1) * pageHeight + newHeading.top;
    assert.ok(newHeadingAbs >= prevBodyBottom, `expected ${newHeadingAbs} >= ${prevBodyBottom}`);
  });

  it("produces a section detectable by listDocumentSections", () => {
    const result = appendSectionAtEnd(sampleDoc(), newSection(), pageHeight, {});
    const titles = listDocumentSections(result, pageHeight).map((section) => section.title);
    assert.deepEqual(titles, ["Doświadczenie", "Umiejętności"]);
  });

  it("returns the original list unchanged when there is nothing to add", () => {
    const doc = sampleDoc();
    assert.equal(appendSectionAtEnd(doc, [], pageHeight, {}), doc);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/sectionStructure.test.js`
Expected: FAIL — `appendSectionAtEnd is not a function`.

- [ ] **Step 3a: Extract `placeStrip` (behavior-preserving refactor)**

In `frontend/src/utils/sectionStructure.js`, add this private helper immediately above `packDocumentSections`:

```js
/**
 * Place one compacted strip starting at `cursorAbs`. The leading chrome band
 * (heading + rule + markers) is reserved together with the first body block so
 * a 1px rule can never independently "fit" in the footer while the body jumps
 * to the next page.
 *
 * @returns {{ placedById: Map<string, object>, bottomAbs: number }}
 */
function placeStrip(strip, cursorAbs, pageHeight, pageTop, bottomMargin) {
  const placedById = new Map();
  if (strip.length === 0) return { placedById, bottomAbs: cursorAbs };

  const chromeCount = leadingChromeCount(strip);
  const firstBody = chromeCount < strip.length ? strip[chromeCount] : null;
  let reservedHeight = 0;
  if (chromeCount > 0) {
    const lastChrome = strip[chromeCount - 1];
    reservedHeight = lastChrome.relTop + elementHeight(lastChrome.element);
    if (firstBody) {
      reservedHeight = firstBody.relTop + elementHeight(firstBody.element);
    }
  } else if (firstBody) {
    reservedHeight = elementHeight(firstBody.element);
  }

  const sectionCursor = reservedHeight > 0
    ? placeAtFlowCursor(cursorAbs, reservedHeight, pageHeight, pageTop, bottomMargin).abs
    : cursorAbs;

  let stripBottom = sectionCursor;
  let previous = null;
  for (let index = 0; index < strip.length; index += 1) {
    const item = strip[index];
    const height = elementHeight(item.element);
    const inLeadingChrome = index < chromeCount;

    let placed;
    if (inLeadingChrome) {
      const at = pageTopFromOrigin(sectionCursor, item.relTop, pageHeight);
      placed = { page: at.page, top: at.top, abs: at.abs, bottom: at.abs + height };
    } else {
      let desiredAbs = sectionCursor;
      if (previous) {
        const gap = item.relTop
          - (previous.item.relTop + elementHeight(previous.item.element));
        desiredAbs = previous.placed.bottom + Math.max(0, gap);
      } else {
        desiredAbs = sectionCursor + item.relTop;
      }
      placed = placeAtFlowCursor(desiredAbs, height, pageHeight, pageTop, bottomMargin);
    }

    placedById.set(item.element.element_id, {
      ...item.element,
      page: placed.page,
      top: placed.top,
    });
    previous = { item, placed };
    stripBottom = Math.max(stripBottom, placed.bottom);
  }

  return { placedById, bottomAbs: stripBottom };
}
```

Then replace the `strips.forEach(...)` block inside `packDocumentSections` (the loop that currently inlines this placement logic) with:

```js
  strips.forEach((strip, stripIndex) => {
    if (strip.length === 0) return;
    if (stripIndex > 0) cursorAbs += resolvedSectionGap;
    const { placedById: stripPlaced, bottomAbs } = placeStrip(
      strip, cursorAbs, pageHeight, pageTop, bottomMargin,
    );
    for (const [id, element] of stripPlaced) placedById.set(id, element);
    cursorAbs = bottomAbs;
  });
```

(Keep the `placedById` map and final `list.map(...)` return in `packDocumentSections` exactly as they are.)

- [ ] **Step 3b: Add `appendSectionAtEnd`**

Add this export in `frontend/src/utils/sectionStructure.js` (e.g. after `packDocumentSections`):

```js
/**
 * Append a freshly built section's elements at the end of the document flow,
 * in the document's governing rhythm, without repacking existing sections.
 *
 * The new strip is placed below the deepest existing non-fixed element plus one
 * SPACE_SECTION gap and paginated with the same margins as `packDocumentSections`.
 * `fixedToPage` decorations (page frames, footers) are excluded from the flow
 * bottom so the section follows real content rather than the page border.
 *
 * @param {object[]} elements current document elements
 * @param {object[]} newElements the section's chrome + body (unplaced)
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, pageTop?: number, bottomMargin?: number }} [options]
 * @returns {object[]} elements with the new section appended and positioned
 */
export function appendSectionAtEnd(
  elements,
  newElements,
  pageHeight = 842,
  { spacing, pageTop = DEFAULT_PAGE_TOP, bottomMargin = DEFAULT_BOTTOM_MARGIN } = {},
) {
  const list = elements || [];
  const additions = newElements || [];
  if (additions.length === 0) return list;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);

  let flowBottom = 0;
  for (const element of list) {
    if (!element || element.fixedToPage) continue;
    flowBottom = Math.max(flowBottom, absoluteBottom(element, pageHeight));
  }
  const cursorAbs = flowBottom > 0 ? flowBottom + rhythm.section : pageTop;

  // forceTargets: the strip was authored with placeholder gaps, so pin it to the
  // document's exact SPACE_* rhythm on the way in.
  const strip = compactSectionStrip(additions, pageHeight, rhythm, true);
  const { placedById } = placeStrip(strip, cursorAbs, pageHeight, pageTop, bottomMargin);

  const placedAdditions = additions.map(
    (element) => placedById.get(element.element_id) || element,
  );
  return [...list, ...placedAdditions];
}
```

- [ ] **Step 4: Run the full util test suite to verify pass + no regression**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/sectionStructure.test.js`
Expected: PASS — new `appendSectionAtEnd` block green AND all pre-existing `packDocumentSections` / `reorderSection` / `applyFlowSpacing` tests still green (the refactor is behavior-preserving).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sectionStructure.js frontend/src/utils/sectionStructure.test.js
git commit -m "feat(sections): append a section at end in document rhythm"
```

---

### Task 3: `sectionBuilder.js` — build section elements

**Files:**
- Create: `frontend/src/utils/sectionBuilder.js`
- Test: `frontend/src/utils/sectionBuilder.test.js`

**Interfaces:**
- Consumes: `measureTextareaHeight` from `./textareaHeight.js`; `DEFAULT_FLOW_SPACING`, `normalizeFlowSpacing` from `./flowSpacing.js`; a `SectionStyle` object (Task 1) via the `style` arg.
- Produces:
  - `SECTION_LAYOUTS = { TEXTAREA: "aa", RECORD: "cc" }`
  - `buildSectionElements({ name: string, layout: "aa"|"cc", style: object, spacing?: object, idFactory: () => string }): { elements: object[], headingId: string, firstBodyId: string }`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/sectionBuilder.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import { listDocumentSections, sectionElementIds } from "./sectionStructure.js";

// Deterministic ids so assertions are stable.
function makeIdFactory() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

const style = {
  left: 76,
  recordWidth: 466,
  heading: { fontSize: 8.7, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.5, bold: false },
  rule: { width: 466, height: 1, backgroundColor: "#cccccc" },
  marker: { category: "rectangle", width: 8, height: 8, backgroundColor: "#733B43", relLeft: -25, relTop: 1 },
  body: { fontSize: 9.3, fontFamily: "Inter", lineHeight: 13, color: "#222222" },
  mutedColor: "#756F6B",
};

describe("buildSectionElements", () => {
  it("aa: heading (chrome) + rule (chrome) + one content textarea", () => {
    const { elements, headingId, firstBodyId } = buildSectionElements({
      name: "Profil", layout: SECTION_LAYOUTS.TEXTAREA, style, idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.element_id === headingId);
    assert.equal(heading.category, "text");
    assert.equal(heading.flowRole, "section-chrome");
    assert.equal(heading.content, "Profil");
    assert.equal(heading.color, "#733B43");

    const chrome = elements.filter((element) => element.flowRole === "section-chrome");
    assert.ok(chrome.some((element) => element.category === "line"));      // rule
    assert.ok(chrome.some((element) => element.category === "rectangle")); // marker

    const body = elements.filter((element) => element.flowRole === "content");
    assert.equal(body.length, 1);
    assert.equal(body[0].element_id, firstBodyId);
    assert.equal(body[0].category, "textarea");
    assert.equal(body[0].autoHeight, true);
    assert.equal(body[0].width, 466);
  });

  it("cc: one record of four content blocks sharing a flowGroup", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Kursy", layout: SECTION_LAYOUTS.RECORD, style, idFactory: makeIdFactory(),
    });
    const body = elements.filter((element) => element.flowRole === "content");
    assert.equal(body.length, 4);
    const groups = new Set(body.map((element) => element.flowGroup));
    assert.equal(groups.size, 1); // all four share one group
    assert.equal([...groups][0].startsWith(`section-${headingId}`), true);
    assert.equal(body[0].bold, true);                 // title line
    assert.equal(body[2].color, "#756F6B");           // meta uses muted color
    assert.equal(body[3].bulletList, true);           // description is a bullet list
  });

  it("round-trips: built section is detectable and its body is collected", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Umiejętności", layout: SECTION_LAYOUTS.RECORD, style, idFactory: makeIdFactory(),
    });
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["Umiejętności"]);
    const ids = sectionElementIds(elements, headingId);
    // heading + rule + marker + 4 body blocks all belong to the section.
    assert.equal(ids.size, elements.length);
  });

  it("defaults the heading label when the name is blank", () => {
    const { elements, headingId } = buildSectionElements({
      name: "   ", layout: SECTION_LAYOUTS.TEXTAREA, style, idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.element_id === headingId);
    assert.equal(heading.content, "Nowa sekcja");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/sectionBuilder.test.js`
Expected: FAIL — cannot find module `./sectionBuilder.js`.

- [ ] **Step 3: Implement `sectionBuilder.js`**

Create `frontend/src/utils/sectionBuilder.js`:

```js
/**
 * Structural section builder.
 *
 * Pure constructors for a new template-mode section: a section-chrome band
 * (heading + rule, optionally a marker) plus body content for the chosen
 * layout. Geometry is authored relative to page 1 only so the chrome forms a
 * tight cluster and body reads top-to-bottom; `appendSectionAtEnd` repositions
 * the whole strip into the document flow, so absolute positions here are
 * intentionally provisional.
 *
 * Layouts:
 *  - "aa": heading + chrome + one auto-height content textarea.
 *  - "cc": heading + chrome + one education/experience-style record (title,
 *    subtitle, meta, bullet description). Per the editor spec, each line's
 *    placeholder text names the field it stands for.
 */
import { measureTextareaHeight } from "./textareaHeight.js";
import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from "./flowSpacing.js";

export const SECTION_LAYOUTS = Object.freeze({
  TEXTAREA: "aa",
  RECORD: "cc",
});

/** Field-naming placeholder copy (Polish UI). */
const PLACEHOLDER = Object.freeze({
  heading: "Nowa sekcja",
  textarea: "Treść sekcji…",
  recordTitle: "Nazwa dyplomu / stanowisko",
  recordSubtitle: "Uczelnia / firma",
  recordMeta: "Miasto · okres",
  recordDescription: "Opis…",
});

/**
 * Build one auto-height content textarea matching the sampled body style.
 * @returns {object}
 */
function contentTextarea({
  elementId, content, left, top, width,
  fontSize, fontFamily, lineHeight, color,
  bold = false, bulletList = false, flowGroup = null,
}) {
  const lh = lineHeight || Math.round(fontSize * 1.4);
  const element = {
    element_id: elementId,
    category: "textarea",
    content,
    flowRole: "content",
    autoHeight: true,
    left,
    top,
    width,
    height: measureTextareaHeight(content, width, fontSize, lh),
    fontSize,
    fontFamily,
    lineHeight: lh,
    letterSpacing: 0,
    color,
    bold,
    italic: false,
    underline: false,
    align: "left",
    bulletList,
    isSelected: false,
    isMove: false,
    isEditing: false,
    locked: false,
    zIndex: 4,
    page: 1,
  };
  if (flowGroup) element.flowGroup = flowGroup;
  return element;
}

/**
 * Build a decorative section marker (small rect/circle) offset from the label.
 * @returns {object}
 */
function markerElement({ elementId, marker, left }) {
  const base = {
    element_id: elementId,
    category: marker.category,
    flowRole: "section-chrome",
    left: left + marker.relLeft,
    top: Math.max(0, marker.relTop),
    width: marker.width,
    height: marker.height,
    backgroundColor: marker.backgroundColor,
    isSelected: false,
    isMove: false,
    locked: false,
    zIndex: 3,
    page: 1,
  };
  if (marker.category === "circle") {
    base.borderWidth = 1;
    base.filled = true;
  }
  return base;
}

/**
 * Build a new section's elements for the chosen layout.
 *
 * @param {{ name: string, layout: "aa"|"cc", style: object, spacing?: object, idFactory: () => string }} args
 * @returns {{ elements: object[], headingId: string, firstBodyId: string }}
 */
export function buildSectionElements({ name, layout, style, spacing, idFactory }) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const label = String(name || "").trim() || PLACEHOLDER.heading;
  const left = style.left;
  const width = style.recordWidth;
  const headingId = idFactory();
  const elements = [];

  if (style.marker) {
    elements.push(markerElement({ elementId: idFactory(), marker: style.marker, left }));
  }

  // Heading label (section title). Placed at relTop 0 so it anchors the chrome.
  elements.push({
    element_id: headingId,
    category: "text",
    content: label,
    flowRole: "section-chrome",
    left,
    top: 0,
    fontSize: style.heading.fontSize,
    fontFamily: style.heading.fontFamily,
    color: style.heading.color,
    letterSpacing: style.heading.letterSpacing,
    bold: style.heading.bold,
    italic: false,
    underline: false,
    isSelected: false,
    isMove: false,
    locked: false,
    zIndex: 3,
    page: 1,
  });

  if (style.rule) {
    // Rule sits flush under the label (relTop ≈ heading height).
    elements.push({
      element_id: idFactory(),
      category: "line",
      flowRole: "section-chrome",
      left,
      top: style.heading.fontSize,
      width: style.rule.width,
      height: style.rule.height,
      backgroundColor: style.rule.backgroundColor,
      isSelected: false,
      isMove: false,
      locked: false,
      zIndex: 2,
      page: 1,
    });
  }

  // Body starts below the chrome band; exact offset is re-pinned on append.
  const bodyTop = style.heading.fontSize + 12;
  let firstBodyId = null;

  if (layout === SECTION_LAYOUTS.RECORD) {
    const group = `section-${headingId}-rec1`;
    const lines = [
      { content: PLACEHOLDER.recordTitle, color: style.body.color, bold: true },
      { content: PLACEHOLDER.recordSubtitle, color: style.body.color, bold: false },
      { content: PLACEHOLDER.recordMeta, color: style.mutedColor, bold: false },
      { content: PLACEHOLDER.recordDescription, color: style.body.color, bold: false, bulletList: true },
    ];
    let top = bodyTop;
    lines.forEach((line, index) => {
      const elementId = idFactory();
      if (index === 0) firstBodyId = elementId;
      elements.push(contentTextarea({
        elementId,
        content: line.content,
        left,
        top,
        width,
        fontSize: style.body.fontSize,
        fontFamily: style.body.fontFamily,
        lineHeight: style.body.lineHeight,
        color: line.color,
        bold: line.bold,
        bulletList: Boolean(line.bulletList),
        flowGroup: group,
      }));
      top += style.body.lineHeight + rhythm.stack;
    });
  } else {
    firstBodyId = idFactory();
    elements.push(contentTextarea({
      elementId: firstBodyId,
      content: PLACEHOLDER.textarea,
      left,
      top: bodyTop,
      width,
      fontSize: style.body.fontSize,
      fontFamily: style.body.fontFamily,
      lineHeight: style.body.lineHeight,
      color: style.body.color,
    }));
  }

  return { elements, headingId, firstBodyId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/sectionBuilder.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sectionBuilder.js frontend/src/utils/sectionBuilder.test.js
git commit -m "feat(sections): build section elements for aa and cc layouts"
```

---

### Task 4: `handleAddSection` handler + context wiring

**Files:**
- Modify: `frontend/src/hooks/useA4Elements.js` (add `handleAddSection` near `handleAddTextarea`; add imports; add to the hook's return object)
- Modify: `frontend/src/pages/PdfCanvas.jsx` (destructure `handleAddSection` from `useA4Elements`; expose as `addSection` in `canvasValue` + its dependency array)

**Interfaces:**
- Consumes: `deriveSectionStyle`, `appendSectionAtEnd` (Task 1–2), `buildSectionElements` (Task 3), existing `markElementsEnter`, `nanoid`, `flowSpacingRef`, `pageSizeRef`, `setA4_Elements`.
- Produces:
  - `handleAddSection({ name: string, layout: "aa"|"cc" }): void` (exposed on `PdfContext` as `addSection`).

- [ ] **Step 1: Add imports in `useA4Elements.js`**

At the top of `frontend/src/hooks/useA4Elements.js`, alongside the other util imports, add:

```js
import { deriveSectionStyle, appendSectionAtEnd } from "../utils/sectionStructure";
import { buildSectionElements } from "../utils/sectionBuilder";
```

- [ ] **Step 2: Implement `handleAddSection`**

Add this `useCallback` immediately after `handleAddTextarea` (around line 487) in `frontend/src/hooks/useA4Elements.js`:

```js
  /**
   * Add a new template-mode section (heading + chrome + body) to the end of the
   * document in the active rhythm. Style is sampled from the last section so the
   * new one matches the template; the first editable body enters edit mode so
   * the user can type immediately.
   *
   * @param {{ name: string, layout: "aa"|"cc" }} config
   */
  const handleAddSection = useCallback(({ name, layout }) => {
    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const spacing = flowSpacingRef.current;
      const style = deriveSectionStyle(prev, pageHeight);
      const { elements, firstBodyId } = buildSectionElements({
        name,
        layout,
        style,
        spacing,
        idFactory: nanoid,
      });
      const next = appendSectionAtEnd(prev, elements, pageHeight, { spacing });
      markElementsEnter(elements.map((element) => element.element_id));

      // Select + open the first body for editing; clear any prior selection so
      // typing does not apply to a previously selected element.
      return next.map((element) => {
        if (element.element_id === firstBodyId) {
          return { ...element, isSelected: true, isEditing: true };
        }
        if (element.isSelected || element.isEditing) {
          return { ...element, isSelected: false, isEditing: false };
        }
        return element;
      });
    });
  }, []);
```

- [ ] **Step 3: Export `handleAddSection` from the hook**

In the hook's return object, add `handleAddSection,` immediately after `handleAddTextarea,` (around line 1503):

```js
    handleAddTextarea,
    handleAddSection,
```

- [ ] **Step 4: Wire into `PdfCanvas.jsx`**

(a) In the `useA4Elements` destructure (around line 172–173), add:

```js
    handleAddTextarea,
    handleAddSection,
```

(b) In `canvasValue` (around line 774), add after `addTextarea: handleAddTextarea,`:

```js
    addTextarea: handleAddTextarea,
    addSection: handleAddSection,
```

(c) In the `canvasValue` dependency array (around line 860), add `handleAddSection` next to `handleAddTextarea`:

```js
    isTwoPageView, toggleTwoPageView, handleAddTextarea, handleAddSection, markSelected, handleSetTextareaEditing,
```

- [ ] **Step 5: Verify build + lint + existing tests**

Run (from `frontend/`):
```
npm run lint
npm test
```
Expected: lint clean for the changed files; all tests PASS (no behavior test yet for the handler — it is exercised through the UI in Task 6; util coverage from Tasks 1–3 stands).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useA4Elements.js frontend/src/pages/PdfCanvas.jsx
git commit -m "feat(sections): wire handleAddSection into canvas context"
```

---

### Task 5: `AddSectionModal` component

**Files:**
- Create: `frontend/src/components/editor/AddSectionModal/AddSectionModal.jsx`
- Create: `frontend/src/components/editor/AddSectionModal/AddSectionModal.module.css`

**Interfaces:**
- Consumes: `DialogShell` from `../../common/DialogShell/DialogShell`; `SECTION_LAYOUTS` from `../../../utils/sectionBuilder`.
- Produces:
  - `AddSectionModal({ open: boolean, onCancel: () => void, onConfirm: ({ name: string, layout: "aa"|"cc" }) => void })` (default export).

- [ ] **Step 1: Implement the modal component**

Create `frontend/src/components/editor/AddSectionModal/AddSectionModal.jsx`:

```jsx
/**
 * Modal for adding a new template-mode section: a section name plus a layout
 * choice (single textarea, or an education/experience-style record). The column
 * layout ("bb") is intentionally absent — it requires horizontal-row packer
 * support and ships in a later iteration.
 */
import { useEffect, useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import { SECTION_LAYOUTS } from "../../../utils/sectionBuilder";
import classes from "./AddSectionModal.module.css";

const LAYOUT_OPTIONS = [
  {
    value: SECTION_LAYOUTS.TEXTAREA,
    title: "Nagłówek + treść",
    description: "Nagłówek sekcji i jedno pole tekstowe (Textarea).",
  },
  {
    value: SECTION_LAYOUTS.RECORD,
    title: "Nagłówek + rekord",
    description: "Układ jak w edukacji lub doświadczeniu (tytuł, podtytuł, meta, opis).",
  },
];

export default function AddSectionModal({ open, onCancel, onConfirm }) {
  const [name, setName] = useState("");
  const [layout, setLayout] = useState(SECTION_LAYOUTS.TEXTAREA);

  // Reset the form each time the modal opens so a previous entry does not leak
  // into the next section.
  useEffect(() => {
    if (open) {
      setName("");
      setLayout(SECTION_LAYOUTS.TEXTAREA);
    }
  }, [open]);

  function handleConfirm() {
    const trimmed = name.trim();
    onConfirm({ name: trimmed || "Nowa sekcja", layout });
  }

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={440}
      title="Dodaj sekcję"
      subtitle="Nowa sekcja trafi na koniec dokumentu w rytmie szablonu"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onCancel}>
            Anuluj
          </button>
          <button type="button" className={classes.primary} onClick={handleConfirm}>
            Dodaj sekcję
          </button>
        </div>
      )}
    >
      <label className={classes.field}>
        <span className={classes.label}>Nazwa sekcji</span>
        <input
          className={classes.input}
          type="text"
          value={name}
          placeholder="np. Certyfikaty"
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>

      <fieldset className={classes.fieldset}>
        <legend className={classes.label}>Układ sekcji</legend>
        {LAYOUT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`${classes.option}${layout === option.value ? ` ${classes.optionActive}` : ""}`}
          >
            <input
              type="radio"
              name="section-layout"
              value={option.value}
              checked={layout === option.value}
              onChange={() => setLayout(option.value)}
            />
            <span className={classes.optionText}>
              <span className={classes.optionTitle}>{option.title}</span>
              <span className={classes.optionDesc}>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </DialogShell>
  );
}
```

- [ ] **Step 2: Add the stylesheet**

Create `frontend/src/components/editor/AddSectionModal/AddSectionModal.module.css`:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.label {
  font: 600 12px var(--font-body);
  color: var(--chrome-ink);
}

.input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--chrome-border);
  border-radius: 6px;
  background: var(--chrome-control);
  color: var(--chrome-ink);
  font: 500 14px var(--font-body);
  padding: 9px 11px;
}

.input:focus {
  outline: 1px solid var(--chrome-accent);
  border-color: var(--chrome-accent);
}

.fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--chrome-border);
  border-radius: 8px;
  cursor: pointer;
  background: var(--chrome-control);
}

.optionActive {
  border-color: var(--chrome-accent);
  box-shadow: inset 0 0 0 1px var(--chrome-accent);
}

.optionText {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.optionTitle {
  font: 600 13px var(--font-body);
  color: var(--chrome-ink);
}

.optionDesc {
  font: 500 11px var(--font-body);
  color: var(--chrome-muted);
  line-height: 1.35;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ghost,
.primary {
  border-radius: 7px;
  font: 600 13px var(--font-body);
  padding: 9px 14px;
  cursor: pointer;
}

.ghost {
  border: 1px solid var(--chrome-border);
  background: var(--chrome-hover);
  color: var(--chrome-ink);
}

.primary {
  border: 1px solid var(--chrome-accent);
  background: var(--chrome-accent);
  color: #ffffff;
}

.ghost:hover {
  border-color: var(--chrome-accent);
  color: var(--chrome-accent);
}

.primary:hover {
  filter: brightness(1.05);
}
```

- [ ] **Step 3: Verify it renders without runtime errors**

Run (from `frontend/`): `npm run build`
Expected: build succeeds (the modal compiles; imports resolve). No test is added here — the modal is behavior-verified through Task 6.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/editor/AddSectionModal/
git commit -m "feat(sections): add AddSectionModal (name + layout choice)"
```

---

### Task 6: "Dodaj sekcję" button in the Sections panel

**Files:**
- Modify: `frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx` (import modal; read `addSection` from context; add local open state, a button, and the modal)
- Modify: `frontend/src/components/editor/SectionsPanel/SectionsPanel.module.css` (button styles)

**Interfaces:**
- Consumes: `addSection` from `PdfContext` (Task 4); `AddSectionModal` (Task 5).
- Produces: no new exported symbols (UI wiring only).

- [ ] **Step 1: Wire the button + modal into `SectionsPanel.jsx`**

Edit `frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx`:

(a) Update imports and the `use(PdfContext)` destructure:

```js
import { use, useEffect, useMemo, useState } from "react";
import AddSectionModal from "../AddSectionModal/AddSectionModal";
```

```js
  const {
    A4_Elements,
    setA4_Elements,
    pageSize,
    flowSpacing,
    setFlowSpacing,
    addSection,
  } = use(PdfContext);
```

(b) Add modal open state near the other hooks:

```js
  const [addModalOpen, setAddModalOpen] = useState(false);
```

(c) Add a confirm handler (place beside `applySpacing` / `move`):

```js
  function handleConfirmAddSection({ name, layout }) {
    addSection({ name, layout });
    setAddModalOpen(false);
  }
```

(d) In the JSX, add a "Dodaj sekcję" button directly under the intro `<p className={classes.hint}>…</p>` and before the `{sections.length === 0 ? …}` block:

```jsx
      <div className={classes.addRow}>
        <button
          type="button"
          className={classes.addButton}
          onClick={() => setAddModalOpen(true)}
        >
          + Dodaj sekcję
        </button>
      </div>
```

(e) Render the modal just before the panel's closing `</div>`:

```jsx
      <AddSectionModal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onConfirm={handleConfirmAddSection}
      />
```

- [ ] **Step 2: Add button styles**

Append to `frontend/src/components/editor/SectionsPanel/SectionsPanel.module.css`:

```css
.addRow {
  padding: 10px 14px 0;
  flex-shrink: 0;
}

.addButton {
  width: 100%;
  border: 1px dashed var(--chrome-border);
  border-radius: 8px;
  background: var(--chrome-control);
  color: var(--chrome-ink);
  font: 600 12px var(--font-body);
  padding: 9px 12px;
  cursor: pointer;
}

.addButton:hover {
  border-color: var(--chrome-accent);
  color: var(--chrome-accent);
}
```

- [ ] **Step 3: Manual verification in the running app**

Run (from `frontend/`): `npm run dev`, open a template-mode CV, open the Sections panel, click **+ Dodaj sekcję**.
Verify:
- The modal opens; entering a name + choosing **Nagłówek + treść** and confirming appends a new heading + rule + editable textarea at the end of the document, in the template's rhythm; the textarea is selected and ready to type.
- Choosing **Nagłówek + rekord** appends a heading + a four-line record (title/subtitle/meta/opis) at the end.
- The new heading appears in the panel's section list and can be reordered with ↑/↓.

- [ ] **Step 4: Verify build + lint**

Run (from `frontend/`):
```
npm run lint
npm run build
```
Expected: clean lint on changed files; successful build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/SectionsPanel/
git commit -m "feat(sections): add \"Dodaj sekcję\" button to the Sections panel"
```

---

### Task 7: Documentation (README EN + PL, Features)

**Files:**
- Modify: `README.md` (English + Polish sections: Features + Folder structure + any Sections-panel description)
- Verify line references against final files before writing them.

**Interfaces:** none (documentation only).

- [ ] **Step 1: Confirm the exact symbols and line ranges to cite**

Run (from repo root):
```
grep -n "export function deriveSectionStyle\|export function appendSectionAtEnd" frontend/src/utils/sectionStructure.js
grep -n "export function buildSectionElements\|export const SECTION_LAYOUTS" frontend/src/utils/sectionBuilder.js
grep -n "handleAddSection" frontend/src/hooks/useA4Elements.js
```
Record the reported line numbers for the Features entries.

- [ ] **Step 2: Add/refresh the "Add section" feature in both README languages**

In the **English** Features section, add (fill the line numbers from Step 1):

```markdown
### Add Section (structural editor)

Adds a new section to a template-mode CV from the Sections panel. A "Dodaj sekcję"
button opens a modal (section name + layout); the section is appended at the end of
the document in the template's governing rhythm and styled to match existing sections.
Two layouts ship today: a single content textarea ("aa") and an
education/experience-style record ("cc"). A columns layout ("bb") is planned.

Implementation:

- `frontend/src/utils/sectionStructure.js` — `deriveSectionStyle` (style sampling), `appendSectionAtEnd` (end placement)
- `frontend/src/utils/sectionBuilder.js` — `buildSectionElements`, `SECTION_LAYOUTS`
- `frontend/src/hooks/useA4Elements.js` — `handleAddSection`
- `frontend/src/components/editor/AddSectionModal/AddSectionModal.jsx` — modal UI
- `frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx` — "Dodaj sekcję" entry point

Tests:

- `frontend/src/utils/sectionStructure.test.js` — `deriveSectionStyle`, `appendSectionAtEnd`
- `frontend/src/utils/sectionBuilder.test.js` — `buildSectionElements`

Known limitations:

- Columns layout ("bb") is not yet available (requires horizontal-row support in the packer).
- The muted color for the record meta line is best-effort sampled.
```

Mirror the same content in the **Polish** section (translated, same substance), per the project's bilingual README rule.

- [ ] **Step 3: Update the folder-structure section**

Add the new files to the README's folder tree/description: `frontend/src/utils/sectionBuilder.js` and `frontend/src/components/editor/AddSectionModal/`.

- [ ] **Step 4: Verify no broken references**

Re-open each cited file and confirm the symbol names and approximate line ranges match. Fix any drift.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document add-section feature (EN + PL)"
```

---

## Self-Review

**1. Spec coverage** (`docs/superpowers/specs/2026-08-05-add-section-design.md`):
- §3 Architecture — style sampling → Task 1; construction → Task 3; placement → Task 2; handler → Task 4; context → Task 4; UI → Tasks 5–6. ✓
- §4 Data model (chrome `section-chrome`, body `content`, aa textarea `autoHeight`, cc four-line record sharing `flowGroup`, field-naming placeholders) → Task 3 (asserted in tests). ✓
- §5 Placement algorithm (flow bottom + `section` gap, `compactSectionStrip` forceTargets, chrome+first-body reservation, surgical/no-repack) → Task 2. ✓
- §6 UI/wiring (button in SectionsPanel, DialogShell modal with name + aa/cc, bb omitted, select+enter first body) → Tasks 4–6. ✓
- §7 Edge cases (no existing section defaults, near-page-bottom reservation, muted best-effort, template-mode gating) → Task 1 default test, Task 2 pagination reuse, Task 1 muted, Task 6 (panel is template-mode only). ✓
- §8 Testing → Tasks 1–3 unit tests; §9 Docs → Task 7. ✓
- §10 Out of scope (bb, add-record, clone) — not implemented, called out in modal + README. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code and test step has literal content. ✓

**3. Type consistency:** `deriveSectionStyle(elements, pageHeight)` → `SectionStyle` consumed by `buildSectionElements({ style })`; `buildSectionElements(...) → { elements, headingId, firstBodyId }` consumed by `handleAddSection` (uses `elements`, `firstBodyId`); `appendSectionAtEnd(elements, newElements, pageHeight, { spacing })` consumed by `handleAddSection`; `SECTION_LAYOUTS` used identically in builder, tests, and modal; `addSection` context key matches `AddSectionModal.onConfirm` payload `{ name, layout }`. Consistent across tasks. ✓
