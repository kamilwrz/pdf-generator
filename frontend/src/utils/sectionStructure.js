/**
 * Structural section helpers for template-mode editing.
 *
 * Prefer explicit `flowRole: "section-chrome"` headings. For older / untagged
 * generators (e.g. Cinder), fall back to short label text sitting just above
 * a horizontal rule — the usual section chrome pattern.
 *
 * Reorder does not slide clusters by a raw absolute delta. Multi-page sections
 * encode page-break dead space in their Y span; swapping that span overlaps
 * later content and leaves holes. Instead: compact each section, pack in the
 * new order from the flow start, then paginate with the same margins as
 * `textareaReflow` (pageTop 66 / bottomMargin 72).
 *
 * Structural packing (`placeStrip`) mirrors reflow keep-together rules:
 * section chrome is reserved with the full first `flowGroup` record (not only
 * the first body line), and later education/experience records tagged with
 * `flowGroup` never split across a page break during add/reorder/spacing.
 */

import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from "./flowSpacing.js";
import { parseFlatListItems } from "./flatSectionLayout.js";
import { isRecordOverlay } from "./textareaReflow.js";

/** Keep in sync with `textareaReflow.js` / backend CONTENT margins. */
const DEFAULT_PAGE_TOP = 66;
const DEFAULT_BOTTOM_MARGIN = 72;
/**
 * Gaps larger than this between consecutive section members are treated as
 * page-break waste (footer + next-page header) and collapsed while packing.
 */
const PAGE_BREAK_GAP_THRESHOLD = 40;
/**
 * Fallback clearance under the masthead divider when the authored
 * heading gap has been corrupted by an earlier pack (Nimbus uses 56,
 * solid-band templates like Cinder use ~32 — both sit in this band).
 */
const DEFAULT_MASTHEAD_CLEARANCE = 36;
/**
 * Iconic mastheads (Nova / Cardinal / Volt) author 8–18px under the divider;
 * Nimbus/Nova sit nearer 20–56px. Only gaps outside this window are treated
 * as corruption and replaced with DEFAULT_MASTHEAD_CLEARANCE.
 */
const MIN_AUTHORED_MASTHEAD_CLEARANCE = 6;
const MAX_AUTHORED_MASTHEAD_CLEARANCE = 56;

/**
 * Gap (px) between a sidebar photo well's bottom and the first rail section's
 * chrome band. Mirrors the generators' authored `sidebar_sections_start =
 * photo_bottom + 28` (Slate `slate.py`, Tessera `tessera.py`). Used as the
 * photo floor in `packSidebarLane` when a section is promoted to become the
 * rail's new first item, so the photo→heading clearance matches a freshly
 * generated document instead of collapsing to the tighter inter-section gap.
 * This is a fixed masthead-style clearance, not an inter-section rhythm, so it
 * deliberately does NOT scale with the document's density spacing.
 */
const SIDEBAR_PHOTO_SECTION_GAP = 28;

function absoluteTop(element, pageHeight = 842) {
  const page = Math.max(1, Math.trunc(Number(element?.page) || 1));
  return (page - 1) * pageHeight + (Number(element?.top) || 0);
}

function elementHeight(element) {
  const explicit = Number(element?.height);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const fontSize = Number(element?.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.35;
  return 12;
}

function absoluteBottom(element, pageHeight = 842) {
  return absoluteTop(element, pageHeight) + elementHeight(element);
}

function hasSectionRuleBelow(element, elements, pageHeight) {
  const abs = absoluteTop(element, pageHeight);
  const left = Number(element.left) || 0;
  return (elements || []).some((other) => {
    if (!other || other.fixedToPage) return false;
    if (other.category !== "line") return false;
    const width = Number(other.width) || 0;
    const height = Number(other.height) || 0;
    // Section underlines are wide and thin; page frames are full-bleed tall.
    if (width < 120 || height > 4) return false;
    const otherAbs = absoluteTop(other, pageHeight);
    const gap = otherAbs - abs;
    if (gap < 1 || gap > 32) return false;
    // Same visual column (Cinder rules start near the label left).
    const otherLeft = Number(other.left) || 0;
    return Math.abs(otherLeft - left) <= 40;
  });
}

/**
 * Whether this chrome text is a decorative ordinal badge ("01", "02", …),
 * not the section's real title.
 *
 * Prefer the explicit `isDecorativeChromeText` flag (backend Monument /
 * sectionBuilder). Also accept digit-only section-chrome labels as a safety
 * net when the flag was stripped on an older save/load path — otherwise
 * `listDocumentSections` treats every badge as its own section and
 * `applyFlowSpacing` tears the numbered chrome band apart.
 *
 * @param {object|null|undefined} element
 * @returns {boolean}
 */
export function isDecorativeOrdinalChrome(element) {
  if (!element) return false;
  if (element.isDecorativeChromeText) return true;
  if (element.flowRole !== "section-chrome") return false;
  if (element.category !== "text" && element.category !== "textarea") return false;
  // Monument ordinals are one or two digits; reject longer numeric titles.
  return /^\d{1,2}$/.test(String(element.content || "").trim());
}

/**
 * Snap Monument-style ordinal digits onto their section title baseline.
 *
 * Authored geometry places the filled 32px badge at heading−8 and both the
 * title and the "01"/"02"/… label at the same Y (badge+8). A legacy add-section
 * path treated `badgeNumber.relTop` as an inset into the square (`8`) instead
 * of an offset from the heading (`0`). After markers at −8 were normalised,
 * digits landed at square+16 — visibly too low inside the black rectangle
 * (seen on section "04" while "01"–"03" stayed correct).
 *
 * Only sections that still have a tall filled badge line are adjusted, so
 * templates without ordinal chrome are untouched.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {object[]}
 */
export function healDecorativeOrdinalBaselines(elements, pageHeight = 842) {
  const list = Array.isArray(elements) ? elements : [];
  if (list.length === 0) return list;

  const sections = listDocumentSections(list, pageHeight);
  if (sections.length === 0) return list;

  const fixes = new Map();
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const heading = list.find((element) => element.element_id === section.headingId);
    if (!heading) continue;
    const headingAbs = absoluteTop(heading, pageHeight);
    // Next section's band start (or EOF). Do not call `sectionElementIds` here —
    // that helper mutates stacked-body membership as a side effect and must not
    // run from a pure geometry heal used on every load / spacing pass.
    const nextStart = index + 1 < sections.length
      ? sections[index + 1].startAbs
      : Number.POSITIVE_INFINITY;
    const band = list.filter((element) => {
      if (!element || element.fixedToPage) return false;
      if (element.flowRole !== "section-chrome") return false;
      const abs = absoluteTop(element, pageHeight);
      // Monument badge/frame sit up to 8px above the title baseline.
      return abs >= headingAbs - 24 && abs < nextStart - 0.01;
    });
    const hasTallBadge = band.some((element) => (
      element.category === "line"
      && (Number(element.width) || 0) < 120
      && (Number(element.height) || 0) >= 20
    ));
    if (!hasTallBadge) continue;

    const headingTop = Number(heading.top) || 0;
    const headingPage = Number(heading.page) || 1;
    for (const element of band) {
      if (!isDecorativeOrdinalChrome(element)) continue;
      if ((Number(element.page) || 1) !== headingPage) continue;
      if (Math.abs((Number(element.top) || 0) - headingTop) <= 0.5) continue;
      fixes.set(element.element_id, headingTop);
    }
  }

  if (fixes.size === 0) return list;
  return list.map((element) => {
    if (!fixes.has(element.element_id)) return element;
    return { ...element, top: fixes.get(element.element_id) };
  });
}

/**
 * Whether this rectangle is a filled skill-chip pill (`mode="chips"`).
 * Language-grid cells also use `flowRole: "grid-member"` but they are
 * textareas, never filled rounded rectangles.
 */
function isSkillChipPill(element) {
  return Boolean(
    element
    && element.category === "rectangle"
    && element.flowRole === "grid-member"
    && element.filled === true
    && (Number(element.borderRadius) || 0) > 0,
  );
}

function isSkillChipLabel(element) {
  return Boolean(
    element
    && element.category === "text"
    && element.flowRole === "grid-member",
  );
}

/**
 * Snap skill-chip labels onto the optical midline of their pill.
 *
 * The generator used to store the label at `rect.top + CHIP_PAD_Y` (5px),
 * treating `top` as the em-box top. Canvas `.page-canvas p` uses
 * `line-height: 0` and PDF `renderText` places the baseline at `top + 0.34em`,
 * so the visible cap centre is near stored `top`. Labels therefore sat in the
 * upper half of every Cardinal pill. New fills use `rect.top + height/2`;
 * this heal rewrites documents saved with the old inset.
 *
 * @param {object[]} elements
 * @returns {object[]}
 */
export function healSkillChipLabelBaselines(elements) {
  const list = Array.isArray(elements) ? elements : [];
  if (list.length === 0) return list;

  const pills = list.filter(isSkillChipPill);
  if (pills.length === 0) return list;

  const fixes = new Map();
  for (let index = 0; index < list.length; index += 1) {
    const label = list[index];
    if (!isSkillChipLabel(label)) continue;
    const pill = pills.find((candidate) => {
      if ((candidate.flowGroup || null) !== (label.flowGroup || null)) return false;
      if ((Number(candidate.page) || 1) !== (Number(label.page) || 1)) return false;
      const left = Number(label.left) || 0;
      const top = Number(label.top) || 0;
      const pillLeft = Number(candidate.left) || 0;
      const pillWidth = Number(candidate.width) || 0;
      const pillTop = Number(candidate.top) || 0;
      const pillHeight = Number(candidate.height) || 0;
      // Label starts inside the pill (CHIP_PAD_X inset) and sits on the pill's
      // vertical span — including the legacy 5px inset from the top edge.
      if (left < pillLeft - 0.5 || left > pillLeft + pillWidth) return false;
      if (top < pillTop - 1 || top > pillTop + pillHeight) return false;
      return true;
    });
    if (!pill) continue;
    const centered = (Number(pill.top) || 0) + (Number(pill.height) || 0) / 2;
    if (Math.abs((Number(label.top) || 0) - centered) <= 0.5) continue;
    fixes.set(index, centered);
  }

  if (fixes.size === 0) return list;
  return list.map((element, index) => (
    fixes.has(index) ? { ...element, top: fixes.get(index) } : element
  ));
}

/**
 * Snap an outlier heading→rule gap back onto the value every sibling section
 * in the same lane already uses.
 *
 * A template's `section()` / `sidebar_kicker()` builder function stamps one
 * fixed heading→rule offset for EVERY section it renders (Sterling: heading
 * top + 20.7; Tessera's mosaic-tile clusters and Slate's badge clusters are
 * equally uniform), so within one lane every section is supposed to share the
 * same underline gap — regardless of how much decorative chrome surrounds it.
 * `compactChromeCluster` intentionally preserves whatever offset a section
 * already has, but it has no way to tell "authored" apart from "corrupted",
 * and it can even route two sections with the SAME shape down different
 * branches: a section transferred between the main column and the sidebar rail
 * (`transferSectionLane.js`) has its rule re-parked and, beside a wide-rule +
 * tall-tile pair (Tessera), takes the `explicitlyOwned` preserve branch while
 * its authored neighbours hit the `healthy` branch's Monument accent-rule
 * flatten — landing at a different gap and reading as an outlier underline.
 * This heal runs before every pack and rewrites any section whose underline
 * gap disagrees with the lane majority — restoring one canonical heading→rule
 * gap per lane. It identifies the underline as the widest THIN chrome line
 * (height <= 4), so it works for rich icon clusters too and never moves the
 * surrounding decorative chrome (tiles, badges, marks, icon glyphs).
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {object[]}
 */
export function healSimpleChromeRuleGaps(elements, pageHeight = 842) {
  const list = elements || [];
  if (list.length === 0) return list;
  const fixes = new Map();

  const healLane = (sections, memberIdsFor) => {
    const entries = [];
    const gapCounts = new Map();
    for (const section of sections) {
      const heading = list.find((element) => element.element_id === section.headingId);
      if (!heading) continue;
      const memberIds = memberIdsFor(section.headingId);
      const members = list.filter((element) => memberIds.has(element.element_id));
      // The section underline is a THIN chrome line (height <= 4). This heal
      // only ever moves that rule, never the surrounding decorative chrome, so
      // it is safe for rich icon clusters too (Tessera tile + rect + icon +
      // rule, Slate badge + rule, Monument badge + rule): those templates use
      // one section() builder, so every section shares one authored heading→rule
      // gap, and a section that disagrees is a genuine outlier (typically a
      // transferred section whose rule was re-parked through a different
      // compactChromeCluster branch than its freshly generated neighbours).
      // Decorative tiles are also `line` elements but are tall squares, excluded
      // by the height filter; when several thin lines exist the widest is the
      // underline (an accent tick is short; the rule spans the label / column).
      const ruleCandidates = members.filter((element) => (
        element.element_id !== heading.element_id
        && isChromeLike(element)
        && element.category === "line"
        && (Number(element.height) || 0) <= 4
      ));
      if (ruleCandidates.length === 0) continue;
      const rule = ruleCandidates.reduce((widest, element) => (
        (Number(element.width) || 0) > (Number(widest.width) || 0) ? element : widest
      ));
      const gap = Math.round(
        (absoluteTop(rule, pageHeight) - absoluteTop(heading, pageHeight)) * 100,
      ) / 100;
      entries.push({ heading, rule, gap });
      gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
    }
    if (entries.length < 2) return;
    let modeGap = null;
    let modeCount = 0;
    for (const [gap, count] of gapCounts) {
      if (count > modeCount) {
        modeGap = gap;
        modeCount = count;
      }
    }
    // Require at least two sections already agreeing before treating anything
    // as an outlier — with no majority there is no "canonical" gap to snap to.
    if (modeGap == null || modeCount < 2) return;
    for (const { heading, rule, gap } of entries) {
      if (Math.abs(gap - modeGap) < 0.5) continue;
      const headingAbs = absoluteTop(heading, pageHeight);
      const rulePage = Math.max(1, Math.trunc(Number(rule.page) || 1));
      const top = (headingAbs + modeGap) - (rulePage - 1) * pageHeight;
      fixes.set(rule.element_id, top);
    }
  };

  healLane(
    listDocumentSections(list, pageHeight),
    (headingId) => sectionElementIds(list, headingId, pageHeight),
  );
  healLane(
    listSidebarSections(list, pageHeight),
    (headingId) => sidebarSectionElementIds(list, headingId, pageHeight),
  );

  if (fixes.size === 0) return list;
  return list.map((element) => (
    fixes.has(element.element_id) ? { ...element, top: fixes.get(element.element_id) } : element
  ));
}

/**
 * Prefer the real section title inside a chrome cluster over a decorative
 * ordinal badge that may sort first in document order.
 * @param {object[]} chromeElements
 * @returns {object|undefined}
 */
