/**
 * Skills section layout helpers for main ↔ sidebar transfers.
 *
 * Generators place grouped skills in the main column as bold category labels
 * plus chip bodies (`_place_skills_section`). The rail keeps one textarea in
 * `_skills_sidebar_content` form (category line, then bullet items). Transfer
 * must expand / collapse that shape so font, width, and subcategory structure
 * match Experience after the move — a naive width-only restyle leaves an
 * orphaned heading and a tall sidebar-shaped body on the next page.
 */
import { measureTextareaHeight } from "./textareaHeight.js";
import {
  FLAT_SECTION_LAYOUT_BULLET,
  FLAT_SECTION_LAYOUT_INLINE,
  formatFlatListContent,
  parseFlatListItems,
} from "./flatSectionLayout.js";
import { isSkillsSectionTitle } from "./sectionRecord.js";
import { sectionChromeRuleRelTop } from "./sectionStructure.js";

export { isSkillsSectionTitle };

/** Third main-column skills layout, alongside `FLAT_SECTION_LAYOUT_INLINE` / `_BULLET`. */
export const SKILLS_LAYOUT_CHIPS = "chips";

export const SKILL_CHIP_VARIANT_PILL_FILLED = "pill-filled";
export const SKILL_CHIP_VARIANT_PILL_OUTLINE = "pill-outline";
export const SKILL_CHIP_VARIANT_RECT_FILLED = "rect-filled";
export const SKILL_CHIP_VARIANT_RECT_OUTLINE = "rect-outline";
export const SKILL_CHIP_VARIANT_ROUNDED_OUTLINE = "rounded-outline";
export const SKILL_CHIP_VARIANT_ROUNDED_FILLED = "rounded-filled";
export const SKILL_CHIP_VARIANT_UNDERLINE = "underline";

/** Every chip treatment exposed by the Skills layout picker, in display order. */
export const SKILL_CHIP_VARIANTS = [
  SKILL_CHIP_VARIANT_PILL_FILLED,
  SKILL_CHIP_VARIANT_PILL_OUTLINE,
  SKILL_CHIP_VARIANT_RECT_FILLED,
  SKILL_CHIP_VARIANT_RECT_OUTLINE,
  SKILL_CHIP_VARIANT_ROUNDED_OUTLINE,
  SKILL_CHIP_VARIANT_ROUNDED_FILLED,
  SKILL_CHIP_VARIANT_UNDERLINE,
];

const SKILL_CHIP_VARIANT_SET = new Set(SKILL_CHIP_VARIANTS);

/** Unknown or legacy values deliberately fall back to the original filled pill. */
export function normalizeSkillChipVariant(variant) {
  return SKILL_CHIP_VARIANT_SET.has(variant)
    ? variant
    : SKILL_CHIP_VARIANT_PILL_FILLED;
}

function chipVariantGeometry(variant, chipHeight) {
  const normalized = normalizeSkillChipVariant(variant);
  const pillRadius = chipHeight / 2;
  const roundedRadius = Math.min(6, pillRadius);
  return {
    variant: normalized,
    filled: normalized === SKILL_CHIP_VARIANT_PILL_FILLED
      || normalized === SKILL_CHIP_VARIANT_RECT_FILLED
      || normalized === SKILL_CHIP_VARIANT_ROUNDED_FILLED,
    underline: normalized === SKILL_CHIP_VARIANT_UNDERLINE,
    borderRadius: normalized === SKILL_CHIP_VARIANT_PILL_FILLED
      || normalized === SKILL_CHIP_VARIANT_PILL_OUTLINE
      ? pillRadius
      : normalized === SKILL_CHIP_VARIANT_ROUNDED_OUTLINE
        || normalized === SKILL_CHIP_VARIANT_ROUNDED_FILLED
        ? roundedRadius
        : 0,
  };
}

/** Every mode the main-column skills layout picker offers, in display order. */
export const SKILLS_LAYOUT_MODES = [
  FLAT_SECTION_LAYOUT_INLINE,
  FLAT_SECTION_LAYOUT_BULLET,
  SKILLS_LAYOUT_CHIPS,
];

/** Matches backend `_LEADING_BULLET` / sidebar skill item markers. */
const LEADING_BULLET_RE = /^[\s]*[•\-–*—∙·]\s+(.*)$/;

/**
 * Allocate an id for a composite sidebar body that did not exist in `members`.
 *
 * The aggregate represents several category/body records, so inheriting one
 * source id would falsely tell `syncCvDataFromCanvas` that the corresponding
 * profile leaf was manually replaced with the complete serialized section.
 */
