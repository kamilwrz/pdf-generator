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
 * heading gap has been corrupted by an earlier pack (Regent uses 36,
 * solid-band templates like Cinder use ~32 — both sit in this band).
 */
const DEFAULT_MASTHEAD_CLEARANCE = 36;
/**
 * Iconic mastheads (Nova / Cardinal / Volt) author 8–18px under the divider;
 * Regent/Aldine sit nearer 20–40px. Only gaps outside this window are treated
 * as corruption and replaced with DEFAULT_MASTHEAD_CLEARANCE.
 */
const MIN_AUTHORED_MASTHEAD_CLEARANCE = 6;
const MAX_AUTHORED_MASTHEAD_CLEARANCE = 56;

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

  // Contact lines sit just above the Regent/Aldine/Nova header rule and match
  // the legacy "short label + rule below" heuristic — reject them explicitly.
  if (content.includes("@")) return false;
  if ((content.match(/·/g) || []).length >= 1 && /\d/.test(content)) return false;
  // Phone-only masthead labels (Nova/Cardinal icon rows) have no @ / mid-dot.
  if (/^\+?\d[\d\s().\-/]{5,}$/.test(content)) return false;
  // Untagged education/experience period lines ("2011 – 2016") sit above the
  // next section rule after a pack and must not become phantom headings.
  if (/^\d{4}\s*[–—\-]\s*(?:\d{4}|obecnie|present|now)\s*$/i.test(content)) {
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
 * (Regent/Aldine) and absorbing them into the section chrome cluster
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
 * Two-column templates (Tessera, Slate, Manifest, Harbor — `layouts: ["sidebar", …]`)
 * place a narrow rail beside the main content column. Sidebar kickers are
 * tagged `flowRole: "sidebar-chrome"` + `flowLane: "sidebar"` (see e.g.
 * `tessera.py` / `manifest.py` `sidebar_heading()` / `sidebar_kicker()`), so
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
      // Explicit sidebar lane (Tessera / Slate / Manifest / Harbor) never joins
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
 * Regent-style 36px fallback is never intentional for them.
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
 * (Regent) or climb into the header band.
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
  // League" masthead (Portico) and non-iconic templates (Regent / Aldine) use
  // the wider default. `hasCenteredMasthead` keeps Portico out of the tight band.
  const tightIconic = hasIconicMasthead(list) && !hasCenteredMasthead(list);
  return mastheadBottom + (
    tightIconic ? 10 : DEFAULT_MASTHEAD_CLEARANCE
  );
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

  const start = sections[index].startAbs;
  const end = index + 1 < sections.length
    ? sections[index + 1].startAbs
    : Number.POSITIVE_INFINITY;
  const ids = new Set();

  for (const element of list) {
    if (!element || element.fixedToPage) continue;
    if (element.flowRole === "masthead") continue;
    if (!isSidebarLaneElement(element)) continue;
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

  // Keep the rail top at the current topmost kicker (Y order), not the first
  // heading of the new order — otherwise moving the bottom section up would
  // drag the whole rail under the masthead.
  const railAnchor = sections[0];
  const firstHeading = list.find((element) => element.element_id === railAnchor.headingId);
  let cursorAbs = firstHeading
    ? resolveSectionChromeBandStart(list, firstHeading, pageHeight)
    : railAnchor.startAbs;

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
 * Aldine, Regent, etc.: heading at 0, marks near +2, wide rule flush under label.
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
      // label — not the +2 mark offset used for small Cinder/Regent dots.
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
  const explicitlyOwned = chromeElements.every(
    (element) => element.flowRole === "section-chrome",
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
    // slider is used. The two legacy-corruption signatures above remain
    // repairable, while healthy custom compositions keep their exact geometry.
    const items = chromeElements.map((element) => ({
      element,
      relTop: absoluteTop(element, pageHeight) - headingAbs,
    }));
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
  // into the middle of experience records.
  const chrome = [];
  const body = [];
  for (const element of sectionElements) {
    if (isSectionChromeMember(element, sectionElements, pageHeight)) {
      chrome.push(element);
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

  for (let index = 0; index < bodySorted.length; index += 1) {
    const element = bodySorted[index];
    if (items.length === 0) {
      items.push({ element, relTop: 0, leadingChrome: false });
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
      continue;
    }

    const previous = items[items.length - 1];
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
  }

  return items;
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

  if (height <= pageCapacity && top + height > contentBottom) {
    page += 1;
    top = pageTop;
  } else if (top < pageTop && page > 1) {
    // Landed inside the previous page's top margin band after a naive abs map.
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
  const end = strip[endIndex];
  return Math.max(
    1,
    (end.relTop - start.relTop) + elementHeight(end.element),
  );
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
      reservedHeight = strip[recordEnd].relTop + elementHeight(strip[recordEnd].element);
    }
  } else if (strip.length > 0) {
    const recordEnd = flowGroupEndIndex(strip, 0);
    reservedHeight = strip[recordEnd].relTop + elementHeight(strip[recordEnd].element);
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

      const group = flowGroupOf(item.element);
      const startsRecord = Boolean(group) && group !== activeGroup;
      const continuesRecord = Boolean(group) && group === activeGroup;

      if (continuesRecord && activeGroupPage != null) {
        // Already reserved with the record start — keep mates on that page.
        // Independent placeAtFlowCursor(height) could still bump a tall last
        // line alone if the first-line reservation used a shorter measure.
        const page = activeGroupPage;
        let top = desiredAbs - (page - 1) * pageHeight;
        if (top < pageTop && page > 1) {
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
 * knobs reach Tessera / Slate / Manifest / Harbor rails without folding them
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
  let next = elements || [];
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
  // templates (Regent, Aldine, Kernel, Monument, …), but Cinder places its
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
  // filter here — templates range from an 8px marker dot (Regent) to a 32px
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
  // Sidebar bodies often sit left of the kicker (heading 51, body 25). Fall
  // back to any in-strip content when the heading-column band misses them.
  const body = bodyElements[0]
    || members
      .filter((element) => element.element_id !== target.headingId
        && element.flowRole !== chromeRole
        && element.flowRole !== "section-chrome"
        && element.flowRole !== "sidebar-chrome"
        && (element.category === "text" || element.category === "textarea"))
      .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight))[0]
    || null;

  const recordWidth = Number(body?.width) || Number(rule?.width) || defaults.recordWidth;
  // Content column may sit left of the title (Monument body at 102, title at 118).
  const bodyLeftRaw = Number(body?.left);
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

// Profile-photo slot detection lives in `profilePhoto.js` (frame/glyph/ornament
// contract for Slate, Tessera, Aldine, Harbor). Re-exported here so existing
// imports keep working.
export { findProfilePhotoSlot, applyProfilePhoto, hasProfilePhotoSlot } from "./profilePhoto.js";