function chromeTitleAnchor(chromeElements) {
  const titles = (chromeElements || []).filter((element) => (
    (element.category === "text" || element.category === "textarea")
    && !isDecorativeOrdinalChrome(element)
  ));
  if (titles.length === 0) {
    return (chromeElements || []).find((element) => (
      element.category === "text" || element.category === "textarea"
    )) || chromeElements?.[0];
  }
  // When several non-ordinal chrome labels exist, the longest is the title
  // (Monument: "WYKSZTAŁCENIE" vs a short accent word).
  return [...titles].sort((left, right) => (
    String(right.content || "").trim().length - String(left.content || "").trim().length
  ))[0];
}

/**
 * True when a short label sits on the same row as a masthead contact icon.
 * Untagged Nova/Cardinal phone/location text otherwise looks like a heading
 * because the wide masthead divider satisfies `hasSectionRuleBelow`.
 *
 * @param {object} element
 * @param {object[]} elements
 * @returns {boolean}
 */
function hasMastheadIconCompanion(element, elements) {
  const top = Number(element.top) || 0;
  const left = Number(element.left) || 0;
  const page = Number(element.page) || 1;
  return (elements || []).some((other) => {
    if (!other || other.flowRole !== "masthead") return false;
    if (other.category !== "image") return false;
    if ((Number(other.page) || 1) !== page) return false;
    if (Math.abs((Number(other.top) || 0) - top) > 2) return false;
    const otherLeft = Number(other.left) || 0;
    // Icon is drawn immediately left of its label (typical gap ≤ icon + pad).
    return otherLeft < left && left - otherLeft <= 40;
  });
}

/**
 * Whether this element is a section heading label.
 * @param {object|null|undefined} element
 * @param {object[]} [elements]
 * @param {number} [pageHeight=842]
 */
export function isSectionHeading(element, elements = [], pageHeight = 842) {
  if (!element || element.fixedToPage) return false;
  if (element.category !== "text" && element.category !== "textarea") return false;
  const content = String(element.content || "").trim();
  if (!content) return false;

  if (element.flowRole === "section-chrome") {
    // A template may tag more than one text element as chrome inside a single
    // section (Monument's numbered badge alongside its real title). Decorative
    // ordinals must not become their own sections.
    return !isDecorativeOrdinalChrome(element);
  }
  // Sidebar kickers use a dedicated role + lane (see `listSidebarSections`).
  // They must never enter the main-column section list: a false positive here
  // would let `sameColumnAsHeading` (evaluated from the kicker's left edge)
  // absorb the main column into a phantom sidebar section.
  if (element.flowRole === "sidebar-chrome" || element.flowLane === "sidebar") {
    return false;
  }
  // Explicit body / masthead copy is never a section title.
  if (element.flowRole === "content" || element.flowRole === "masthead") return false;
  if (element.autoHeight || element.flowGroup) return false;
  if (content.length > 56) return false;

  // Contact lines sit just above the Nimbus/Nova header rule and match
  // the legacy "short label + rule below" heuristic — reject them explicitly.
  if (content.includes("@")) return false;
  if ((content.match(/·/g) || []).length >= 1 && /\d/.test(content)) return false;
  // Phone-only masthead labels (Nova/Cardinal icon rows) have no @ / mid-dot.
  if (/^\+?\d[\d\s().\-/]{5,}$/.test(content)) return false;
  // Untagged education/experience period lines ("2011 – 2016") sit above the
  // next section rule after a pack and must not become phantom headings.
  if (/^\d{4}\s*[–—-]\s*(?:\d{4}|obecnie|present|now)\s*$/i.test(content)) {
    return false;
  }
  // Label sitting beside a masthead icon on the same row is contact chrome.
  if (hasMastheadIconCompanion(element, elements)) return false;

  const fontSize = Number(element.fontSize) || 12;
  // Masthead names are larger; body copy is usually autoHeight textareas.
  if (fontSize < 7 || fontSize > 11.5) return false;

  return hasSectionRuleBelow(element, elements, pageHeight);
}

/**
 * Absolute Y where a section's chrome band begins.
 *
 * Monument (and similar templates) place the badge square / title frame a few
 * pixels ABOVE the heading baseline. Using the heading top alone as the
 * section boundary lets the *next* section's pre-heading chrome fall into the
 * previous section's `[start, end)` range. Packing then treats those pieces as
 * stranded orphans and `rebuildTightChromeCluster` tears the authored title /
 * frame / badge offsets apart — titles appear to "leave" their decorative
 * frames after any full-document pack (`applyFlowSpacing`, add section, …).
 *
 * @param {object[]} elements
 * @param {object} heading
 * @param {number} pageHeight
 * @returns {number}
 */
function resolveSectionChromeBandStart(elements, heading, pageHeight) {
  const headingAbs = absoluteTop(heading, pageHeight);
  let bandStart = headingAbs;
  for (const element of elements || []) {
    if (!element || element.fixedToPage) continue;
    if (element.element_id === heading.element_id) continue;
    if (!isLeadingSectionMark(element)) continue;
    const abs = absoluteTop(element, pageHeight);
    // Same window as the leading-mark pull in `sectionElementIds`.
    if (abs >= headingAbs - 24 && abs < headingAbs - 0.01) {
      // Wide underlines belong to the nearest heading ABOVE them. When two
      // section titles stack within 24px on a continuation page, the previous
      // section's rule would otherwise become this heading's band start and
      // steal the earlier section's body during Y-interval membership.
      if (
        element.category === "line"
        && (Number(element.width) || 0) >= 120
      ) {
        continue;
      }
      bandStart = Math.min(bandStart, abs);
    }
  }
  return bandStart;
}

/**
 * List document sections in reading order.
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ id: string, title: string, headingId: string, startAbs: number, index: number }[]}
 */
export function listDocumentSections(elements, pageHeight = 842) {
  const list = elements || [];
  const headings = list
    .filter((element) => isSectionHeading(element, list, pageHeight))
    .sort((left, right) => absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight));

  return headings.map((heading, index) => ({
    id: heading.element_id,
    title: String(heading.content || "").trim(),
    headingId: heading.element_id,
    // Band start (not heading baseline) so pre-heading chrome belongs here.
    startAbs: resolveSectionChromeBandStart(list, heading, pageHeight),
    index,
  }));
}

/**
 * Small marks/icons that may sit a few px above the heading baseline.
 * Wide untagged rules are NOT included — those are masthead dividers
 * (Nimbus/Nova) and absorbing them into the section chrome cluster
 * pushes the heading down on the next pack.
 */
function isLeadingSectionMark(element) {
  if (!element) return false;
  if (element.flowRole === "section-chrome" || element.flowRole === "sidebar-chrome") {
    return true;
  }
  if (element.category === "rectangle" || element.category === "circle") {
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;
    return height <= 40 && width <= 40;
  }
  if (element.category === "image") {
    return Boolean(element.alignWithText)
      || /\/template-assets\/iconic\//.test(String(element.src || ""));
  }
  return false;
}

/**
 * Two-column templates (Tessera, Slate, Harbor, Sterling — `layouts: ["sidebar", …]`)
 * place a narrow rail beside the main content column. Sidebar kickers are
 * tagged `flowRole: "sidebar-chrome"` + `flowLane: "sidebar"` (see e.g.
 * `tessera.py` `sidebar_heading()` / `sidebar_kicker()`), so
 * `isSectionHeading` never promotes them into the main section list. Without
 * the column check below, every Y-only sweep (section membership,
 * masthead-bottom detection, flow-bottom detection, insert "hole" shifting)
 * would silently absorb untagged sidebar bodies into whichever main-column
 * section shared their Y band. `packDocumentSections`'s single shared vertical
 * cursor would then linearly restack those captured elements into the main
 * flow, scrambling the two-column layout on every add-section / rhythm-change.
 * Density knobs re-pack the sidebar through a separate lane cursor in
 * `packSidebarLane` (called from `applyFlowSpacing`).
 *
 * The check is intentionally one-directional: reject a candidate only when
 * it sits well to the LEFT of the section's own heading, never when it sits
 * to the right. Single-column templates park chrome far to the RIGHT of a
 * narrow-left heading routinely (Cinder's marker at left=526 vs heading
 * left=76; Monument's accent rule at left=369 vs heading left=118) — a
 * symmetric/bidirectional column split misclassifies those as a second
 * column and tears the chrome cluster apart. Leftward chrome belonging to
 * the SAME section (Monument's badge/frame sit up to ~50px left of the
 * title) never approaches the real sidebar gap, so `SIDEBAR_LEFT_GAP` clears
 * both cases with comfortable margin.
 */
const SIDEBAR_LEFT_GAP = 150;

/**
 * Predicate for "not a different (sidebar) column from `headingLeft`".
 *
 * An element is a different column only when it sits well to the LEFT of the
 * heading AND does not reach the heading horizontally (its right edge stops
 * before the heading's left). This holds for a real sidebar rail (narrow, ends
 * far left of the main heading) but NOT for a full-width body sitting under a
 * *centered* heading: such a body starts left of the centered heading yet
 * extends across and past it, so it stays in-column. Testing against the
 * heading's left edge alone is enough — a same-column body always overlaps or
 * passes that edge — and needs no heading width (unknown for `text` headings).
 *
 * @param {number} headingLeft
 * @returns {(element: {left?: number, width?: number}) => boolean}
 */
function sameColumnAsHeading(headingLeft) {
  return (element) => {
    const left = Number(element?.left) || 0;
    if (headingLeft - left <= SIDEBAR_LEFT_GAP) return true;
    const right = left + (Number(element?.width) || 0);
    return right > headingLeft;
  };
}

/**
 * True when an element is section body (not heading / chrome / masthead).
 */
function isSectionBodyElement(element, elements, pageHeight) {
  if (!element || element.fixedToPage) return false;
  if (element.flowRole === "masthead") return false;
  if (isSectionHeading(element, elements, pageHeight)) return false;
  if (element.flowRole === "section-chrome") return false;
  if (isChromeLike(element)) return false;
  return true;
}

/**
 * When two headings stack on a continuation page with no body between them,
 * the later section's Y-interval swallows the earlier body. Move the first
 * surplus body group (and any chrome closer to the earlier heading) back.
 *
 * Only runs when the earlier section is chrome-only and the later one has at
 * least two bodies — a deliberately empty section with one following body is
 * left alone.
 */
function healStackedSectionBodies(elements, sections, membersByHeading, pageHeight) {
  const list = elements || [];
  for (let index = 0; index < sections.length - 1; index += 1) {
    const current = sections[index];
    const next = sections[index + 1];
    const heading = list.find((element) => element.element_id === current.headingId);
    const nextHeading = list.find((element) => element.element_id === next.headingId);
    if (!heading || !nextHeading) continue;

    const headingGap = absoluteTop(nextHeading, pageHeight) - absoluteTop(heading, pageHeight);
    if (headingGap > 48) continue;

    const currentIds = membersByHeading.get(current.headingId);
    const nextIds = membersByHeading.get(next.headingId);
    if (!currentIds || !nextIds) continue;

    const currentBodies = [...currentIds]
      .map((id) => list.find((element) => element.element_id === id))
      .filter((element) => isSectionBodyElement(element, list, pageHeight));
    if (currentBodies.length > 0) continue;

    const nextBodies = [...nextIds]
      .map((id) => list.find((element) => element.element_id === id))
      .filter((element) => isSectionBodyElement(element, list, pageHeight))
      .sort((left, right) => absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight));
    if (nextBodies.length < 2) continue;

    const firstBody = nextBodies[0];
    const group = typeof firstBody.flowGroup === "string" ? firstBody.flowGroup : null;
    const movedBodies = group
      ? nextBodies.filter((element) => element.flowGroup === group)
      : [firstBody];
    for (const element of movedBodies) {
      nextIds.delete(element.element_id);
      currentIds.add(element.element_id);
    }

    // Reclaim underline / chip / icon that sit closer to the earlier heading.
    const headingAbs = absoluteTop(heading, pageHeight);
    const nextAbs = absoluteTop(nextHeading, pageHeight);
    for (const id of [...nextIds]) {
      const element = list.find((item) => item.element_id === id);
      if (!element || element.element_id === next.headingId) continue;
      if (!isLeadingSectionMark(element) && element.flowRole !== "section-chrome") {
        continue;
      }
      if (isSectionHeading(element, list, pageHeight)) continue;
      const abs = absoluteTop(element, pageHeight);
      if (Math.abs(abs - headingAbs) + 0.01 < Math.abs(abs - nextAbs)) {
        nextIds.delete(id);
        currentIds.add(id);
      }
    }
  }
}

/**
 * Collect element ids belonging to the section that starts at `headingId`
 * (heading + chrome nearby + content until the next section heading).
 * Cross-column elements (a sidebar rail sharing the same Y band as a
 * main-column section) are excluded — see the column-detection doc above.
 */
export function sectionElementIds(elements, headingId, pageHeight = 842) {
  const list = elements || [];
  const sections = listDocumentSections(list, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return new Set();

  // Build every section's membership once so stacked-heading healing can move
  // bodies between neighbours without a second inconsistent Y sweep.
  const membersByHeading = new Map(
    sections.map((section) => [section.headingId, new Set()]),
  );

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const start = section.startAbs;
    const end = sectionIndex + 1 < sections.length
      ? sections[sectionIndex + 1].startAbs
      : Number.POSITIVE_INFINITY;
    const heading = list.find((element) => element.element_id === section.headingId);
    const isSameColumn = sameColumnAsHeading(Number(heading?.left) || 0);
    const ids = membersByHeading.get(section.headingId);

    for (const element of list) {
      if (element.fixedToPage) continue;
      if (element.flowRole === "masthead") continue;
      // Explicit sidebar lane (Tessera / Slate / Harbor / Sterling) never joins
      // a main-column strip — including right-rail Harbor bodies that sit to
      // the RIGHT of the main heading and would otherwise pass the one-way
      // `sameColumnAsHeading` check.
      if (isSidebarLaneElement(element)) continue;
      if (!isSameColumn(element)) continue;
      // Another section's title must never join this strip — that is what made
      // Volt chips from a later band attach to an earlier heading and explode
      // chrome relTop across a whole page.
      if (
        isSectionHeading(element, list, pageHeight)
        && element.element_id !== section.headingId
      ) {
        continue;
      }

      const abs = absoluteTop(element, pageHeight);
      const isNextSectionLeadingChrome = sectionIndex + 1 < sections.length
        && element.flowRole === "section-chrome"
        && abs >= end - 4
        && abs < end;
      // Midline rules and icons may start fractionally above their own title.
      // Do not let the preceding section claim that explicit chrome merely
      // because its top is still below the next heading's numerical boundary.
      if (isNextSectionLeadingChrome) continue;
      if (abs >= start && abs < end - 0.01) {
        ids.add(element.element_id);
        continue;
      }
      // Only tagged chrome / small marks may sit slightly above the heading.
      // Never pull the wide previous-section underline into this band.
      if (abs >= start - 24 && abs < start && isLeadingSectionMark(element)) {
        // A midline rule can begin fractionally above the heading's stored top
        // because its rectangle is centred on the visible capitals. Explicit
        // ownership plus a tight 4 px window distinguishes that rule from a
        // wide underline belonging to the previous section. Keeping it in the
        // section lets Add section sample the exact right edge and chrome/body
        // rhythm instead of silently falling back to rule-less defaults.
        if (
          element.flowRole === "section-chrome"
          && abs >= start - 4
        ) {
          ids.add(element.element_id);
          continue;
        }
        if (element.category === "line" && (Number(element.width) || 0) >= 120) {
          continue;
        }
        ids.add(element.element_id);
      }
    }
  }

  healStackedSectionBodies(list, sections, membersByHeading, pageHeight);
  return membersByHeading.get(headingId) || new Set();
}