function compositeSidebarBodyId(members, headingId) {
  const sourceIds = new Set((members || []).map((element) => element?.element_id));
  const base = `${headingId}-skills-sidebar-composite`;
  let candidate = base;
  let suffix = 2;
  while (sourceIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isSkillsSectionHeading(title) {
  return isSkillsSectionTitle(title);
}

/**
 * Parse a sidebar (or flat) skills textarea into `{ category, items }[]`.
 *
 * Mirrors `_skills_sidebar_content` round-trip:
 *   Python
 *   • Backend development
 *   C++
 *   • OOP
 *
 * Flat mid-dot / bullet lists without category lines become one untitled group.
 *
 * @param {string} content
 * @param {boolean} [bulletList=false]
 * @returns {{ category: string, items: string[] }[]}
 */
export function parseSkillsSidebarContent(content, bulletList = false) {
  const text = String(content || "");
  if (!text.trim()) return [];

  // Flat mid-dot / bulletList chip rows have no category labels — keep them
  // as one untitled group before the category/bullet scanner invents a label.
  const hasBulletLine = text.split("\n").some((line) => LEADING_BULLET_RE.test(line.trim()));
  const hasMidDot = /\s·\s/.test(text);
  if (!hasBulletLine && (hasMidDot || bulletList)) {
    const items = parseFlatListItems(text, Boolean(bulletList));
    if (items.length > 0) return [{ category: "", items }];
  }

  const lines = text.split("\n");
  const groups = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.category || current.items.length > 0) {
      groups.push({
        category: current.category,
        items: current.items.slice(),
      });
    }
    current = null;
  };

  for (const raw of lines) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const bulletMatch = line.match(LEADING_BULLET_RE);
    if (bulletMatch) {
      if (!current) current = { category: "", items: [] };
      const item = bulletMatch[1].trim();
      if (item) current.items.push(item);
      continue;
    }
    // Non-bullet line starts a new named category.
    pushCurrent();
    current = { category: line, items: [] };
  }
  pushCurrent();

  if (groups.length > 0) {
    // Lines without any bullet markers are chip names (AML / KYC / SQL), not
    // empty subcategory headers. Only keep category/item pairs when at least
    // one group actually collected bullet children.
    const allCategoriesNoItems = groups.every((group) => (
      group.category && group.items.length === 0
    ));
    if (allCategoriesNoItems && !hasBulletLine) {
      return [{ category: "", items: groups.map((group) => group.category) }];
    }
    return groups;
  }

  const items = parseFlatListItems(text, Boolean(bulletList));
  if (items.length === 0) return [];
  return [{ category: "", items }];
}

/** Reading-order comparator (top, then left) shared by the chip/body collectors below. */
function byReadingOrder(a, b) {
  const topA = Number(a.top) || 0;
  const topB = Number(b.top) || 0;
  if (topA !== topB) return topA - topB;
  return (Number(a.left) || 0) - (Number(b.left) || 0);
}

/**
 * Return authored category text and editor-only starter guidance separately.
 *
 * Fresh categorized Skills sections keep category content empty and display a
 * placeholder. Layout conversions must preserve that placeholder without
 * turning it into authored content that could reach `cv_data.skills` or PDF.
 */
function skillCategoryDescriptor(element) {
  const category = String(element?.content || "").trim();
  const categoryPlaceholder = category
    ? ""
    : String(element?.placeholder || "").trim();
  return {
    category,
    ...(categoryPlaceholder ? { categoryPlaceholder } : {}),
  };
}

/**
 * Collect skill groups from a chip-mode section: `buildSkillsChipGroups`
 * stamps one `flowGroup` per category (bold label + every one of its chip
 * rect/text pairs, matching the backend's `keep_together` per group), so each
 * chip's own short `text` label must NOT be read as its own group the way a
 * full-content textarea body is in the inline/bullet shapes below — it is one
 * item among many sharing that flowGroup's items list.
 *
 * @param {object[]} members
 * @returns {{ category: string, categoryPlaceholder?: string, items: string[] }[]}
 */
function collectSkillGroupsFromChips(members) {
  const categoryByGroup = new Map();
  for (const element of members) {
    // A category label's `flowRole` is NOT reliably `"content"`: the backend
    // generator's `_place_skills_section` emits it via `b.block(...)`, which
    // never stamps a `flowRole` at all (only `keep_together` sets
    // `flowGroup`) — only a section already round-tripped through this same
    // JS restyle path carries the explicit `"content"` tag. Excluding the
    // chrome/grid-member roles (the convention every other collector in this
    // module already follows) recognises the label either way instead of
    // silently dropping it for a document straight off the generator.
    if (
      element.flowRole !== "grid-member"
      && element.flowRole !== "section-chrome"
      && element.flowRole !== "sidebar-chrome"
      && Boolean(element.bold)
      && (element.category === "textarea" || element.category === "text")
    ) {
      categoryByGroup.set(element.flowGroup, skillCategoryDescriptor(element));
    }
  }

  const itemsByGroup = new Map();
  const order = [];
  const chipLabels = members
    .filter((element) => element.flowRole === "grid-member" && element.category === "text")
    .sort(byReadingOrder);
  for (const label of chipLabels) {
    const group = label.flowGroup || "";
    if (!itemsByGroup.has(group)) {
      itemsByGroup.set(group, []);
      order.push(group);
    }
    const skill = String(label.content || "").trim();
    if (skill) itemsByGroup.get(group).push(skill);
  }

  return order
    .map((group) => ({
      ...(categoryByGroup.get(group) || { category: "" }),
      items: itemsByGroup.get(group),
    }))
    .filter((group) => group.category || group.categoryPlaceholder || group.items.length > 0);
}

/**
 * Collect skill groups from section members (sidebar textarea, main
 * category + body pairs, or main category + wrapped chip pills).
 *
 * @param {object[]} members
 * @param {string} headingId
 * @returns {{ category: string, categoryPlaceholder?: string, items: string[] }[]}
 */