/**
 * Sections eligible for the inline/bullet-list layout toggle: exactly one
 * non-chrome `textarea` body element, whose content currently parses into at
 * least two items. Record-style sections (Experience, Education, Projects, …)
 * have multiple per-entry blocks (title + meta + bullets, repeated) and are
 * excluded automatically by the "exactly one" rule. The item-count check
 * additionally excludes single-paragraph sections such as Summary — those
 * also happen to be exactly one textarea, but splitting prose on a mid-dot
 * that never appears in it produces one meaningless "item", not a real list.
 * Neither check relies on section-name matching, so a user's own custom
 * section title still qualifies as long as its body is a genuine flat list.
 *
 * Returns `{ headingId, contentElementId }` pairs; callers key their anchor
 * map by `contentElementId` since the toggle icon is anchored to the content
 * block, not the heading (see `SectionRecordAdd` for the heading-anchored
 * equivalent).
 */
export function listFlatSectionAnchors(elements, pageHeight = 842) {
  const list = elements || [];
  const sections = listDocumentSections(list, pageHeight);
  const anchors = [];
  for (const section of sections) {
    const memberIds = sectionElementIds(list, section.headingId, pageHeight);
    const bodyTextareas = list.filter((element) => (
      memberIds.has(element.element_id)
      && element.category === "textarea"
      && !element.fixedToPage
      && element.flowRole !== "section-chrome"
    ));
    if (bodyTextareas.length !== 1) continue;
    const [content] = bodyTextareas;
    const items = parseFlatListItems(content.content, Boolean(content.bulletList));
    if (items.length < 2) continue;
    anchors.push({
      headingId: section.headingId,
      contentElementId: content.element_id,
    });
  }
  return anchors;
}

/**
 * True when the masthead uses Iconic contact glyphs (Nova / Cardinal / Volt /
 * Harbor). Those templates author a tight 8–18px band under the divider; the
 * 36px default masthead fallback is never intentional for them.
 */
function hasIconicMasthead(elements) {
  return (elements || []).some((element) => (
    element
    && !element.fixedToPage
    && element.category === "image"
    && (element.flowRole === "masthead" || Boolean(element.alignWithText))
    && /\/template-assets\/iconic\//.test(String(element.src || ""))
  ));
}

/**
 * True when the masthead centers its name / title block (Portico's "Ivy League"
 * header). Such mastheads author a deliberate ~36px clearance under the divider
 * and must be exempt from the iconic heal-back below, which collapses the
 * over-authored 36px of the tight LEFT-aligned iconic mastheads (Nova / Cardinal
 * / Volt / Harbor) down to 10px.
 */
function hasCenteredMasthead(elements) {
  return (elements || []).some((element) => (
    element
    && !element.fixedToPage
    && element.flowRole === "masthead"
    && element.category === "textarea"
    && element.align === "center"
  ));
}

/**
 * Absolute Y where the first flow section should start, anchored under the
 * masthead so corrupted heading positions cannot open a large white gap
 * (Nimbus) or climb into the header band.
 */
function resolveFlowStart(elements, sections, pageHeight) {
  const list = elements || [];
  const headingStart = Math.min(...sections.map((section) => section.startAbs));
  const firstHeading = list.find((element) => element.element_id === sections[0]?.headingId);
  const isSameColumn = sameColumnAsHeading(Number(firstHeading?.left) || 0);
  // Explicit midline chrome can begin a fraction of a pixel above the title's
  // stored top. Start packing from that true band edge; compactChromeCluster
  // normalizes the minimum offset to zero, so this keeps the heading itself at
  // its authored coordinate instead of nudging it down by the negative offset.
  const leadingChromeStart = list.reduce((min, element) => {
    if (!element || element.fixedToPage) return min;
    if (element.flowRole !== "section-chrome") return min;
    if (!isSameColumn(element)) return min;
    const abs = absoluteTop(element, pageHeight);
    if (abs < headingStart - 4 || abs >= headingStart) return min;
    return Math.min(min, abs);
  }, headingStart);
  let mastheadBottom = 0;
  for (const element of list) {
    if (!element || element.fixedToPage) continue;
    if (element.flowRole === "section-chrome") continue;
    if (isSidebarLaneElement(element)) continue;
    // A masthead photo well/frame/glyph never needs to count directly here:
    // templates that author their closing rule/divider from the photo's own
    // height (Nova: `header_rule_y = masthead_bottom + 18`, where
    // `masthead_bottom` already factors in the photo) place that divider AT
    // OR BELOW the photo's bottom by construction, so the divider element
    // (still counted below) always dominates — excluding the photo itself
    // changes nothing for them. Templates whose masthead photo sits in a
    // different column from the name/title stack entirely (Vestige: name in
    // the main column, photo flush against the page's right margin) have no
    // such relationship, and a short/title-less masthead could otherwise let
    // the photo alone decide "how tall is the masthead" here.
    if (element.photoSlot) continue;
    if (!isSameColumn(element)) continue;
    const abs = absoluteTop(element, pageHeight);
    if (abs >= headingStart - 0.01) continue;
    mastheadBottom = Math.max(mastheadBottom, absoluteBottom(element, pageHeight));
  }
  if (mastheadBottom <= 0) return leadingChromeStart;

  const authoredGap = leadingChromeStart - mastheadBottom;
  // Preserve whatever clearance the template authored, as long as it is sane.
  // The Python generators author ~36px under the divider for iconic templates
  // (Nova / Cardinal / Volt / Harbor / Portico) via SPACE_AFTER_HEADER_RULE, and
  // the static starter arrays author as little as ~8px — BOTH are legitimate.
  // An earlier version collapsed any 28–40px iconic gap down to 10px on every
  // pack, which meant reordering a section yanked the whole document up ~26px
  // because the generated 36px clearance was destroyed. We only recompute the
  // clearance when the authored gap is out of range (a prior pack left a huge
  // white band or an overlap) — a sane authored gap is always kept as-is.
  if (
    authoredGap >= MIN_AUTHORED_MASTHEAD_CLEARANCE
    && authoredGap <= MAX_AUTHORED_MASTHEAD_CLEARANCE
  ) {
    return mastheadBottom + authoredGap;
  }
  // Corruption recovery only: a tight LEFT-aligned iconic masthead (Nova /
  // Cardinal / Volt / Harbor) recovers to a tight clearance; a centered "Ivy
  // League" masthead (Portico) and non-iconic templates (Nimbus / Monument) use
  // the wider default. `hasCenteredMasthead` keeps Portico out of the tight band.
  const tightIconic = hasIconicMasthead(list) && !hasCenteredMasthead(list);
  return mastheadBottom + (
    tightIconic ? 10 : DEFAULT_MASTHEAD_CLEARANCE
  );
}

/**
 * Bottom edge of the rail's own photo/portrait well sitting above
 * `firstHeading`, or `null` when the rail has none.
 *
 * `resolveFlowStart` deliberately skips `fixedToPage` elements when it sizes
 * the MAIN column's masthead clearance (that decoration doesn't participate
 * in main's flow). Templates whose sidebar rail starts under its own photo
 * well (Slate, Tessera) need the opposite: that photo IS the thing the rail
 * must clear, and it can sit well below where the main column's (usually
 * shorter) masthead ends — see `packSidebarLane`.
 *
 * CRITICAL: match ONLY genuine photo-slot elements (`photoSlot` = frame /
 * glyph / ornament / image), never arbitrary `fixedToPage` decoration. Every
 * sidebar template also paints a full-height `fixedToPage` background panel
 * (Slate `_line(0, 0, side_width, A4_H)`) and page paper; those live in the
 * same column and start above the heading, so keying off `fixedToPage` alone
 * returned the PAGE bottom (842) and shoved the whole rail off page 1. Photo
 * slots are always bounded boxes, so `photoSlot` is the precise, safe filter.
 */
// Widest real sidebar rail across every two-column template (Sterling 210 pt)
// plus margin. `sameColumnAsHeading` is deliberately biased to treat anything
// at or to the right of a heading as "same column" (single-column templates
// park chrome far right of a narrow heading), which is the wrong bias here:
// Vestige's masthead photo slot sits at left=505, in the MAIN column, far to
// the right of the sidebar's own heading — `sameColumnAsHeading` alone would
// wrongly count it as the rail's own photo. A rail's own photo well is always
// physically inside the narrow rail, so bound the candidate's own left
// (from the page edge, not the heading) to rule out a main-column photo
// regardless of how the heading happens to be positioned.
const SIDEBAR_PHOTO_MAX_LEFT = 260;

function resolveSidebarPhotoFloor(elements, firstHeading, pageHeight) {
  if (!firstHeading) return null;
  const isSameColumn = sameColumnAsHeading(Number(firstHeading.left) || 0);
  const headingAbs = absoluteTop(firstHeading, pageHeight);
  let photoBottom = 0;
  for (const element of elements || []) {
    if (!element || !element.photoSlot) continue;
    if ((Number(element.left) || 0) > SIDEBAR_PHOTO_MAX_LEFT) continue;
    if (!isSameColumn(element)) continue;
    const abs = absoluteTop(element, pageHeight);
    if (abs >= headingAbs) continue;
    photoBottom = Math.max(photoBottom, absoluteBottom(element, pageHeight));
  }
  return photoBottom > 0 ? photoBottom : null;
}

/**
 * True when the element belongs to a two-column sidebar rail.
 * Generators stamp `flowLane: "sidebar"` on every rail element; chrome also
 * carries `flowRole: "sidebar-chrome"` as a belt-and-suspenders signal when
 * `flowLane` was stripped by an older save/load path.
 */
export function isSidebarLaneElement(element) {
  if (!element) return false;
  if (element.flowLane === "sidebar") return true;
  return element.flowRole === "sidebar-chrome";
}

/**
 * Recover rail body that lost `flowLane` after save/reload (older packs only
 * persisted `flowRole` / `flowGroup`). Kickers still identify the column via
 * `sidebar-chrome`; body copy / skill chips sit near that kicker's left edge
 * and must travel with it on reorder — otherwise only titles move.
 *
 * Main-column content starts well to the right of Tessera/Slate/Harbor
 * kickers (~218+ vs ~51), so a modest right limit around the kicker keeps
 * the recovery from vacuuming the main flow.
 *
 * @param {object} element
 * @param {object} heading - Sidebar kicker for this section
 * @returns {boolean}
 */
function isOrphanedSidebarRailBody(element, heading) {
  if (!element || !heading) return false;
  if (element.fixedToPage) return false;
  if (element.flowRole === "masthead" || element.flowRole === "section-chrome") {
    return false;
  }
  if (isSidebarSectionHeading(element) && element.element_id !== heading.element_id) {
    return false;
  }
  // Explicitly tagged rail elements are handled by `isSidebarLaneElement`.
  if (isSidebarLaneElement(element)) return false;

  const role = element.flowRole;
  const looksLikeBody = role === "content"
    || role === "grid-member"
    || role == null
    || role === undefined;
  if (!looksLikeBody) return false;

  const left = Number(element.left) || 0;
  const headingLeft = Number(heading.left) || 0;
  // Rail bodies share the kicker column; main-column blocks start ~150px+ right.
  if (left > headingLeft + 140) return false;
  if (left > 200) return false;
  return true;
}

/**
 * Whether this text element is a sidebar section kicker (not a main heading).
 */
export function isSidebarSectionHeading(element) {
  if (!element || element.fixedToPage) return false;
  if (element.flowRole !== "sidebar-chrome") return false;
  if (element.category !== "text" && element.category !== "textarea") return false;
  const content = String(element.content || "").trim();
  if (!content) return false;
  return !isDecorativeOrdinalChrome(element);
}

/**
 * List sidebar-lane sections in reading order.
 * Independent from `listDocumentSections` — the main packer never sees these
 * ids. Structural add / reorder / remove use this list with `packSidebarLane`.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ id: string, title: string, headingId: string, startAbs: number, index: number }[]}
 */
export function listSidebarSections(elements, pageHeight = 842) {
  const list = elements || [];
  const headings = list
    .filter((element) => isSidebarSectionHeading(element))
    .sort((left, right) => absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight));

  return headings.map((heading, index) => ({
    id: heading.element_id,
    title: String(heading.content || "").trim(),
    headingId: heading.element_id,
    startAbs: resolveSectionChromeBandStart(list, heading, pageHeight),
    index,
  }));
}

/**
 * Collect element ids belonging to one sidebar section (kicker chrome + body
 * until the next sidebar kicker). Membership is lane-tagged, not geometric —
 * so a right-rail Harbor section cannot steal main-column content.
 */