export function collectSkillGroups(members, headingId) {
  const pool = (members || []).filter((element) => element && element.element_id !== headingId);
  const hasChips = pool.some((element) => (
    element.flowRole === "grid-member" && element.category === "text"
  ));
  if (hasChips) return collectSkillGroupsFromChips(pool);

  const bodies = pool
    .filter((element) => element
      && element.flowRole !== "section-chrome"
      && element.flowRole !== "sidebar-chrome"
      && (element.category === "textarea" || element.category === "text")
      && element.category !== "line")
    .sort(byReadingOrder);

  if (bodies.length === 0) return [];

  // Single body → sidebar / flat shape.
  if (bodies.length === 1) {
    return parseSkillsSidebarContent(bodies[0].content, Boolean(bodies[0].bulletList));
  }

  // Main-column shape: bold category label + following body, optionally
  // sharing a flowGroup. Untagged stacks still pair bold-then-body by order.
  const groups = [];
  let pendingCategory = null;
  for (const element of bodies) {
    const categoryDescriptor = skillCategoryDescriptor(element);
    const displayedCategory = categoryDescriptor.category
      || categoryDescriptor.categoryPlaceholder
      || "";
    const isCategory = Boolean(element.bold)
      && !element.bulletList
      && displayedCategory
      && !displayedCategory.includes("\n")
      && !LEADING_BULLET_RE.test(displayedCategory);
    if (isCategory) {
      if (pendingCategory) {
        groups.push({ ...pendingCategory, items: [] });
      }
      pendingCategory = categoryDescriptor;
      continue;
    }
    const items = parseFlatListItems(element.content, Boolean(element.bulletList));
    groups.push({ ...(pendingCategory || { category: "" }), items });
    pendingCategory = null;
  }
  if (pendingCategory) {
    groups.push({ ...pendingCategory, items: [] });
  }
  return groups.filter((group) => (
    group.category || group.categoryPlaceholder || group.items.length > 0
  ));
}

/**
 * Serialise groups back to the sidebar single-textarea form.
 *
 * @param {{ category: string, items: string[] }[]} groups
 * @returns {string}
 */
export function formatSkillsSidebarContent(groups) {
  const parts = [];
  for (const group of groups || []) {
    const category = String(group?.category || "").trim();
    const body = formatFlatListContent(group?.items || [], FLAT_SECTION_LAYOUT_BULLET);
    if (category) parts.push(category);
    if (body.content) parts.push(body.content);
  }
  return parts.join("\n");
}

/**
 * Build main-column skill subcategory blocks (bold category + body).
 *
 * Each category + body shares a `flowGroup` so the packer keep-together rules
 * match `_place_skills_section` and cannot orphan the section heading alone.
 *
 * @param {{ category: string, items: string[] }[]} groups
 * @param {{
 *   bodyLeft: number,
 *   recordWidth: number,
 *   body: object,
 *   appendTop: number,
 *   idFactory: () => string,
 *   stackGap?: number,
 *   recordGap?: number,
 *   mode?: "inline"|"bullet",
 * }} options
 * @returns {object[]}
 */
export function buildSkillsMainGroups(groups, options) {
  const list = (groups || []).filter((group) => (
    String(group?.category || "").trim()
    || String(group?.categoryPlaceholder || "").trim()
    || (group?.items || []).length > 0
  ));
  if (list.length === 0) return [];

  const bodyLeft = Number(options.bodyLeft) || 0;
  const recordWidth = Number(options.recordWidth) || 300;
  const body = options.body || {};
  const bodyFs = Number(body.fontSize) || 9.5;
  const bodyLh = Number(body.lineHeight) || bodyFs * 1.4;
  // Backend: category_fs = max(body_fs, 9.5); cat_lh = cat_fs + 2.
  const catFs = Math.max(bodyFs, 9.5);
  const catLh = catFs + 2;
  const bodyColor = body.color || "#26313F";
  const fontFamily = body.fontFamily || "Montserrat";
  const stackGap = Number.isFinite(Number(options.stackGap)) ? Number(options.stackGap) : 4;
  const recordGap = Number.isFinite(Number(options.recordGap)) ? Number(options.recordGap) : 10;
  const idFactory = options.idFactory || (() => `skill-${Math.random().toString(36).slice(2, 9)}`);
  const layoutStyle = options.mode === FLAT_SECTION_LAYOUT_BULLET
    ? FLAT_SECTION_LAYOUT_BULLET
    : FLAT_SECTION_LAYOUT_INLINE;
  let cursor = Number(options.appendTop) || 0;
  const elements = [];

  list.forEach((group, index) => {
    const category = String(group.category || "").trim();
    const categoryPlaceholder = category
      ? ""
      : String(group.categoryPlaceholder || "").trim();
    const displayedCategory = category || categoryPlaceholder;
    const formatted = formatFlatListContent(group.items || [], layoutStyle);
    const flowGroup = `skill-group-${idFactory()}`;
    const hasBody = Boolean(formatted.content);

    if (displayedCategory) {
      const catH = measureTextareaHeight(displayedCategory, recordWidth, catFs, catLh);
      elements.push({
        element_id: idFactory(),
        category: "textarea",
        content: category,
        ...(categoryPlaceholder ? {
          placeholder: categoryPlaceholder,
          starterPlaceholder: true,
        } : {}),
        left: bodyLeft,
        top: cursor,
        width: recordWidth,
        height: Math.max(catH, catLh),
        fontSize: catFs,
        lineHeight: catLh,
        fontFamily,
        color: bodyColor,
        bold: true,
        italic: false,
        align: "left",
        bulletList: false,
        autoHeight: true,
        preserveInitialLayout: false,
        flowRole: "content",
        flowGroup,
        page: 1,
        zIndex: 3,
      });
      cursor += Math.max(catH, catLh);
      if (hasBody) cursor += stackGap;
    }

    if (hasBody) {
      const bodyH = measureTextareaHeight(
        formatted.content, recordWidth, bodyFs, bodyLh, { bulletList: formatted.bulletList },
      );
      elements.push({
        element_id: idFactory(),
        category: "textarea",
        content: formatted.content,
        left: bodyLeft,
        top: cursor,
        width: recordWidth,
        height: bodyH,
        fontSize: bodyFs,
        lineHeight: bodyLh,
        fontFamily,
        color: bodyColor,
        bold: false,
        italic: false,
        align: "left",
        bulletList: formatted.bulletList,
        autoHeight: true,
        preserveInitialLayout: false,
        flowRole: "content",
        flowGroup,
        page: 1,
        zIndex: 3,
      });
      cursor += bodyH;
    }

    if (index < list.length - 1) cursor += recordGap;
  });

  return elements;
}

/**
 * Estimate one-line text width in px. Mirrors the `fontSize * 0.56` per
 * character approximation already used elsewhere on the canvas side
 * (`elementBounds.js`, `spacingGuides.js`, `textareaReflow.js`) — there is no
 * DOM/canvas text metrics API available where this runs (pure layout
 * functions, also exercised from Node tests). Not pixel-exact, but the
 * backend's own `_layout_skill_chips` wraps on the same kind of estimate
 * (`_text_width`), so wrapping decisions stay close enough that a
 * regenerated PDF does not reflow chip rows differently than the canvas.
 */
function estimateTextWidth(text, fontSize) {
  return Math.max(1, String(text || "").length) * (Number(fontSize) || 9) * 0.56;
}

/** Horizontal/vertical pill padding and gaps, px — mirrors backend `CHIP_PAD_*`/`CHIP_GAP_*`. */
export const SKILL_CHIP_PAD_X = 10;
export const SKILL_CHIP_PAD_Y = 5;
export const SKILL_CHIP_GAP_X = 8;
export const SKILL_CHIP_GAP_Y = 8;

/**
 * Wrap one category's skill chips into rows, mirroring the backend's
 * `_layout_skill_chips` greedy left-to-right wrap so the canvas and a
 * regenerated PDF wrap identically.
 *
 * @param {string[]} items
 * @param {number} width
 * @param {number} fontSize
 * @param {{measureTextWidth?:Function|null,textStyle?:object}} [options]
 * @returns {{ placements: { skill: string, dx: number, dy: number, width: number }[], height: number }}
 */
export function layoutSkillChips(items, width, fontSize, options = {}) {
  const cleaned = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (cleaned.length === 0) return { placements: [], height: 0 };
  const chipH = fontSize + 2 * SKILL_CHIP_PAD_Y;
  const rowStep = chipH + SKILL_CHIP_GAP_Y;
  const placements = [];
  let cx = 0;
  let cy = 0;
  let rowStarted = false;
  for (const skill of cleaned) {
    // Interactive additions run in the browser and can use the exact active
    // font metrics. Pure generator/layout tests keep the deterministic
    // approximation, preserving the existing server-compatible fallback.
    const measuredWidth = typeof options.measureTextWidth === "function"
      ? options.measureTextWidth(skill, {
        ...(options.textStyle || {}),
        fontSize,
      })
      : null;
    const hasMeasuredWidth = measuredWidth !== null
      && measuredWidth !== undefined
      && Number.isFinite(Number(measuredWidth));
    const chipW = (
      hasMeasuredWidth
        ? Math.max(1, Number(measuredWidth))
        : estimateTextWidth(skill, fontSize)
    ) + 2 * SKILL_CHIP_PAD_X;
    if (rowStarted && cx + chipW > width) {
      cx = 0;
      cy += rowStep;
      rowStarted = false;
    }
    placements.push({ skill, dx: cx, dy: cy, width: chipW });
    cx += chipW + SKILL_CHIP_GAP_X;
    rowStarted = true;
  }
  return { placements, height: cy + chipH };
}

/**
 * Build main-column skill subcategory blocks as wrapped chips. Seven visual
 * treatments share one layout contract: filled/outlined pills, filled/
 * outlined square or rounded rectangles, and a text label with a bottom rule.
 * All use the same geometry as the backend's `_place_skill_chips_row`, so a
 * variant change never changes wrapping or section height.
 *
 * Each category's label + every one of its chip rows share one `flowGroup`
 * (same contract as `buildSkillsMainGroups`) so `_measure_skill_group`'s
 * `mode="chips"` reservation and the canvas packer never split a category
 * mid-row.
 *
 * @param {{ category: string, items: string[] }[]} groups
 * @param {{
 *   bodyLeft: number,
 *   recordWidth: number,
 *   body: object,
 *   chipBg?: string,
 *   chipFg?: string,
 *   chipVariant?: string,
 *   appendTop: number,
 *   idFactory: () => string,
 *   measureTextWidth?: Function|null,
 *   stackGap?: number,
 *   recordGap?: number,
 * }} options
 * @returns {object[]}
 */