export function sidebarSectionElementIds(elements, headingId, pageHeight = 842) {
  const list = elements || [];
  const sections = listSidebarSections(list, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return new Set();

  const heading = list.find((element) => element.element_id === headingId);
  const start = sections[index].startAbs;
  const end = index + 1 < sections.length
    ? sections[index + 1].startAbs
    : Number.POSITIVE_INFINITY;
  const ids = new Set();

  for (const element of list) {
    if (!element || element.fixedToPage) continue;
    if (element.flowRole === "masthead") continue;
    const taggedRail = isSidebarLaneElement(element);
    const orphanedRail = !taggedRail && isOrphanedSidebarRailBody(element, heading);
    if (!taggedRail && !orphanedRail) continue;
    if (
      isSidebarSectionHeading(element)
      && element.element_id !== headingId
    ) {
      continue;
    }

    const abs = absoluteTop(element, pageHeight);
    if (abs >= start && abs < end - 0.01) {
      ids.add(element.element_id);
      continue;
    }
    // Icon tiles / short rules may start a few px above the kicker baseline.
    if (
      abs >= start - 24
      && abs < start
      && (element.flowRole === "sidebar-chrome" || isLeadingSectionMark(element))
    ) {
      ids.add(element.element_id);
    }
  }
  return ids;
}

/**
 * Re-pack every sidebar-lane section with the same SPACE_* rhythm as the main
 * column, using an independent vertical cursor that never touches main flow.
 *
 * Anchors the rail at the topmost authored chrome-band top so density changes
 * and reorders cannot yank the rail up under the masthead / photo. Later
 * kickers stack with `spacing.section`; intra-section gaps use after_rule /
 * stack / record.
 *
 * When `orderedHeadingIds` is provided, strips are packed in that order
 * (membership is still resolved from current Y geometry, matching
 * `packDocumentSections`).
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @param {{ pageTop?: number, bottomMargin?: number, spacing?: object, forceTargets?: boolean, orderedHeadingIds?: string[]|null }} [options]
 * @returns {object[]}
 */
export function packSidebarLane(
  elements,
  pageHeight = 842,
  {
    pageTop = DEFAULT_PAGE_TOP,
    bottomMargin = DEFAULT_BOTTOM_MARGIN,
    spacing,
    forceTargets = true,
    orderedHeadingIds = null,
  } = {},
) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const list = elements || [];
  const sections = listSidebarSections(list, pageHeight);
  if (sections.length === 0) return list;

  const byHeading = new Map(sections.map((section) => [section.headingId, section]));
  const order = orderedHeadingIds?.length
    ? orderedHeadingIds.map((headingId) => byHeading.get(headingId)).filter(Boolean)
    : sections;
  if (order.length === 0) return list;

  const memberIds = new Set();
  const strips = order.map((section) => {
    const ids = sidebarSectionElementIds(list, section.headingId, pageHeight);
    ids.forEach((id) => memberIds.add(id));
    const members = list.filter((element) => ids.has(element.element_id));
    return compactSectionStrip(members, pageHeight, rhythm, forceTargets);
  });

  // Anchor from the current topmost kicker (Y order), not the first heading of
  // a reorder — otherwise moving the bottom section up would drag the whole
  // rail under the masthead. When that kicker sits well below the main-column
  // content top (hole after moving Summary / another top rail section into
  // main), pull the rail up to `resolveFlowStart` so remaining sections close
  // the gap while keeping authored section gaps.
  const railAnchor = sections[0];
  const firstHeading = list.find((element) => element.element_id === railAnchor.headingId);
  const authoredRailTop = firstHeading
    ? resolveSectionChromeBandStart(list, firstHeading, pageHeight)
    : railAnchor.startAbs;
  const mainSections = listDocumentSections(list, pageHeight);
  let cursorAbs = authoredRailTop;
  if (mainSections.length > 0) {
    const mainStart = resolveFlowStart(list, mainSections, pageHeight);
    // Never push the rail down; only close holes above the first remaining kicker.
    cursorAbs = Math.min(authoredRailTop, mainStart);
  }
  // `mainStart` reflects the MAIN column's masthead, which can end well above
  // the rail's own fixed photo/portrait well (Slate: main content starts at
  // y=119, the photo frame ends at y=166). Without this floor, promoting a
  // section to be the rail's new first item (after the section that used to
  // sit under the photo is transferred out, or one transferred back from the
  // main column) pulls it up under `mainStart` and crowds — or overlaps — the
  // photo. Clamp back down to the photo's bottom plus the generators' authored
  // photo→first-section gap, so the clearance matches a freshly generated
  // document rather than the tighter inter-section rhythm.
  const photoFloor = resolveSidebarPhotoFloor(list, firstHeading, pageHeight);
  if (photoFloor != null) {
    cursorAbs = Math.max(cursorAbs, photoFloor + SIDEBAR_PHOTO_SECTION_GAP);
  }

  const placedById = new Map();
  strips.forEach((strip, stripIndex) => {
    if (strip.length === 0) return;
    if (stripIndex > 0) cursorAbs += rhythm.section;
    const { placedById: stripPlaced, bottomAbs } = placeStrip(
      strip, cursorAbs, pageHeight, pageTop, bottomMargin,
    );
    for (const [id, element] of stripPlaced) placedById.set(id, element);
    cursorAbs = bottomAbs;
  });

  return list.map((element) => {
    if (!memberIds.has(element.element_id)) return element;
    return placedById.get(element.element_id) || element;
  });
}

function isChromeLike(element) {
  if (!element) return false;
  if (element.flowRole === "section-chrome" || element.flowRole === "sidebar-chrome") {
    return true;
  }
  // A short skill label ("SQL", "Go") produces a chip pill narrower than the
  // decorative-badge size heuristic below (<=40x40), which would otherwise
  // misclassify it as chrome and route it through the chrome cluster instead
  // of the grid-aware body path in `compactSectionStrip`/`placeStrip`.
  if (isGridMember(element)) return false;
  if (element.category === "line") {
    return (Number(element.height) || 0) <= 4;
  }
  if (element.category === "rectangle" || element.category === "circle") {
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;
    return height <= 40 && width <= 40;
  }
  if (element.category === "image") {
    return Boolean(element.alignWithText)
      || /\/template-assets\/iconic\//.test(String(element.src || ""));
  }
  return false;
}

/**
 * Classify the gap between two consecutive members of the same section.
 * @returns {"after_rule"|"stack"|"record"}
 */
function classifyIntraSectionGap(previous, next) {
  const prevChrome = isChromeLike(previous);
  const nextChrome = isChromeLike(next);
  if (prevChrome && !nextChrome) return "after_rule";
  if (prevChrome && nextChrome) return "stack";

  const groupA = typeof previous.flowGroup === "string" ? previous.flowGroup : null;
  const groupB = typeof next.flowGroup === "string" ? next.flowGroup : null;
  if (groupA && groupB && groupA === groupB) return "stack";
  if (groupA || groupB) return "record";

  // Untagged legacy stacks (degree → school) stay tight; distinct blocks use record.
  const prevH = elementHeight(previous);
  const nextH = elementHeight(next);
  if (prevH <= 22 && nextH <= 22 && !previous.autoHeight && !next.autoHeight) {
    return "stack";
  }
  return "record";
}

function targetGap(kind, spacing) {
  if (kind === "after_rule") return spacing.after_rule;
  if (kind === "stack") return spacing.stack;
  return spacing.record;
}

function sortByReadingOrder(elements, pageHeight) {
  return [...elements].sort((left, right) => {
    const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
    if (Math.abs(topDelta) > 0.01) return topDelta;
    return (Number(left.left) || 0) - (Number(right.left) || 0);
  });
}

/**
 * Whether chrome members still form an authored cluster (overlap / flush rule)
 * rather than a corrupted vertical stack from an earlier forceTargets pack.
 */
function chromeClusterIsHealthy(chromeElements, pageHeight) {
  if (chromeElements.length <= 1) return true;
  const sorted = sortByReadingOrder(chromeElements, pageHeight);
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = absoluteTop(sorted[index], pageHeight)
      - absoluteBottom(sorted[index - 1], pageHeight);
    // Template chrome overlaps (mark on heading) or sits flush (Builder.line).
    // A strictly positive gap between every pair means SPACE_STACK tore it apart.
    if (gap < 1) return true;
  }
  return false;
}

/**
 * Rebuild heading / rule / marker into the classic tight band used by Cinder,
 * Nimbus, Monument, etc.: heading at 0, marks near +2, wide rule flush under label.
 *
 * @returns {{ element: object, relTop: number }[]}
 */
function rebuildTightChromeCluster(chromeElements) {
  // Never anchor the band on a Monument ordinal badge — that parks the real
  // title and the filled square below the digits and looks like a "reset 01".
  const heading = chromeTitleAnchor(chromeElements);
  const headingHeight = elementHeight(heading);
  const items = [{ element: heading, relTop: 0 }];

  for (const element of chromeElements) {
    if (element === heading) continue;
    const width = Number(element.width) || 0;
    if (element.category === "line" && width >= 120) {
      // Builder.line paints flush under the label. Monument's accent rule is
      // different: it sits mid-band beside a tall badge (~title+7), not under it.
      const tallBadge = chromeElements.some((piece) => (
        piece !== element
        && piece.category === "line"
        && (Number(piece.width) || 0) < 120
        && elementHeight(piece) >= 20
      ));
      items.push({
        element,
        relTop: tallBadge ? 7 : headingHeight,
      });
    } else if (
      element.category === "rectangle"
      || element.category === "circle"
      || element.category === "image"
    ) {
      const height = elementHeight(element);
      // Wide title frames (Monument ~251×32) share the badge band above the
      // label — not the +2 mark offset used for small Cinder dots.
      if (width > 40 && height >= 20) {
        items.push({
          element,
          relTop: Math.min(0, headingHeight - height + 8),
        });
      } else {
        items.push({ element, relTop: 2 });
      }
    } else if (element.category === "line") {
      // Short accent rules / filled badge squares belonging to the chrome band.
      // Keep tall badge blocks overlapping the title (Monument 32px square).
      const height = elementHeight(element);
      items.push({
        element,
        relTop: height >= 20 ? Math.min(0, headingHeight - height + 8) : Math.max(0, headingHeight - 1),
      });
    } else if (isDecorativeOrdinalChrome(element)) {
      // Digits sit on the badge square, level with the title baseline.
      items.push({ element, relTop: 0 });
    } else {
      items.push({ element, relTop: headingHeight });
    }
  }

  return items.sort((left, right) => left.relTop - right.relTop
    || (Number(left.element.left) || 0) - (Number(right.element.left) || 0));
}

/**
 * Rebuild the heading / rule / marker band.
 *
 * Decorative chrome must keep its authored mutual offsets (Cinder's mark sits
 * on the heading line; the rule sits flush under the label). Forcing SPACE_STACK
 * between chrome pieces — or sorting a previously orphaned rule by its bad Y —
 * destroys that rhythm. Chrome is split out of the body; stranded or previously
 * stack-corrupted pieces are healed into a tight cluster.
 *
 * @returns {{ element: object, relTop: number }[]}
 */
function compactChromeCluster(chromeElements, pageHeight) {
  if (chromeElements.length === 0) return [];

  const heading = chromeTitleAnchor(chromeElements);
  const headingAbs = absoluteTop(heading, pageHeight);
  // Sidebar-chrome is authored as deliberately as main section-chrome (a kicker
  // heading + accent tick at fixed offsets). Treating only "section-chrome" as
  // explicitly-owned forced every rail cluster through the height-based rebuild
  // path (heading→rule = headingHeight - 1), so a transferred kicker whose
  // measured heading height differs from the generator's got a different
  // heading→rule gap than its neighbours. Preserve authored rail-chrome offsets
  // too, so all rail sections (generated or transferred) keep one consistent gap.
  const explicitlyOwned = chromeElements.every(
    (element) => element.flowRole === "section-chrome"
      || element.flowRole === "sidebar-chrome",
  );
  const smallMarker = chromeElements.find((element) => {
    if (!["rectangle", "circle", "image"].includes(element.category)) return false;
    return (Number(element.width) || 0) <= 40 && elementHeight(element) <= 40;
  });
  const wideRule = chromeElements.find((element) => (
    element.category === "line" && (Number(element.width) || 0) >= 120
  ));
  const tallBadge = chromeElements.find((element) => (
    element.category === "line"
    && (Number(element.width) || 0) < 120
    && elementHeight(element) >= 20
  ));
  const markerWasStacked = smallMarker && wideRule
    && absoluteTop(smallMarker, pageHeight) >= absoluteBottom(heading, pageHeight)
    && absoluteTop(smallMarker, pageHeight) - absoluteBottom(heading, pageHeight) <= 16
    && absoluteTop(wideRule, pageHeight) >= absoluteBottom(smallMarker, pageHeight)
    && absoluteTop(wideRule, pageHeight) - absoluteBottom(smallMarker, pageHeight) <= 16;
  const monumentRuleWasFlattened = tallBadge && wideRule
    && absoluteTop(wideRule, pageHeight) - absoluteTop(tallBadge, pageHeight) > 20;

  if (explicitlyOwned && !markerWasStacked && !monumentRuleWasFlattened) {
    // Explicit section chrome is authored as one rigid visual composition.
    // Rebuilding it from generic heading/rule heuristics changes template-
    // specific offsets (chips, icons, frames and rules) every time a spacing
    // slider is used. Recognized legacy-corruption signatures remain
    // repairable, while healthy custom compositions keep their exact geometry.
    const items = chromeElements.map((element) => ({
      element,
      relTop: absoluteTop(element, pageHeight) - headingAbs,
    }));
    // Third corruption signature: Monument ordinal digits drifted below the
    // title baseline (square+16 instead of square+8). Snap them back onto the
    // title before minRel normalisation so packing alone repairs open docs.
    if (tallBadge && heading) {
      const titleItem = items.find((item) => item.element === heading);
      if (titleItem) {
        for (const item of items) {
          if (isDecorativeOrdinalChrome(item.element)) {
            item.relTop = titleItem.relTop;
          }
        }
      }
    }
    const minRel = Math.min(...items.map((item) => item.relTop));
    for (const item of items) item.relTop -= minRel;
    return items.sort((left, right) => left.relTop - right.relTop
      || (Number(left.element.left) || 0) - (Number(right.element.left) || 0));
  }

  // Pieces far from the heading were stranded by an earlier footer pack.
  const COHERENT_SPAN = 48;
  const nearHeading = [];
  const stranded = [];
  for (const element of chromeElements) {
    const delta = absoluteTop(element, pageHeight) - headingAbs;
    if (Math.abs(delta) <= COHERENT_SPAN) nearHeading.push(element);
    else stranded.push(element);
  }

  // Healthy authored geometry: preserve deltas. Corrupted stack or orphans: heal.
  if (stranded.length === 0 && chromeClusterIsHealthy(nearHeading, pageHeight)) {
    const items = nearHeading.map((element) => ({
      element,
      relTop: absoluteTop(element, pageHeight) - headingAbs,
    }));
    const minRel = items.reduce(
      (min, item) => Math.min(min, item.relTop),
      items[0]?.relTop ?? 0,
    );
    for (const item of items) item.relTop -= minRel;

    // Heal Monument accent rules authored with Builder.line flush-under-label
    // (legacy add-section bug): beside a 32px badge the rule belongs at
    // badge+15 (vertically centered), not at title+fs*1.35 (~badge+25).
    const tallBadgeItem = items.find((item) => (
      item.element.category === "line"
      && (Number(item.element.width) || 0) < 120
      && elementHeight(item.element) >= 20
    ));
    const accentRuleItem = items.find((item) => (
      item.element.category === "line"
      && (Number(item.element.width) || 0) >= 120
    ));
    if (tallBadgeItem && accentRuleItem
      && accentRuleItem.relTop - tallBadgeItem.relTop > 20) {
      accentRuleItem.relTop = tallBadgeItem.relTop + 15;
    }

    return items.sort((left, right) => left.relTop - right.relTop
      || (Number(left.element.left) || 0) - (Number(right.element.left) || 0));
  }

  return rebuildTightChromeCluster(chromeElements);
}

/**
 * Heading labels count as chrome even when untagged (legacy rule-below heuristic).
 */
function isSectionChromeMember(element, sectionElements, pageHeight) {
  if (isChromeLike(element)) return true;
  return isSectionHeading(element, sectionElements, pageHeight);
}

/**
 * Collapse a section into a continuous strip: chrome cluster first, then body.
 *
 * `forceTargets` only retargets chrome→body (`after_rule`) and body gaps
 * (`stack` / `record`). Intra-chrome spacing is never replaced by SPACE_STACK.
 *
 * @returns {{ element: object, relTop: number }[]}
 */
function compactSectionStrip(sectionElements, pageHeight, spacing, forceTargets = false) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  if (!sectionElements.length) return [];

  // Pull chrome ahead of body so a rule stranded at the page footer cannot sort
  // into the middle of experience records. Record-overlay elements (a date
  // pinned beside a title line, a rail line beside a company line, …) are
  // held out of the sequential stacker entirely — see the reinsertion pass
  // below the main loop for why.
  const chrome = [];
  const body = [];
  const overlays = [];
  for (const element of sectionElements) {
    if (isSectionChromeMember(element, sectionElements, pageHeight)) {
      chrome.push(element);
    } else if (isRecordOverlay(element, sectionElements, pageHeight)) {
      overlays.push(element);
    } else {
      body.push(element);
    }
  }

  const chromeItems = compactChromeCluster(chrome, pageHeight).map((item) => ({
    ...item,
    // Prefix marker so pagination can reserve the whole band even when a
    // legacy heading is not isChromeLike (untagged short label).
    leadingChrome: true,
  }));
  const items = [...chromeItems];
  const bodySorted = sortByReadingOrder(body, pageHeight);
  const chromeBottom = chromeItems.reduce(
    (max, item) => Math.max(max, item.relTop + elementHeight(item.element)),
    0,
  );

  // Anchor item for the currently active grid-member flowGroup run (wrapped
  // skill-chip pills, etc). While set, every further same-group grid member
  // computes `relTop` as a translation of its true original offset from this
  // anchor — never from the immediately preceding strip item — so unrelated
  // rows/columns cannot be flattened onto one vertical cursor.
  let gridAnchor = null;

  for (let index = 0; index < bodySorted.length; index += 1) {
    const element = bodySorted[index];
    if (items.length === 0) {
      items.push({ element, relTop: 0, leadingChrome: false });
      gridAnchor = isGridMember(element) ? items[items.length - 1] : null;
      continue;
    }

    // First body follows the full chrome band (not the last chrome piece alone),
    // so an overlapping mark cannot push content down by its full height.
    if (index === 0) {
      let gap = targetGap("after_rule", rhythm);
      if (!forceTargets && chrome.length > 0) {
        const deepestChromeAbs = Math.max(
          ...chrome.map((piece) => absoluteBottom(piece, pageHeight)),
        );
        const authored = absoluteTop(element, pageHeight) - deepestChromeAbs;
        // Keep authored breathing room when it is still a normal under-rule gap.
        if (authored >= 0 && authored <= PAGE_BREAK_GAP_THRESHOLD) {
          gap = authored;
        }
      }
      items.push({
        element,
        relTop: chromeBottom + gap,
        leadingChrome: false,
      });
      gridAnchor = isGridMember(element) ? items[items.length - 1] : null;
      continue;
    }

    const previous = items[items.length - 1];
    const group = flowGroupOf(element);
    const anchorGroup = gridAnchor ? flowGroupOf(gridAnchor.element) : null;
    // A shared `flowGroup` (stamped by the backend's `keep_together`) is the
    // strong signal that two grid members belong to the same wrapped grid,
    // but it is not the only one: two consecutive `grid-member` elements with
    // no flowGroup conflict are still one grid run. Requiring an exact match
    // when either side is untagged (a document whose chips never got the
    // flowGroup — a stale save, or an origin other than the Python
    // generator) used to fall through to linear stacking and scatter the 2D
    // chip grid into a broken column on the very next reorder/pack. Only an
    // explicit mismatch (both tagged, but with different ids) still breaks
    // the run — that is the real "different grid" signal.
    const continuesGrid = isGridMember(element)
      && gridAnchor
      && isGridMember(gridAnchor.element)
      && (!group || !anchorGroup || group === anchorGroup);

    if (continuesGrid) {
      items.push({
        element,
        relTop: gridAnchor.relTop
          + (absoluteTop(element, pageHeight) - absoluteTop(gridAnchor.element, pageHeight)),
        leadingChrome: false,
      });
      continue;
    }

    const kind = classifyIntraSectionGap(previous.element, element);
    let gap;
    if (forceTargets) {
      gap = targetGap(kind, rhythm);
    } else {
      const prevBottomAbs = absoluteBottom(previous.element, pageHeight);
      const abs = absoluteTop(element, pageHeight);
      gap = abs - prevBottomAbs;
      const crossedPage = Math.trunc(Number(element.page) || 1)
        > Math.trunc(Number(previous.element.page) || 1);
      if (crossedPage || gap > PAGE_BREAK_GAP_THRESHOLD) {
        gap = targetGap(kind === "after_rule" ? "after_rule" : "record", rhythm);
      }
      gap = Math.max(0, gap);
    }

    items.push({
      element,
      relTop: previous.relTop + elementHeight(previous.element) + gap,
      leadingChrome: false,
    });
    gridAnchor = isGridMember(element) ? items[items.length - 1] : null;
  }

  return insertRecordOverlayItems(items, overlays, pageHeight);
}

/**
 * Reinsert record-overlay elements (held out of the sequential stacker above)
 * immediately after the real content item they are pinned beside.
 *
 * An overlay must never be treated as an ordinary stacked line: its top is
 * designed to equal another line's top (not extend the record downward), so
 * running it through `previous.relTop + elementHeight(previous.element) + gap`
 * would misread it as an extra row and inflate every later line's position —
 * exactly the corruption that showed up as scrambled/interleaved records
 * after a density change or reorder. Each overlay's `relTop` is instead
 * derived by translating its real anchor's already-computed `relTop` by the
 * overlay's original offset from that anchor (0 for Meridian's rail, but
 * general in case a future template pins an overlay a few px off its
 * anchor's top). Reinserting directly after the anchor (rather than
 * appending at the strip's tail) keeps the record's `flowGroup` run
 * index-contiguous, which `flowGroupEndIndex` / `remainingStripRecordHeight`
 * require.
 */
function insertRecordOverlayItems(items, overlays, pageHeight) {
  if (!overlays.length) return items;

  const overlaysByAnchorId = new Map();
  const unanchored = [];
  for (const element of sortByReadingOrder(overlays, pageHeight)) {
    const anchorItem = findRecordOverlayAnchorItem(items, element, pageHeight);
    if (anchorItem) {
      const delta = absoluteTop(element, pageHeight) - absoluteTop(anchorItem.element, pageHeight);
      const mates = overlaysByAnchorId.get(anchorItem.element.element_id) || [];
      mates.push({
        element,
        relTop: anchorItem.relTop + delta,
        leadingChrome: false,
        // Consumed by `placeStrip`: position this item from the anchor's
        // *final* placed position (translated by `delta`) instead of the
        // generic previous-item stacking math, and never let it become the
        // stacking reference for whichever real line follows it.
        recordOverlayAnchorId: anchorItem.element.element_id,
        recordOverlayDelta: delta,
      });
      overlaysByAnchorId.set(anchorItem.element.element_id, mates);
    } else {
      // No matching anchor in this section (stale/legacy save, or the
      // element's true anchor was reassigned to a different section) — keep
      // it rather than silently dropping content, appended at the tail.
      const last = items[items.length - 1];
      const fallbackRelTop = last ? last.relTop + elementHeight(last.element) : 0;
      unanchored.push({ element, relTop: fallbackRelTop, leadingChrome: false });
    }
  }

  const withOverlays = [];
  for (const item of items) {
    withOverlays.push(item);
    const mates = overlaysByAnchorId.get(item.element.element_id);
    if (mates) withOverlays.push(...mates);
  }
  withOverlays.push(...unanchored);
  return withOverlays;
}

/**
 * Find the already-placed strip item a record-overlay element is pinned
 * beside: same `flowGroup`, top within the ~3px tolerance
 * `textareaReflow.js`'s `recordOverlayAnchor` also uses.
 */