export function buildSkillsChipGroups(groups, options) {
  const list = (groups || []).filter((group) => (
    String(group?.category || "").trim()
    || String(group?.categoryPlaceholder || "").trim()
    || (group?.items || []).length > 0
  ));
  if (list.length === 0) return [];

  const bodyLeft = Number(options.bodyLeft) || 0;
  const recordWidth = Number(options.recordWidth) || 300;
  const body = options.body || {};
  const bodyFs = Number(body.fontSize) || 9.5;
  const catFs = Math.max(bodyFs, 9.5);
  const catLh = catFs + 2;
  const bodyColor = body.color || "#26313F";
  const fontFamily = body.fontFamily || "Montserrat";
  const chipVariant = normalizeSkillChipVariant(options.chipVariant);
  const variantGeometry = chipVariantGeometry(chipVariant, bodyFs + 2 * SKILL_CHIP_PAD_Y);
  const chipBg = options.chipBg || "#2B2B2B";
  const chipFg = options.chipFg || (variantGeometry.filled ? "#FFFFFF" : bodyColor);
  const stackGap = Number.isFinite(Number(options.stackGap)) ? Number(options.stackGap) : 4;
  const recordGap = Number.isFinite(Number(options.recordGap)) ? Number(options.recordGap) : 10;
  const idFactory = options.idFactory || (() => `skill-${Math.random().toString(36).slice(2, 9)}`);
  let cursor = Number(options.appendTop) || 0;
  const elements = [];

  list.forEach((group, index) => {
    const category = String(group.category || "").trim();
    const categoryPlaceholder = category
      ? ""
      : String(group.categoryPlaceholder || "").trim();
    const displayedCategory = category || categoryPlaceholder;
    const items = (group.items || []).filter((item) => String(item || "").trim());
    const flowGroup = `skill-group-${idFactory()}`;
    const hasBody = items.length > 0;

    if (displayedCategory) {
      const catH = measureTextareaHeight(displayedCategory, recordWidth, catFs, catLh);
      elements.push({
        element_id: idFactory(),
        category: "textarea",
        content: category,
        ...(categoryPlaceholder ? {
          placeholder: categoryPlaceholder,
          starterPlaceholder: true,
        } : {}),
        left: bodyLeft,
        top: cursor,
        width: recordWidth,
        height: Math.max(catH, catLh),
        fontSize: catFs,
        lineHeight: catLh,
        fontFamily,
        color: bodyColor,
        bold: true,
        italic: false,
        align: "left",
        bulletList: false,
        autoHeight: true,
        preserveInitialLayout: false,
        flowRole: "content",
        flowGroup,
        page: 1,
        zIndex: 3,
      });
      cursor += Math.max(catH, catLh);
      if (hasBody) cursor += stackGap;
    }

    if (hasBody) {
      const { placements, height: rowHeight } = layoutSkillChips(
        items,
        recordWidth,
        bodyFs,
        {
          measureTextWidth: options.measureTextWidth,
          textStyle: {
            fontFamily,
            fontSize: bodyFs,
            bold: false,
            italic: false,
            letterSpacing: Number(body.letterSpacing) || 0,
          },
        },
      );
      const chipH = bodyFs + 2 * SKILL_CHIP_PAD_Y;
      for (const { skill, dx, dy, width: chipW } of placements) {
        // The underline treatment uses the existing line primitive. Every
        // other treatment uses the rectangle primitive whose `filled`,
        // `borderWidth`, and `borderRadius` fields already persist and export.
        // No separate variant metadata is required: the shape is the source
        // of truth and can be detected again after save/reload.
        elements.push(variantGeometry.underline ? {
          element_id: idFactory(),
          category: "line",
          flowRole: "grid-member",
          flowGroup,
          left: bodyLeft + dx,
          top: cursor + dy + chipH - 1,
          width: chipW,
          height: 1,
          backgroundColor: chipBg,
          page: 1,
          zIndex: 2,
        } : {
          element_id: idFactory(),
          category: "rectangle",
          flowRole: "grid-member",
          flowGroup,
          left: bodyLeft + dx,
          top: cursor + dy,
          width: chipW,
          height: chipH,
          filled: variantGeometry.filled,
          borderWidth: variantGeometry.filled ? 0 : 1,
          borderRadius: variantGeometry.borderRadius,
          backgroundColor: chipBg,
          page: 1,
          zIndex: 2,
        });
        elements.push({
          element_id: idFactory(),
          category: "text",
          flowRole: "grid-member",
          flowGroup,
          content: skill,
          left: bodyLeft + dx + SKILL_CHIP_PAD_X,
          // Visible cap centre sits on the pill midline — see `_chip_label_top`
          // / `healSkillChipLabelBaselines`.
          top: cursor + dy + chipH / 2,
          fontSize: bodyFs,
          color: chipFg,
          fontFamily,
          page: 1,
          zIndex: 3,
        });
      }
      cursor += rowHeight;
    }

    if (index < list.length - 1) cursor += recordGap;
  });

  return elements;
}

/**
 * Best-effort chip treatment colors for a section switching into chip mode.
 *
 * Prefers the section's own existing chip colors (round-tripping chips → a
 * different mode → chips must not repaint them), then any other chip section
 * already in the document (so a second chips section on the same CV matches
 * the first), then the sampled section heading's own color — every backend
 * template paints its heading text AND its chip fill in the same accent
 * color, distinct from the (always softer/neutral) underline rule color.
 *
 * @param {object[]} sectionMembers - current members of the section being converted
 * @param {object[]} allElements - full document, for the "another chip section" fallback
 * @param {object} style - `deriveSectionStyle` result for this section
 * @param {{ chipVariant?: string }} [options]
 * @returns {{ chipBg: string, chipFg: string }}
 */
export function resolveSkillChipColors(sectionMembers, allElements, style, options = {}) {
  const variant = normalizeSkillChipVariant(options.chipVariant);
  const destinationFilled = chipVariantGeometry(variant, 20).filled;
  const findChipPair = (pool) => {
    const shape = (pool || []).find((element) => (
      element?.flowRole === "grid-member"
      && (element.category === "rectangle" || element.category === "line")
      && element.backgroundColor
    ));
    if (!shape) return null;
    const text = (pool || []).find((element) => (
      element?.flowRole === "grid-member"
      && element.category === "text"
      && element.flowGroup === shape.flowGroup
      && element.color
    ));
    const sourceFilled = shape.category === "rectangle" && Boolean(shape.filled);
    return {
      chipBg: shape.backgroundColor,
      // Dark text from an outline/underline must not be carried onto a newly
      // filled chip. Conversely, white text from a filled chip must not be
      // carried onto paper when switching to an unfilled treatment.
      chipFg: destinationFilled
        ? (sourceFilled && text?.color ? text.color : "#FFFFFF")
        : style?.body?.color || "#22221F",
    };
  };

  return findChipPair(sectionMembers)
    || findChipPair(allElements)
    || {
      // Every backend template paints its section heading text in the
      // template's accent color while the underline rule is a separate,
      // deliberately softer/neutral tone (e.g. Cardinal: heading + chip_bg
      // both `C['accent']` = '#9E2532', but the rule is `C['rule']` = the
      // unrelated gray '#8A8A8A'). The heading color is what the backend's
      // own `_place_skills_section(mode="chips")` actually paints chips
      // with, so it must be tried BEFORE the rule — preferring the rule here
      // repaints a converted-back-to-chips section in that neutral divider
      // gray instead of the template's real accent.
      chipBg: style?.heading?.color || style?.rule?.backgroundColor || "#2B2B2B",
      chipFg: destinationFilled ? "#FFFFFF" : style?.body?.color || "#22221F",
    };
}

/**
 * Expand a rail skills strip into main-column chrome + subcategory records,
 * or restyle an existing main-column skills section into a different layout
 * mode in place. Shared by `transferSectionLane.js` (sidebar → main, always
 * `mode="inline"`) and the main-column layout picker (`skillsDisplayMode.js`,
 * any of the three modes).
 *
 * @param {object[]} members
 * @param {string} headingId
 * @param {object} style
 * @param {number} parkTop
 * @param {{ stack?: number, record?: number, after_rule?: number }} [spacing]
 * @param {"inline"|"bullet"|"chips"} [mode]
 * @param {{measureTextWidth?:Function|null}} [layoutOptions]
 * @returns {object[]|null}
 */