function findRecordOverlayAnchorItem(items, overlayElement, pageHeight) {
  const group = flowGroupOf(overlayElement);
  if (!group) return null;
  const overlayAbs = absoluteTop(overlayElement, pageHeight);
  let best = null;
  let bestDelta = Infinity;
  for (const item of items) {
    if (flowGroupOf(item.element) !== group) continue;
    const delta = Math.abs(absoluteTop(item.element, pageHeight) - overlayAbs);
    if (delta <= 3 && delta < bestDelta) {
      best = item;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Map a flow cursor + height onto a page/top pair, bumping to the next page
 * when the block would collide with the footer margin (same rule as reflow).
 */
function placeAtFlowCursor(cursorAbs, height, pageHeight, pageTop, bottomMargin) {
  const contentBottom = pageHeight - bottomMargin;
  const pageCapacity = Math.max(0, contentBottom - pageTop);
  let page = Math.max(1, Math.floor(Math.max(0, cursorAbs) / pageHeight) + 1);
  let top = Math.max(0, cursorAbs) - (page - 1) * pageHeight;

  if (top < pageTop && page > 1) {
    // Landed inside the previous page's top margin band after a naive abs map.
    top = pageTop;
  }
  // Start on the next page when this page has no room below `top`. Previously
  // only blocks shorter than one page capacity were bumped — a crushed
  // sidebar-width body (taller than the page) stayed parked mid-page and left
  // a huge empty band above the section on the continuation page.
  const fitsFromTop = height <= pageCapacity;
  const overflowsFooter = top + Math.min(height, pageCapacity || height) > contentBottom;
  if (overflowsFooter && (fitsFromTop || top > pageTop)) {
    page += 1;
    top = pageTop;
  }

  return {
    page,
    top,
    abs: (page - 1) * pageHeight + top,
    bottom: (page - 1) * pageHeight + top + height,
  };
}

/** Count leading section-chrome pieces (heading, rule, markers, icons). */
function leadingChromeCount(strip) {
  let count = 0;
  while (count < strip.length && strip[count].leadingChrome) {
    count += 1;
  }
  return count;
}

/**
 * Keep-together record id from Builder / sectionBuilder / sectionRecord.
 * @param {object|null|undefined} element
 * @returns {string|null}
 */
function flowGroupOf(element) {
  const group = element?.flowGroup;
  return typeof group === "string" && group ? group : null;
}

/**
 * Whether `element` is one cell of a 2D grid (e.g. wrapped skill-chip pills)
 * sharing its `flowGroup` with siblings at varying x/y, rather than a linear
 * title/meta/body stack member. `compactSectionStrip` / `placeStrip` must
 * reposition grid members by translating each one's original offset from the
 * group's first member — recomputing "previous item's bottom + gap" (the
 * stacking math correct for a single column) would collapse every row onto
 * the same vertical cursor.
 */
function isGridMember(element) {
  return element?.flowRole === "grid-member";
}

/**
 * Last strip index that still belongs to the keep-together record starting at
 * `startIndex`. Untagged body lines are treated as a single-element record.
 *
 * @param {{ element: object, leadingChrome?: boolean }[]} strip
 * @param {number} startIndex
 * @returns {number}
 */
function flowGroupEndIndex(strip, startIndex) {
  const start = strip[startIndex];
  if (!start || start.leadingChrome) return startIndex;
  const group = flowGroupOf(start.element);
  if (!group) return startIndex;

  let endIndex = startIndex;
  for (let index = startIndex + 1; index < strip.length; index += 1) {
    const item = strip[index];
    // Leading chrome is always prefix; body mates may only follow.
    if (item.leadingChrome) break;
    if (flowGroupOf(item.element) !== group) break;
    endIndex = index;
  }
  return endIndex;
}

/**
 * Furthest `relTop + height` bottom edge among `strip[startIndex..endIndex]`.
 *
 * Scans every mate's bottom edge rather than trusting the last array index to
 * be the tallest: a record-overlay item (pinned beside an earlier line, so
 * its `relTop` can be smaller than a later real line's) may sit anywhere
 * inside the run once reinserted by `insertRecordOverlayItems`.
 */
function stripRangeMaxBottom(strip, startIndex, endIndex) {
  let maxBottom = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    const item = strip[index];
    maxBottom = Math.max(maxBottom, item.relTop + elementHeight(item.element));
  }
  return maxBottom;
}

/**
 * Height from `startIndex` through its keep-together mates, using compacted
 * `relTop` gaps so page-break reservation matches the packed strip geometry.
 *
 * @param {{ element: object, relTop: number, leadingChrome?: boolean }[]} strip
 * @param {number} startIndex
 * @returns {number}
 */
function remainingStripRecordHeight(strip, startIndex) {
  const start = strip[startIndex];
  if (!start) return 1;
  const endIndex = flowGroupEndIndex(strip, startIndex);
  return Math.max(1, stripRangeMaxBottom(strip, startIndex, endIndex) - start.relTop);
}

/**
 * Absolute page/top for an already-reserved strip origin + relTop.
 * Used for leading chrome so a 1px rule cannot independently "fit" in the
 * footer while the section body jumps to the next page.
 */
function pageTopFromOrigin(originAbs, relTop, pageHeight) {
  const abs = originAbs + relTop;
  const page = Math.max(1, Math.floor(Math.max(0, abs) / pageHeight) + 1);
  const top = abs - (page - 1) * pageHeight;
  return { page, top, abs, bottom: abs };
}

/**
 * Place one compacted strip starting at `cursorAbs`.
 *
 * Leading chrome (heading + rule + markers) is reserved together with the
 * **full first keep-together record** (`flowGroup` mates), matching
 * `textareaReflow.avoidOrphanChrome` / backend `need_section`. Later body
 * records use the same atomic reservation so education/experience stacks
 * never leave degree on page N and school/meta/description on N+1 after
 * structural edits (add section, add record, reorder, rhythm knobs).
 *
 * @returns {{ placedById: Map<string, object>, bottomAbs: number }}
 */
function placeStrip(strip, cursorAbs, pageHeight, pageTop, bottomMargin) {
  const placedById = new Map();
  if (strip.length === 0) return { placedById, bottomAbs: cursorAbs };

  const chromeCount = leadingChromeCount(strip);
  let reservedHeight = 0;
  if (chromeCount > 0) {
    const lastChrome = strip[chromeCount - 1];
    reservedHeight = lastChrome.relTop + elementHeight(lastChrome.element);
    if (chromeCount < strip.length) {
      // Chrome through the end of the first body record (not only first line).
      const recordEnd = flowGroupEndIndex(strip, chromeCount);
      reservedHeight = stripRangeMaxBottom(strip, chromeCount, recordEnd);
    }
  } else if (strip.length > 0) {
    const recordEnd = flowGroupEndIndex(strip, 0);
    reservedHeight = stripRangeMaxBottom(strip, 0, recordEnd);
  }

  const sectionCursor = reservedHeight > 0
    ? placeAtFlowCursor(cursorAbs, reservedHeight, pageHeight, pageTop, bottomMargin).abs
    : cursorAbs;

  let stripBottom = sectionCursor;
  let previous = null;
  // Track the active keep-together record so continuation mates stay on the
  // page chosen when the record started (same contract as textareaReflow).
  let activeGroup = null;
  let activeGroupPage = null;
  // Anchor { item, placed } for the active grid-member flowGroup run. Mirrors
  // `gridAnchor` in `compactSectionStrip`: once a group's first member is
  // placed, every further same-group grid member is positioned by translating
  // its (already anchor-relative) `relTop` from this placed anchor instead of
  // stacking under whichever item happens to precede it in the strip.
  let gridAnchor = null;

  for (let index = 0; index < strip.length; index += 1) {
    const item = strip[index];
    const height = elementHeight(item.element);
    const inLeadingChrome = index < chromeCount;

    // Record-overlay items (see `insertRecordOverlayItems`) are positioned by
    // translating their anchor's *final placed* position, never by the
    // generic previous-item stacking math below — and must not themselves
    // become `previous` / `activeGroup` / `gridAnchor` for whichever real
    // line follows, or that line would inherit the overlay's position
    // instead of stacking under the true previous content line.
    if (item.recordOverlayAnchorId != null) {
      const anchorPlaced = placedById.get(item.recordOverlayAnchorId);
      let overlayAbs;
      if (anchorPlaced) {
        overlayAbs = (anchorPlaced.page - 1) * pageHeight + anchorPlaced.top
          + (item.recordOverlayDelta || 0);
      } else {
        // Anchor missing (should not happen given `insertRecordOverlayItems`
        // always processes strip order left-to-right) — fall back to
        // stacking under whatever came before rather than losing the element.
        overlayAbs = previous ? previous.placed.bottom : sectionCursor;
      }
      const page = Math.max(1, Math.floor(Math.max(0, overlayAbs) / pageHeight) + 1);
      const top = overlayAbs - (page - 1) * pageHeight;
      const placedOverlay = { page, top, abs: overlayAbs, bottom: overlayAbs + height };
      placedById.set(item.element.element_id, {
        ...item.element,
        page: placedOverlay.page,
        top: placedOverlay.top,
      });
      stripBottom = Math.max(stripBottom, placedOverlay.bottom);
      continue;
    }

    let placed;
    if (inLeadingChrome) {
      const at = pageTopFromOrigin(sectionCursor, item.relTop, pageHeight);
      placed = { page: at.page, top: at.top, abs: at.abs, bottom: at.abs + height };
    } else {
      const group = flowGroupOf(item.element);
      const anchorGroup = gridAnchor ? flowGroupOf(gridAnchor.item.element) : null;
      // Mirrors the `continuesGrid` relaxation in `compactSectionStrip`: only
      // an explicit flowGroup mismatch (both tagged, but different) breaks a
      // grid run — an untagged chip run must not fall through to per-item
      // stacking, which is what scattered the 2D grid on reorder.
      const continuesGrid = isGridMember(item.element)
        && gridAnchor
        && isGridMember(gridAnchor.item.element)
        && (!group || !anchorGroup || group === anchorGroup);

      let desiredAbs = sectionCursor;
      if (continuesGrid) {
        desiredAbs = gridAnchor.placed.abs + (item.relTop - gridAnchor.item.relTop);
      } else if (previous) {
        const gap = item.relTop
          - (previous.item.relTop + elementHeight(previous.item.element));
        desiredAbs = previous.placed.bottom + Math.max(0, gap);
      } else {
        desiredAbs = sectionCursor + item.relTop;
      }

      const startsRecord = Boolean(group) && group !== activeGroup;
      const continuesRecord = Boolean(group) && group === activeGroup;

      if (continuesRecord && activeGroupPage != null) {
        // Already reserved with the record start — keep mates on that page.
        // Independent placeAtFlowCursor(height) could still bump a tall last
        // line alone if the first-line reservation used a shorter measure.
        const page = activeGroupPage;
        let top = desiredAbs - (page - 1) * pageHeight;
        if (top < pageTop && page > 1) {
          if (continuesGrid) {
            // Keep the anchor-relative offset even when it lands above the
            // page's content band — clamping to a stacked fallback here would
            // reintroduce the single-column collapse this branch exists to avoid.
            top = pageTop;
          } else {
            // Prefer stacking under the previous mate already on this page.
            // Clamping every overflow to pageTop collapses skill category labels
            // onto their chip bodies at the continuation-page inset.
            const pageStartAbs = (page - 1) * pageHeight + pageTop;
            if (previous && previous.placed.bottom >= pageStartAbs - 0.01) {
              const stackGap = Math.max(
                0,
                item.relTop
                  - (previous.item.relTop + elementHeight(previous.item.element)),
              );
              top = previous.placed.bottom - pageStartAbs + pageTop + stackGap;
            } else {
              top = pageTop;
            }
          }
        }
        const abs = (page - 1) * pageHeight + top;
        placed = { page, top, abs, bottom: abs + height };
      } else {
        // New flowGroup (or untagged line): reserve the whole remaining record
        // height before accepting this page, then place only this element's box.
        const reserveHeight = startsRecord
          ? remainingStripRecordHeight(strip, index)
          : height;
        const at = placeAtFlowCursor(
          desiredAbs, reserveHeight, pageHeight, pageTop, bottomMargin,
        );
        placed = {
          page: at.page,
          top: at.top,
          abs: at.abs,
          bottom: at.abs + height,
        };
      }

      if (group) {
        if (startsRecord || !activeGroup) {
          activeGroup = group;
          activeGroupPage = placed.page;
        }
      } else {
        activeGroup = null;
        activeGroupPage = null;
      }

      if (isGridMember(item.element)) {
        if (!gridAnchor || flowGroupOf(gridAnchor.item.element) !== group) {
          gridAnchor = { item, placed };
        }
      } else {
        gridAnchor = null;
      }
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

/**
 * Pack sections in `orderedHeadingIds` from the document flow start.
 * Non-section elements (masthead, fixed chrome) keep their positions.
 *
 * @param {object[]} elements
 * @param {string[]} orderedHeadingIds
 * @param {number} [pageHeight=842]
 * @param {{ pageTop?: number, bottomMargin?: number, sectionGap?: number, spacing?: object, forceTargets?: boolean }} [options]
 * @returns {object[]}
 */
export function packDocumentSections(
  elements,
  orderedHeadingIds,
  pageHeight = 842,
  {
    pageTop = DEFAULT_PAGE_TOP,
    bottomMargin = DEFAULT_BOTTOM_MARGIN,
    sectionGap,
    spacing,
    forceTargets = false,
  } = {},
) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const resolvedSectionGap = Number.isFinite(sectionGap) ? sectionGap : rhythm.section;
  const list = elements || [];
  const sections = listDocumentSections(list, pageHeight);
  if (sections.length === 0 || !orderedHeadingIds?.length) return list;

  const byHeading = new Map(sections.map((section) => [section.headingId, section]));
  const order = orderedHeadingIds
    .map((headingId) => byHeading.get(headingId))
    .filter(Boolean);
  if (order.length === 0) return list;

  const flowStart = resolveFlowStart(list, sections, pageHeight);
  const memberIds = new Set();
  const strips = order.map((section) => {
    const ids = sectionElementIds(list, section.headingId, pageHeight);
    ids.forEach((id) => memberIds.add(id));
    const members = list.filter((element) => ids.has(element.element_id));
    return compactSectionStrip(members, pageHeight, rhythm, forceTargets);
  });

  const placedById = new Map();
  let cursorAbs = flowStart;

  strips.forEach((strip, stripIndex) => {
    if (strip.length === 0) return;
    if (stripIndex > 0) cursorAbs += resolvedSectionGap;
    const { placedById: stripPlaced, bottomAbs } = placeStrip(
      strip, cursorAbs, pageHeight, pageTop, bottomMargin,
    );
    for (const [id, element] of stripPlaced) placedById.set(id, element);
    cursorAbs = bottomAbs;
  });

  return list.map((element) => {
    if (!memberIds.has(element.element_id)) return element;
    return placedById.get(element.element_id) || element;
  });
}

/**
 * Append a freshly built section at the end of the sidebar rail, then
 * retarget both lanes via `applyFlowSpacing`. Flow bottom is measured from
 * sidebar-lane elements only so a tall main column cannot push the new strip
 * below the rail.
 *
 * @param {object[]} elements
 * @param {object[]} newElements
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, pageTop?: number, bottomMargin?: number }} [options]
 * @returns {object[]}
 */
function appendSidebarSectionAtEnd(
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
    if (!isSidebarLaneElement(element)) continue;
    flowBottom = Math.max(flowBottom, absoluteBottom(element, pageHeight));
  }
  const sidebarSections = listSidebarSections(list, pageHeight);
  const cursorAbs = flowBottom > 0
    ? flowBottom + rhythm.section
    : (sidebarSections[0]?.startAbs ?? pageTop);

  const strip = compactSectionStrip(additions, pageHeight, rhythm, true);
  const { placedById } = placeStrip(strip, cursorAbs, pageHeight, pageTop, bottomMargin);
  const placedAdditions = additions.map(
    (element) => placedById.get(element.element_id) || element,
  );
  return applyFlowSpacing(
    [...list, ...placedAdditions],
    rhythm,
    pageHeight,
    { pageTop, bottomMargin },
  );
}

/**
 * Append a freshly built section's elements at the end of the document flow,
 * then retarget every section to the document's governing rhythm.
 *
 * The new strip is first placed below the deepest existing non-fixed element
 * plus one SPACE_SECTION gap (so `listDocumentSections` sees it last), then
 * `applyFlowSpacing` force-packs the whole document. Without that second pass,
 * wizard-authored under-rule / inter-section gaps (often ~7px / ~14–18px from
 * ReportLab) stay put while the new strip alone snaps to the panel knobs —
 * the visible "added section rhythm differs from wizard sections" bug.
 *
 * `fixedToPage` decorations (page frames, footers) are excluded from the flow
 * bottom so the section follows real content rather than the page border. On
 * two-column templates (Tessera, Slate) the sidebar rail is also excluded —
 * see the column-detection doc above `sectionElementIds` — otherwise a deep
 * sidebar list (e.g. education fit to the rail) would push the new section
 * far below the actual (shorter) main-column content instead of right after it.
 *
 * Pass `lane: "sidebar"` to append into the rail instead of the main column.
 *
 * @param {object[]} elements current document elements
 * @param {object[]} newElements the section's chrome + body (unplaced)
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, pageTop?: number, bottomMargin?: number, lane?: "main"|"sidebar"|null }} [options]
 * @returns {object[]} elements with the new section appended and positioned
 */
export function appendSectionAtEnd(
  elements,
  newElements,
  pageHeight = 842,
  {
    spacing,
    pageTop = DEFAULT_PAGE_TOP,
    bottomMargin = DEFAULT_BOTTOM_MARGIN,
    lane = null,
  } = {},
) {
  if (lane === "sidebar") {
    return appendSidebarSectionAtEnd(elements, newElements, pageHeight, {
      spacing, pageTop, bottomMargin,
    });
  }

  const list = elements || [];
  const additions = newElements || [];
  if (additions.length === 0) return list;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);

  const sections = listDocumentSections(list, pageHeight);
  const firstHeading = sections.length
    ? list.find((element) => element.element_id === sections[0].headingId)
    : null;
  const isSameColumn = firstHeading
    ? sameColumnAsHeading(Number(firstHeading.left) || 0)
    : () => true;

  let flowBottom = 0;
  for (const element of list) {
    if (!element || element.fixedToPage) continue;
    if (isSidebarLaneElement(element)) continue;
    if (!isSameColumn(element)) continue;
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
  // Unify wizard + new strip onto one SPACE_* rhythm (see JSDoc above).
  return applyFlowSpacing(
    [...list, ...placedAdditions],
    rhythm,
    pageHeight,
    { pageTop, bottomMargin },
  );
}

/**
 * Insert a freshly built section immediately below a sidebar kicker, shifting
 * only later sidebar-lane elements so the main column stays put.
 *
 * @param {object[]} elements
 * @param {object[]} newElements
 * @param {string} afterHeadingId
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, pageTop?: number, bottomMargin?: number }} [options]
 * @returns {object[]}
 */
function insertSidebarSectionAfter(
  elements,
  newElements,
  afterHeadingId,
  pageHeight = 842,
  { spacing, pageTop = DEFAULT_PAGE_TOP, bottomMargin = DEFAULT_BOTTOM_MARGIN } = {},
) {
  const list = elements || [];
  const additions = newElements || [];
  if (additions.length === 0) return list;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const sections = listSidebarSections(list, pageHeight);
  const index = sections.findIndex((section) => section.headingId === afterHeadingId);
  if (index < 0) {
    return appendSidebarSectionAtEnd(list, additions, pageHeight, {
      spacing, pageTop, bottomMargin,
    });
  }

  const anchorIds = sidebarSectionElementIds(list, afterHeadingId, pageHeight);
  let sectionBottom = sections[index].startAbs;
  for (const element of list) {
    if (!element || !anchorIds.has(element.element_id)) continue;
    sectionBottom = Math.max(sectionBottom, absoluteBottom(element, pageHeight));
  }

  const cursorAbs = sectionBottom + rhythm.section;
  const strip = compactSectionStrip(additions, pageHeight, rhythm, true);
  const { placedById, bottomAbs } = placeStrip(
    strip, cursorAbs, pageHeight, pageTop, bottomMargin,
  );
  const placedAdditions = additions.map(
    (element) => placedById.get(element.element_id) || element,
  );

  const hole = Math.max(0, bottomAbs + rhythm.section - cursorAbs);
  const shifted = list.map((element) => {
    if (!element || element.fixedToPage) return element;
    if (anchorIds.has(element.element_id)) return element;
    if (element.flowRole === "masthead") return element;
    if (!isSidebarLaneElement(element)) return element;
    if (absoluteTop(element, pageHeight) + 0.01 < sectionBottom) return element;
    const newAbs = absoluteTop(element, pageHeight) + hole;
    const page = Math.max(1, Math.floor(newAbs / pageHeight) + 1);
    const top = newAbs - (page - 1) * pageHeight;
    return { ...element, page, top };
  });

  const mateBottomId = [...anchorIds].reduce((bestId, id) => {
    const element = shifted.find((item) => item.element_id === id);
    if (!element) return bestId;
    if (!bestId) return id;
    const best = shifted.find((item) => item.element_id === bestId);
    return absoluteBottom(element, pageHeight) >= absoluteBottom(best, pageHeight)
      ? id
      : bestId;
  }, null);
  const mateIndex = mateBottomId
    ? shifted.findIndex((element) => element.element_id === mateBottomId)
    : -1;
  const withBlock = mateIndex >= 0
    ? [
      ...shifted.slice(0, mateIndex + 1),
      ...placedAdditions,
      ...shifted.slice(mateIndex + 1),
    ]
    : [...shifted, ...placedAdditions];

  return applyFlowSpacing(withBlock, rhythm, pageHeight, { pageTop, bottomMargin });
}

/**
 * Insert a freshly built section immediately below the section owned by
 * `afterHeadingId`, then retarget every section to the governing rhythm.
 *
 * Opens a document-wide Y-hole under the anchor section (later headings move
 * too) so the new strip cannot land inside the next section's band. The hole
 * shift is scoped to the anchor's own column (see the column-detection doc
 * above `sectionElementIds`) so inserting under a main-column heading cannot
 * also drag a two-column template's sidebar rail down by the same amount.
 * Falls back to `appendSectionAtEnd` when the anchor heading is missing.
 *
 * Sidebar kickers (or `lane: "sidebar"`) insert into the rail instead.
 *
 * @param {object[]} elements
 * @param {object[]} newElements
 * @param {string} afterHeadingId
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, pageTop?: number, bottomMargin?: number, lane?: "main"|"sidebar"|null }} [options]
 * @returns {object[]}
 */
export function insertSectionAfter(
  elements,
  newElements,
  afterHeadingId,
  pageHeight = 842,
  {
    spacing,
    pageTop = DEFAULT_PAGE_TOP,
    bottomMargin = DEFAULT_BOTTOM_MARGIN,
    lane = null,
  } = {},
) {
  const list = elements || [];
  const additions = newElements || [];
  if (additions.length === 0) return list;

  const anchorHeading = afterHeadingId
    ? list.find((element) => element.element_id === afterHeadingId)
    : null;
  const intoSidebar = lane === "sidebar"
    || (anchorHeading && isSidebarSectionHeading(anchorHeading));

  if (!afterHeadingId) {
    return appendSectionAtEnd(list, additions, pageHeight, {
      spacing, pageTop, bottomMargin, lane: intoSidebar ? "sidebar" : lane,
    });
  }

  if (intoSidebar) {
    return insertSidebarSectionAfter(
      list, additions, afterHeadingId, pageHeight,
      { spacing, pageTop, bottomMargin },
    );
  }

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const sections = listDocumentSections(list, pageHeight);
  const index = sections.findIndex((section) => section.headingId === afterHeadingId);
  if (index < 0) {
    return appendSectionAtEnd(list, additions, pageHeight, { spacing, pageTop, bottomMargin });
  }

  const anchorIds = sectionElementIds(list, afterHeadingId, pageHeight);
  let sectionBottom = sections[index].startAbs;
  for (const element of list) {
    if (!element || !anchorIds.has(element.element_id)) continue;
    sectionBottom = Math.max(sectionBottom, absoluteBottom(element, pageHeight));
  }

  const cursorAbs = sectionBottom + rhythm.section;
  const strip = compactSectionStrip(additions, pageHeight, rhythm, true);
  const { placedById, bottomAbs } = placeStrip(
    strip, cursorAbs, pageHeight, pageTop, bottomMargin,
  );
  const placedAdditions = additions.map(
    (element) => placedById.get(element.element_id) || element,
  );

  // Everything that currently starts at or below the insert point (sibling
  // content after the anchor, and later section chrome/body) moves down so
  // section membership stays correct before applyFlowSpacing.
  const hole = Math.max(0, bottomAbs + rhythm.section - cursorAbs);
  const isSameColumn = sameColumnAsHeading(Number(anchorHeading?.left) || 0);
  const shifted = list.map((element) => {
    if (!element || element.fixedToPage) return element;
    if (anchorIds.has(element.element_id)) return element;
    if (element.flowRole === "masthead") return element;
    if (isSidebarLaneElement(element)) return element;
    if (!isSameColumn(element)) return element;
    if (absoluteTop(element, pageHeight) + 0.01 < sectionBottom) return element;
    const newAbs = absoluteTop(element, pageHeight) + hole;
    const page = Math.max(1, Math.floor(newAbs / pageHeight) + 1);
    const top = newAbs - (page - 1) * pageHeight;
    return { ...element, page, top };
  });

  const mateBottomId = [...anchorIds].reduce((bestId, id) => {
    const element = shifted.find((item) => item.element_id === id);
    if (!element) return bestId;
    if (!bestId) return id;
    const best = shifted.find((item) => item.element_id === bestId);
    return absoluteBottom(element, pageHeight) >= absoluteBottom(best, pageHeight)
      ? id
      : bestId;
  }, null);
  const mateIndex = mateBottomId
    ? shifted.findIndex((element) => element.element_id === mateBottomId)
    : -1;
  const withBlock = mateIndex >= 0
    ? [
      ...shifted.slice(0, mateIndex + 1),
      ...placedAdditions,
      ...shifted.slice(mateIndex + 1),
    ]
    : [...shifted, ...placedAdditions];

  return applyFlowSpacing(withBlock, rhythm, pageHeight, { pageTop, bottomMargin });
}

/**
 * Move a section up/down, then repack every section so page-break holes and
 * following content reflow instead of overlapping.
 *
 * Sidebar kickers swap within `listSidebarSections` and re-pack via
 * `packSidebarLane`; main-column headings keep the `packDocumentSections` path.
 *
 * @returns {object[]|null} new elements, or null if move is invalid
 */
export function reorderSection(
  elements,
  headingId,
  direction,
  pageHeight = 842,
  options = {},
) {
  const list = elements || [];
  const heading = list.find((element) => element.element_id === headingId);
  const rhythm = normalizeFlowSpacing(options.spacing || DEFAULT_FLOW_SPACING);

  if (heading && isSidebarSectionHeading(heading)) {
    const sections = listSidebarSections(list, pageHeight);
    const index = sections.findIndex((section) => section.headingId === headingId);
    if (index < 0) return null;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= sections.length) return null;

    const order = sections.map((section) => section.headingId);
    const tmp = order[index];
    order[index] = order[swapWith];
    order[swapWith] = tmp;

    return packSidebarLane(list, pageHeight, {
      ...options,
      spacing: rhythm,
      orderedHeadingIds: order,
      forceTargets: options.forceTargets !== false,
    });
  }

  const sections = listDocumentSections(list, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return null;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= sections.length) return null;

  const order = sections.map((section) => section.headingId);
  const tmp = order[index];
  order[index] = order[swapWith];
  order[swapWith] = tmp;

  return packDocumentSections(list, order, pageHeight, {
    ...options,
    spacing: rhythm,
    sectionGap: options.sectionGap ?? rhythm.section,
  });
}

/**
 * Remove one template-mode section (heading + chrome + body), then re-pack the
 * remaining sections in document order so later content closes the hole under
 * the template rhythm (`stack` / `record` / `section` / `after_rule`).
 *
 * Masthead and fixed-to-page chrome are never removed. Sidebar kickers remove
 * via `sidebarSectionElementIds` + `packSidebarLane`; main-column removals leave
 * the rail alone (same column filter as `sectionElementIds`).
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, pageTop?: number, bottomMargin?: number, sectionGap?: number }} [options]
 * @returns {{ elements: object[], removedIds: Set<string> }|null}
 */
export function removeSection(
  elements,
  headingId,
  pageHeight = 842,
  options = {},
) {
  if (!headingId) return null;
  const list = elements || [];
  const heading = list.find((element) => element.element_id === headingId);
  const rhythm = normalizeFlowSpacing(options.spacing || DEFAULT_FLOW_SPACING);

  if (heading && isSidebarSectionHeading(heading)) {
    const sections = listSidebarSections(list, pageHeight);
    const index = sections.findIndex((section) => section.headingId === headingId);
    if (index < 0) return null;

    const removedIds = sidebarSectionElementIds(list, headingId, pageHeight);
    if (removedIds.size === 0) return null;

    const remaining = list.filter((element) => !removedIds.has(element.element_id));
    const order = sections
      .filter((section) => section.headingId !== headingId)
      .map((section) => section.headingId);

    if (order.length === 0) {
      return { elements: remaining, removedIds };
    }

    const packed = packSidebarLane(remaining, pageHeight, {
      ...options,
      spacing: rhythm,
      orderedHeadingIds: order,
      forceTargets: true,
    });
    return { elements: packed, removedIds };
  }

  const sections = listDocumentSections(list, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return null;

  const removedIds = sectionElementIds(list, headingId, pageHeight);
  if (removedIds.size === 0) return null;

  const remaining = list.filter((element) => !removedIds.has(element.element_id));
  const order = sections
    .filter((section) => section.headingId !== headingId)
    .map((section) => section.headingId);

  // No remaining packable sections — return the trimmed document as-is
  // (masthead / sidebar / free elements may still be present).
  if (order.length === 0) {
    return { elements: remaining, removedIds };
  }

  const packed = packDocumentSections(remaining, order, pageHeight, {
    ...options,
    spacing: rhythm,
    sectionGap: options.sectionGap ?? rhythm.section,
    forceTargets: true,
  });
  return { elements: packed, removedIds };
}

/**
 * Re-pack every section in current order using target rhythm values.
 * Used when the Sections panel changes stack/record/section/after_rule.
 *
 * Main-column sections pack first (`packDocumentSections`). Sidebar-lane
 * sections then pack on an independent cursor (`packSidebarLane`) so density
 * knobs reach Tessera / Slate / Harbor / Sterling rails without folding them
 * into the main flow.
 *
 * @param {object[]} elements
 * @param {object} spacing
 * @param {number} [pageHeight=842]
 * @param {object} [options]
 * @returns {object[]}
 */
export function applyFlowSpacing(elements, spacing, pageHeight = 842, options = {}) {
  const rhythm = normalizeFlowSpacing(spacing);
  // Repair ordinal/title baseline drift and legacy chip-label insets before
  // packing so a spacing pass also fixes Monument badges saved with the
  // square+16 offset and Cardinal pills whose labels sat at CHIP_PAD_Y.
  let next = healDecorativeOrdinalBaselines(elements || [], pageHeight);
  next = healSkillChipLabelBaselines(next);
  next = healSimpleChromeRuleGaps(next, pageHeight);
  const sections = listDocumentSections(next, pageHeight);
  if (sections.length > 0) {
    next = packDocumentSections(
      next,
      sections.map((section) => section.headingId),
      pageHeight,
      {
        ...options,
        spacing: rhythm,
        sectionGap: rhythm.section,
        forceTargets: true,
      },
    );
  }
  return packSidebarLane(next, pageHeight, {
    ...options,
    spacing: rhythm,
    forceTargets: true,
  });
}

/**
 * Template-neutral fallback used when a document has no detectable sections
 * (rare — the structural editor runs in template mode). Values mirror a mid
 * single-column CV: a thin ruled heading over ~9px body copy.
 */
const DEFAULT_SECTION_STYLE = Object.freeze({
  left: 66,
  /** Content column left — may differ from heading left (Monument: 102 vs 118). */
  bodyLeft: 66,
  recordWidth: 463,
  heading: { fontSize: 8.5, fontFamily: "Inter", color: "#24201E", letterSpacing: 1.4, bold: false },
  rule: { width: 463, height: 1, backgroundColor: "#BFB4AA", relLeft: 0 },
  markers: [],
  badgeNumber: null,
  body: { fontSize: 9.3, fontFamily: "Inter", lineHeight: 13, color: "#24201E" },
  mutedColor: "#756F6B",
});

/** Narrow rail defaults for Tessera / Slate-style sidebars when none exist yet. */
const DEFAULT_SIDEBAR_SECTION_STYLE = Object.freeze({
  left: 51,
  bodyLeft: 25,
  recordWidth: 128,
  heading: { fontSize: 7.6, fontFamily: "Inter", color: "#24201E", letterSpacing: 1.2, bold: false },
  rule: { width: 50, height: 1, backgroundColor: "#BFB4AA", relLeft: 0 },
  markers: [],
  badgeNumber: null,
  body: { fontSize: 6.6, fontFamily: "Inter", lineHeight: 9, color: "#24201E" },
  mutedColor: "#756F6B",
});

/**
 * Categories eligible to be replicated as a decorative shape alongside a
 * section heading (rectangles, circles, filled "line" blocks used as badges,
 * icons). Text is deliberately excluded — some templates (Monument) tag a
 * decorative ordinal-number text as chrome, but the frontend has no access to
 * the backend generator's per-section counter, so that number can never be
 * faithfully reproduced on a new section. Skipping it (rather than guessing a
 * number) matches the rest of that badge's shapes without an incorrect digit.
 */
const DECORATIVE_SHAPE_CATEGORIES = new Set(["rectangle", "circle", "ellipse", "line", "image"]);

/**
 * Choose which linear body element supplies type metrics for transfers / add.
 *
 * Experience and education put a short bold title (or degree) above the real
 * description. The first element in reading order is therefore usually the
 * wrong sample — prefer bullets, multi-line copy, or a non-bold mid-size line.
 *
 * @param {object[]} linearBodies - already excludes `grid-member` cells; the
 *   caller falls further back to `findDocumentBodySample` when this is empty,
 *   so a chip/grid cell can never be reintroduced as the sampled body here.
 * @returns {object|null}
 */
function pickLinearBodySample(linearBodies) {
  const pool = linearBodies || [];
  if (pool.length === 0) return null;
  const bulleted = pool.find((element) => element.bulletList);
  if (bulleted) return bulleted;
  const multiLine = pool.find((element) => String(element.content || "").includes("\n"));
  if (multiLine) return multiLine;
  // Body copy sits near 9–10.5px; skip bold titles (~11+) and prefer the larger
  // plain size so muted meta (~8.6) does not win over description (~9.5).
  const plainCandidates = pool.filter((element) => {
    if (element.bold) return false;
    const fontSize = Number(element.fontSize) || 0;
    return fontSize > 0 && fontSize <= 10.5;
  });
  if (plainCandidates.length > 0) {
    return plainCandidates.reduce((best, element) => (
      (Number(element.fontSize) || 0) > (Number(best.fontSize) || 0) ? element : best
    ));
  }
  // Last linear line in reading order is typically the description block.
  return pool[pool.length - 1];
}

/**
 * Last-resort body style sample for a section that is ENTIRELY grid cells —
 * a flat, uncategorized skills chip list with no bold category label to
 * anchor on, or an all-grid language row. `deriveSectionStyle`'s own
 * `bodyElements`/`fallbackBody` intentionally exclude every `grid-member`
 * chip/cell (its label is painted in the pill's own contrast color, e.g.
 * white on a dark fill — never the document's real body text color), so
 * nothing is left to sample from inside that section.
 *
 * Borrows font/color from the first other section in the document that DOES
 * have real body copy, so a converted section reads in the same text color
 * as the rest of the CV instead of a generic hardcoded default. Same
 * "another instance in the document beats a generic default" precedent
 * `resolveSkillChipColors` (skillsLayout.js) already uses for chip pill
 * colors.
 *
 * @param {object[]} list - full document
 * @param {number} pageHeight
 * @param {{ headingId: string }[]} sections - every section in this lane, from `deriveSectionStyle`
 * @param {"section-chrome"|"sidebar-chrome"} chromeRole - lane being sampled
 * @param {string} excludeHeadingId - the section already known to have no usable body
 * @returns {object|null}
 */
function findDocumentBodySample(list, pageHeight, sections, chromeRole, excludeHeadingId) {
  const memberIdsFor = chromeRole === "sidebar-chrome"
    ? (headingId) => sidebarSectionElementIds(list, headingId, pageHeight)
    : (headingId) => sectionElementIds(list, headingId, pageHeight);
  for (const candidate of sections || []) {
    if (candidate.headingId === excludeHeadingId) continue;
    const ids = memberIdsFor(candidate.headingId);
    const found = list
      .filter((element) => ids.has(element.element_id)
        && element.element_id !== candidate.headingId
        && element.flowRole !== chromeRole
        && element.flowRole !== "section-chrome"
        && element.flowRole !== "sidebar-chrome"
        && element.flowRole !== "grid-member"
        && (element.category === "text" || element.category === "textarea"))
      .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight))[0];
    if (found) return found;
  }
  return null;
}

/**
 * Derive a style profile from the document's last section so a newly added
 * section matches the active template (heading font, rule, decorative shapes, body copy).
 *
 * Sampling the LAST section keeps the new section visually consistent with the
 * content it will sit directly beneath. When no section exists, returns a copy
 * of the template-neutral defaults (narrow rail defaults when `lane: "sidebar"`).
 *
 * Pass `lane: "sidebar"` (or a sidebar `fromHeadingId`) to sample the rail.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @param {string|null} [fromHeadingId] sample this section instead of the last one
 * @param {{ lane?: "main"|"sidebar"|null }} [options]
 * @returns {object} style profile (see plan `SectionStyle`)
 */
export function deriveSectionStyle(
  elements,
  pageHeight = 842,
  fromHeadingId = null,
  options = {},
) {
  const list = elements || [];
  const fromHeading = fromHeadingId
    ? list.find((element) => element.element_id === fromHeadingId)
    : null;
  const intoSidebar = options.lane === "sidebar"
    || (fromHeading && isSidebarSectionHeading(fromHeading));
  const defaults = intoSidebar ? DEFAULT_SIDEBAR_SECTION_STYLE : DEFAULT_SECTION_STYLE;
  const sections = intoSidebar
    ? listSidebarSections(list, pageHeight)
    : listDocumentSections(list, pageHeight);
  if (sections.length === 0) {
    return JSON.parse(JSON.stringify(defaults));
  }

  const target = (fromHeadingId
    && sections.find((section) => section.headingId === fromHeadingId))
    || sections[sections.length - 1];
  const heading = list.find((element) => element.element_id === target.headingId) || null;
  const memberIds = intoSidebar
    ? sidebarSectionElementIds(list, target.headingId, pageHeight)
    : sectionElementIds(list, target.headingId, pageHeight);
  const members = list.filter((element) => memberIds.has(element.element_id));
  const chromeRole = intoSidebar ? "sidebar-chrome" : "section-chrome";

  // Resolve the heading's left edge before sampling so candidates can be
  // constrained to the heading's column. The LAST section has no lower Y bound,
  // so on sidebar / two-column templates `members` may include sidebar chrome
  // sitting below the heading. Sampling those elements would yield a wrong
  // marker offset (`relLeft`) or body/rule color. The left-proximity band
  // mirrors the same-column check in `hasSectionRuleBelow` (widened from 40 to
  // 60 so an offset marker at roughly -25px and normal body copy stay in scope).
  const headingLeft = Number(heading?.left);
  const left = Number.isFinite(headingLeft) ? headingLeft : defaults.left;
  const inHeadingColumn = (element) => Math.abs((Number(element.left) || 0) - left) <= 60;

  // Widest thin line in the section is the heading rule. Main column requires
  // width ≥ 120 (Monument's accent rule). Sidebar rules are often ~50px wide,
  // so the rail path accepts any thin line in the section strip.
  const rule = members
    .filter((element) => element.category === "line"
      && (intoSidebar || (Number(element.width) || 0) >= 120)
      && (Number(element.height) || 0) <= 4)
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0] || null;

  // Decorative shapes cluster near the heading's own left edge in most
  // templates (Nimbus, Monument, Cinder, …), but Cinder places its
  // mark at the FAR RIGHT end of the underline rule instead (16px square at
  // left=526, heading at left=76, rule spanning 76..542) — ~450px from the
  // heading, well outside the heading-only column band. Once the rule is
  // known, its own span is an equally valid "same column" region: a shape
  // near either end of the rule the section actually draws is part of this
  // section, not a different column's sidebar chrome.
  const inDecorativeShapeColumn = (element) => {
    const elementLeft = Number(element.left) || 0;
    if (inHeadingColumn(element)) return true;
    if (!rule) return false;
    const ruleLeft = Number(rule.left) || left;
    const ruleRight = ruleLeft + (Number(rule.width) || 0);
    return elementLeft >= ruleLeft - 60 && elementLeft <= ruleRight + 60;
  };

  // Every tagged shape offset from the label (marker, badge square, icon
  // frame, accent tick, …) is a decorative shape to replicate. Size is not a
  // filter here — templates range from an 8px marker dot (Cinder) to a 32px
  // badge block plus a 251px label frame (Monument). Only the identified rule
  // and decorative text are excluded (see DECORATIVE_SHAPE_CATEGORIES doc).
  const decorativeShapes = members.filter((element) => element.element_id !== target.headingId
    && element.element_id !== rule?.element_id
    && element.flowRole === chromeRole
    && inDecorativeShapeColumn(element)
    && DECORATIVE_SHAPE_CATEGORIES.has(element.category))
    .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight)
      || (Number(a.left) || 0) - (Number(b.left) || 0));

  // Decorative ordinal badge (Monument's "01"/"02"/…): sample its styling so
  // a new section can stamp its own computed position in the document, but
  // never its sampled digits — those belong to the section it was copied
  // from. `digits` records how many characters the sampled number had, so
  // the caller can zero-pad the new ordinal to match ("04" -> 2 digits).
  const badgeNumberElement = members.find((element) => element.element_id !== target.headingId
    && element.flowRole === chromeRole
    && isDecorativeOrdinalChrome(element)
    && (element.category === "text" || element.category === "textarea")) || null;
  const badgeNumber = badgeNumberElement
    ? {
      fontSize: Number(badgeNumberElement.fontSize) || defaults.heading.fontSize,
      fontFamily: String(badgeNumberElement.fontFamily || defaults.heading.fontFamily),
      color: String(badgeNumberElement.color || defaults.heading.color),
      bold: Boolean(badgeNumberElement.bold),
      digits: String(badgeNumberElement.content || "").trim().length || 2,
      relLeft: (Number(badgeNumberElement.left) || 0) - left,
      relTop: absoluteTop(badgeNumberElement, pageHeight) - absoluteTop(heading, pageHeight),
    }
    : null;

  // Body copy: non-chrome content elements, in reading order.
  const bodyElements = members
    .filter((element) => element.element_id !== target.headingId
      && element.flowRole !== chromeRole
      && element.flowRole !== "section-chrome"
      && element.flowRole !== "sidebar-chrome"
      && inHeadingColumn(element)
      && element.category !== "line")
    .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight));
  // Language / skill grids use many narrow `grid-member` cells. Prefer a
  // linear body (full column width) for style sampling so a transfer / add
  // after Języki does not inherit a ~70px cell width and crush the new body.
  const linearBodies = bodyElements.filter((element) => element.flowRole !== "grid-member");
  // Sidebar bodies often sit left of the kicker (heading 51, body 25). Fall
  // back to any in-strip content when the heading-column band misses them.
  // Excludes `grid-member` for the same reason `linearBodies` does above: a
  // chip pill's label is painted in the pill's own contrast color (e.g. white
  // on a dark fill), never the document's real body text color, so it must
  // never become the sampled "body" style either.
  const fallbackBody = members
    .filter((element) => element.element_id !== target.headingId
      && element.flowRole !== chromeRole
      && element.flowRole !== "section-chrome"
      && element.flowRole !== "sidebar-chrome"
      && element.flowRole !== "grid-member"
      && (element.category === "text" || element.category === "textarea"))
    .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight))[0]
    || null;
  // Prefer description / bullet copy over the first linear element. Experience
  // records put a larger bold job title first; sampling that made transferred
  // Summary / Languages inherit ~11px title type instead of ~9.5px body.
  //
  // A section that is ENTIRELY grid cells (a flat, uncategorized skills chip
  // list with no bold category label to anchor on, or an all-grid language
  // row) has no candidate left at this point — `bodyElements`/`fallbackBody`
  // both excluded every grid-member chip/cell on purpose. Borrow font/color
  // from another section's own body copy elsewhere in the document instead of
  // a generic hardcoded default, so a converted skills section reads in the
  // same text color as the rest of the CV (same "another instance in the
  // document beats a generic default" precedent `resolveSkillChipColors`
  // already uses for chip pill colors).
  const body = pickLinearBodySample(linearBodies)
    || fallbackBody
    || findDocumentBodySample(list, pageHeight, sections, chromeRole, target.headingId);

  // Column width: widest linear body → section rule → never a single grid cell
  // or a short title line. Rule width matches Experience / Education on Sterling.
  // When the sampled section is Languages-only, `linearBodies` is empty — fall
  // through to the underline rule before any ~70px CEFR cell width.
  const widthSource = linearBodies.reduce((best, element) => (
    (Number(element.width) || 0) > (Number(best?.width) || 0) ? element : best
  ), null) || linearBodies[0] || null;
  // A section's own rule is NOT always a reliable proxy for the body's left
  // margin / column width: several templates draw a "trailing" rule that
  // starts well AFTER the heading label rather than at the body's left edge
  // (Cardinal — `rule_left = heading_x + label_width + 14`, see the
  // `labelGap` handling below), or a short unrelated accent tick offset from
  // the body entirely (Monument's `_line(369, ..., 160, 2, ...)` beside a
  // heading whose body starts at 102). Using such a rule as the width/left
  // source for a grid-only section (a flat, uncategorized skills chip list,
  // an all-grid language row — no local linear body to sample from) parks
  // the restyled content under the trailing rule instead of the real column,
  // which reads as the whole block being shifted/narrowed. `body` (sampled
  // above — possibly borrowed from another section via
  // `findDocumentBodySample`) is a real content element, so it is a more
  // trustworthy width/left source than that rule whenever it is available.
  const geometrySource = (body && body.flowRole !== "grid-member") ? body : null;
  const recordWidth = Number(widthSource?.width)
    || Number(geometrySource?.width)
    || Number(rule?.width)
    || defaults.recordWidth;
  // Content column may sit left of the title (Monument body at 102, title at 118).
  const bodyLeftRaw = Number(
    widthSource?.left
    ?? geometrySource?.left
    ?? rule?.left,
  );
  const bodyLeft = Number.isFinite(bodyLeftRaw) ? bodyLeftRaw : left;

  // Muted color: a body line whose color differs from the main body color
  // (typically the meta line). Best-effort — falls back to the body color.
  const bodyColor = String(body?.color || defaults.body.color);
  const mutedPool = bodyElements.length > 0
    ? bodyElements
    : (body ? [body] : []);
  const mutedElement = mutedPool.find((element) => String(element.color || "") && String(element.color) !== bodyColor);
  const mutedColor = mutedElement ? String(mutedElement.color) : defaults.mutedColor;
  const headingFontSize = Number(heading?.fontSize) || defaults.heading.fontSize;
  const headingLetterSpacing = Number(heading?.letterSpacing) || 0;
  const estimatedHeadingWidth = String(heading?.content || "").length
    * (headingFontSize * 0.58 + headingLetterSpacing);

  return {
    left,
    bodyLeft,
    recordWidth,
    heading: {
      fontSize: headingFontSize,
      fontFamily: String(heading?.fontFamily || defaults.heading.fontFamily),
      color: String(heading?.color || defaults.heading.color),
      letterSpacing: Number(heading?.letterSpacing) || 0,
      bold: Boolean(heading?.bold),
    },
    rule: rule
      ? {
        width: Number(rule.width) || recordWidth,
        height: Number(rule.height) || 1,
        backgroundColor: String(rule.backgroundColor || defaults.rule.backgroundColor),
        relLeft: (Number(rule.left) || 0) - left,
        // Trailing midline rules (Cardinal) must preserve the whitespace after
        // the label, not the source label's absolute rule start. The builder
        // combines this sampled gap with the new label width and retains the
        // original right edge.
        labelGap: ((Number(rule.left) || 0) - left) - estimatedHeadingWidth,
        // Vertical offset from the title baseline. Monument's accent rule sits
        // mid-band (~+7), not flush under the label like Builder.line (~+fs*1.35).
        // Without this, built sections park the rule ~10px too low beside the frame.
        relTop: absoluteTop(rule, pageHeight) - absoluteTop(heading, pageHeight),
      }
      : null,
    markers: decorativeShapes.map((shape) => {
      const built = {
        category: shape.category,
        width: Number(shape.width) || 8,
        height: Number(shape.height) || 8,
        backgroundColor: String(shape.backgroundColor || defaults.heading.color),
        relLeft: (Number(shape.left) || 0) - left,
        relTop: absoluteTop(shape, pageHeight) - absoluteTop(heading, pageHeight),
      };
      if (shape.category === "rectangle" || shape.category === "circle" || shape.category === "ellipse") {
        built.borderWidth = Number(shape.borderWidth) || 1;
      }
      if (shape.category === "circle" || shape.category === "ellipse") {
        built.filled = Boolean(shape.filled);
      }
      // Iconic section glyphs: keep the asset URL and text-alignment flag so
      // buildSectionElements can place the same size/offset with a chosen icon.
      if (shape.category === "image") {
        built.src = String(shape.src || "");
        built.alignWithText = Boolean(shape.alignWithText);
      }
      return built;
    }),
    badgeNumber,
    body: {
      fontSize: Number(body?.fontSize) || defaults.body.fontSize,
      fontFamily: String(body?.fontFamily || defaults.body.fontFamily),
      lineHeight: Number(body?.lineHeight) || Math.round((Number(body?.fontSize) || defaults.body.fontSize) * 1.4),
      color: bodyColor,
    },
    mutedColor,
  };
}