export function restyleSkillsMembersAsMode(
  members,
  headingId,
  style,
  parkTop,
  spacing = {},
  mode = FLAT_SECTION_LAYOUT_INLINE,
  layoutOptions = {},
) {
  const heading = members.find((element) => element.element_id === headingId);
  if (!heading) return null;
  const groups = collectSkillGroups(members, headingId);
  if (groups.length === 0) return null;

  const headingFont = style.heading || {};
  const bodyFont = style.body || {};
  const recordWidth = Number(style.recordWidth) || 300;
  const headingLeft = Number(style.left) || Number(style.bodyLeft) || 245;
  const bodyLeft = Number.isFinite(Number(style.bodyLeft))
    ? Number(style.bodyLeft)
    : headingLeft;
  const fontSize = Number(headingFont.fontSize) || 14;
  const letterSpacing = Number.isFinite(Number(headingFont.letterSpacing))
    ? Number(headingFont.letterSpacing)
    : (Number(heading.letterSpacing) || 0);

  const chrome = [{
    ...heading,
    flowRole: "section-chrome",
    left: headingLeft,
    top: parkTop,
    fontSize,
    fontFamily: headingFont.fontFamily || heading.fontFamily,
    color: headingFont.color || heading.color,
    letterSpacing,
    bold: headingFont.bold !== undefined ? Boolean(headingFont.bold) : Boolean(heading.bold),
    height: measureTextareaHeight(heading.content, recordWidth, fontSize, fontSize * 1.35),
    page: 1,
    preserveInitialLayout: false,
  }];
  delete chrome[0].flowLane;

  const rule = members.find((element) => (
    element.element_id !== headingId
    && element.category === "line"
    && (Number(element.height) || 0) <= 4
  ));
  const afterRule = Number.isFinite(Number(spacing.after_rule))
    ? Number(spacing.after_rule)
    : 8;
  const ruleTop = parkTop + sectionChromeRuleRelTop(style, chrome[0].height);
  let restyledRuleHeight = 0;
  if (rule) {
    const ruleStyle = style.rule || {};
    const relLeft = Number.isFinite(Number(ruleStyle.relLeft)) ? Number(ruleStyle.relLeft) : 0;
    const restyledRule = {
      ...rule,
      flowRole: "section-chrome",
      left: headingLeft + relLeft,
      top: ruleTop,
      width: Number(ruleStyle.width) || recordWidth,
      height: Number(ruleStyle.height) || Number(rule.height) || 1,
      backgroundColor: ruleStyle.backgroundColor || rule.backgroundColor,
      page: 1,
      preserveInitialLayout: false,
    };
    delete restyledRule.flowLane;
    chrome.push(restyledRule);
    restyledRuleHeight = Number(restyledRule.height) || 1;
  }

  // Carry forward any other decorative section-chrome the heading owns —
  // marker dots/icons (Cinder), ordinal badge digits and their filled square
  // (Monument), title frames, and any future shape a template adds. These are
  // NOT rebuilt from `style` (unlike heading/rule above): a resampled marker
  // would need to know which glyph/icon/badge digit belongs to THIS section,
  // which only this section's own existing elements do. Instead each is
  // translated by the same left/top delta the heading itself just moved by,
  // preserving every other property (color, size, src, digits, …) verbatim.
  // Dropping these silently deleted a section's whole decorative identity —
  // regressed by the very first version of this restyle path, which only
  // ever emitted [heading, rule].
  const headingDeltaLeft = headingLeft - (Number(heading.left) || 0);
  const headingDeltaTop = parkTop - (Number(heading.top) || 0);
  for (const element of members) {
    if (element.element_id === headingId || element === rule) continue;
    if (element.flowRole !== "section-chrome") continue;
    chrome.push({
      ...element,
      left: (Number(element.left) || 0) + headingDeltaLeft,
      top: (Number(element.top) || 0) + headingDeltaTop,
      page: 1,
      preserveInitialLayout: false,
    });
  }

  // Most templates draw the rule BELOW the heading, so `ruleBottom` alone
  // already accounts for the heading's own line height. Cardinal's rule
  // instead continues from the heading's own cap-midline (`relTop` ≈ -0.67,
  // see `sectionChromeRuleRelTop`), so `ruleBottom` sits almost at the
  // heading's TOP — using it alone would place body content underneath the
  // heading text. Taking the heading's own bottom edge as a floor keeps body
  // placement correct for both rule shapes without a template-specific branch.
  const headingBottom = parkTop + (Number(chrome[0].height) || 0);
  const ruleBottom = rule ? ruleTop + restyledRuleHeight : ruleTop;
  const bodyTop = Math.max(headingBottom, ruleBottom) + afterRule;
  let seq = 0;
  const idFactory = () => `${headingId}-sk-${Date.now().toString(36)}-${++seq}`;
  const bodyOptions = {
    bodyLeft,
    recordWidth,
    body: bodyFont,
    appendTop: bodyTop,
    idFactory,
    stackGap: Number.isFinite(Number(spacing.stack)) ? Number(spacing.stack) : 4,
    recordGap: Number.isFinite(Number(spacing.record)) ? Number(spacing.record) : 10,
  };
  const bodies = mode === SKILLS_LAYOUT_CHIPS
    ? buildSkillsChipGroups(groups, {
      ...bodyOptions,
      chipBg: style.chipBg,
      chipFg: style.chipFg,
      chipVariant: style.chipVariant,
      measureTextWidth: layoutOptions.measureTextWidth,
    })
    : buildSkillsMainGroups(groups, { ...bodyOptions, mode });
  if (bodies.length === 0) return null;
  return [...chrome, ...bodies];
}

/**
 * Expand a rail skills strip into main-column chrome + subcategory records.
 * Thin wrapper over `restyleSkillsMembersAsMode` fixed to `mode="inline"` —
 * transfer always lands in the main column's default inline mid-dot layout;
 * the chip/bullet layout picker only ever runs on an existing main section.
 *
 * @param {object[]} members
 * @param {string} headingId
 * @param {object} style
 * @param {number} parkTop
 * @param {{ stack?: number, record?: number, after_rule?: number }} [spacing]
 * @returns {object[]|null}
 */
export function restyleSkillsMembersAsMain(members, headingId, style, parkTop, spacing = {}) {
  return restyleSkillsMembersAsMode(
    members, headingId, style, parkTop, spacing, FLAT_SECTION_LAYOUT_INLINE,
  );
}

/**
 * Current main-column layout mode of a skills section, detected from its live
 * elements (never persisted separately — the section IS the source of truth).
 * A grid-member rectangle or bottom-rule line means chips; a bulleted body
 * means the bullet list; otherwise the mid-dot inline row.
 *
 * @param {object[]} members - a skills section's own members
 * @returns {"inline"|"bullet"|"chips"}
 */
export function detectSkillsDisplayMode(members) {
  const hasChipChrome = (members || []).some((element) => (
    element?.flowRole === "grid-member"
    && (element.category === "rectangle" || element.category === "line")
  ));
  if (hasChipChrome) return SKILLS_LAYOUT_CHIPS;
  const hasBulletBody = (members || []).some((element) => (
    element?.flowRole === "content"
    && (element.category === "textarea" || element.category === "text")
    && element.bulletList === true
  ));
  return hasBulletBody ? FLAT_SECTION_LAYOUT_BULLET : FLAT_SECTION_LAYOUT_INLINE;
}

/**
 * Detect a chip treatment from the persisted rectangle/line geometry.
 * Legacy chip sections are the original filled pill by construction.
 *
 * @param {object[]} members
 * @returns {string}
 */
export function detectSkillChipVariant(members) {
  const shape = (members || []).find((element) => (
    element?.flowRole === "grid-member"
    && (element.category === "rectangle" || element.category === "line")
  ));
  if (!shape || shape.category === "line") {
    return shape ? SKILL_CHIP_VARIANT_UNDERLINE : SKILL_CHIP_VARIANT_PILL_FILLED;
  }

  const filled = Boolean(shape.filled);
  const radius = Math.max(0, Number(shape.borderRadius) || 0);
  const height = Math.max(0, Number(shape.height) || 0);
  const isPill = radius > 0 && radius >= Math.max(1, height / 2 - 0.75);
  if (isPill) {
    return filled ? SKILL_CHIP_VARIANT_PILL_FILLED : SKILL_CHIP_VARIANT_PILL_OUTLINE;
  }
  if (radius > 0) {
    return filled ? SKILL_CHIP_VARIANT_ROUNDED_FILLED : SKILL_CHIP_VARIANT_ROUNDED_OUTLINE;
  }
  return filled ? SKILL_CHIP_VARIANT_RECT_FILLED : SKILL_CHIP_VARIANT_RECT_OUTLINE;
}

/**
 * Collapse main-column skill groups into sidebar chrome + one textarea.
 *
 * @param {object[]} members
 * @param {string} headingId
 * @param {object} style
 * @param {number} parkTop
 * @returns {object[]|null}
 */
export function restyleSkillsMembersAsSidebar(members, headingId, style, parkTop) {
  const heading = members.find((element) => element.element_id === headingId);
  if (!heading) return null;
  const groups = collectSkillGroups(members, headingId);
  if (groups.length === 0) return null;

  const headingFont = style.heading || {};
  const bodyFont = style.body || {};
  const recordWidth = Number(style.recordWidth) || 152;
  const headingLeft = Number(style.left) || Number(style.bodyLeft) || 34;
  const bodyLeft = Number.isFinite(Number(style.bodyLeft))
    ? Number(style.bodyLeft)
    : headingLeft;
  const fontSize = Number(headingFont.fontSize) || 7.6;
  const bodyFs = Number(bodyFont.fontSize) || 8.3;
  const bodyLh = Number(bodyFont.lineHeight) || bodyFs * 1.4;
  const content = formatSkillsSidebarContent(groups);

  const chrome = [{
    ...heading,
    flowRole: "sidebar-chrome",
    flowLane: "sidebar",
    left: headingLeft,
    top: parkTop,
    fontSize,
    fontFamily: headingFont.fontFamily || heading.fontFamily,
    color: headingFont.color || heading.color,
    letterSpacing: Number.isFinite(Number(headingFont.letterSpacing))
      ? Number(headingFont.letterSpacing)
      : heading.letterSpacing,
    bold: headingFont.bold ?? heading.bold,
    height: measureTextareaHeight(heading.content, recordWidth, fontSize, fontSize * 1.35),
    page: 1,
    preserveInitialLayout: false,
  }];

  const rule = members.find((element) => (
    element.element_id !== headingId
    && element.category === "line"
    && (Number(element.height) || 0) <= 4
  ));
  const ruleTop = parkTop + sectionChromeRuleRelTop(style, chrome[0].height);
  if (rule) {
    const ruleStyle = style.rule || {};
    const relLeft = Number.isFinite(Number(ruleStyle.relLeft)) ? Number(ruleStyle.relLeft) : 0;
    chrome.push({
      ...rule,
      flowRole: "sidebar-chrome",
      flowLane: "sidebar",
      left: headingLeft + relLeft,
      top: ruleTop,
      width: Number(ruleStyle.width) || 50,
      height: Number(ruleStyle.height) || Number(rule.height) || 1,
      backgroundColor: ruleStyle.backgroundColor || rule.backgroundColor,
      page: 1,
      preserveInitialLayout: false,
    });
  }

  // This textarea is a new composite of every category and item. It must not
  // inherit a category/body id, because that id is used to map real text edits
  // back into the normalized profile before a later template fill.
  const bodyId = compositeSidebarBodyId(members, headingId);

  chrome.push({
    element_id: bodyId,
    category: "textarea",
    content,
    left: bodyLeft,
    top: ruleTop + 6,
    width: recordWidth,
    height: measureTextareaHeight(content, recordWidth, bodyFs, bodyLh, { bulletList: true }),
    fontSize: bodyFs,
    lineHeight: bodyLh,
    fontFamily: bodyFont.fontFamily || "Montserrat",
    color: bodyFont.color || "#26313F",
    bold: false,
    italic: false,
    align: "left",
    bulletList: true,
    autoHeight: true,
    preserveInitialLayout: false,
    flowRole: "content",
    flowLane: "sidebar",
    page: 1,
    zIndex: 3,
  });
  return chrome;
}