/**
 * Canonical heading→rule vertical offset (top-to-top) for a section built or
 * transferred into a lane.
 *
 * `compactChromeCluster` treats explicitly-owned section chrome as a rigid
 * composition and PRESERVES each piece's authored offset from the heading
 * (see the `explicitlyOwned` branch), so it never normalises the heading→rule
 * gap. A section moved between the sidebar and the main column must therefore
 * park its rule at the DESTINATION lane's sampled `rule.relTop` (from
 * `deriveSectionStyle`) — the same offset every other section in that lane
 * already uses. Parking it at `headingHeight + 2` instead (the old transfer
 * default) made the moved section's heading→rule gap differ from its
 * neighbours; the fallback is only used when the sampled style had no rule.
 *
 * A sampled offset of zero or negative is a REAL, valid rule position, not a
 * missing one — `deriveSectionStyle` already returns `style.rule === null`
 * when no rule element was found at all, so reaching this function with a
 * non-null `style.rule` means the offset is genuine. Cardinal's section rule
 * is a "trailing" hairline that continues from the heading label at the
 * label's own cap-midline, not a typical underline below it (see
 * `cap_midline_offset` in `backend/.../cardinal.py`'s `section()`), which
 * samples as a small NEGATIVE `relTop` (the rule sits a hair above the
 * heading's own stored top). Rejecting non-positive values here previously
 * fell through to the `headingHeight + 2` underline default on every skills
 * mode conversion — visibly relocating Cardinal's rule downward and, because
 * body content is placed `afterRule` below that same wrong `ruleTop`,
 * opening an oversized gap between the heading and the section body.
 *
 * @param {object} style - `deriveSectionStyle` result for the destination lane.
 * @param {number} headingHeight - restyled heading height, fallback only.
 * @returns {number}
 */
export function sectionChromeRuleRelTop(style, headingHeight) {
  const sampled = Number(style?.rule?.relTop);
  if (Number.isFinite(sampled)) return sampled;
  return (Number(headingHeight) || 12) + 2;
}

// Profile-photo slot detection lives in `profilePhoto.js` (frame/glyph/ornament
// contract for Slate, Tessera, Harbor). Re-exported here so existing
// imports keep working.
export { findProfilePhotoSlot, applyProfilePhoto, hasProfilePhotoSlot } from "./profilePhoto.js";
