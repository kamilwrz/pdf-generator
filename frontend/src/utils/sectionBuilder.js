/**
 * Structural section builder.
 *
 * Pure constructors for a new template-mode section: a section-chrome band
 * (heading + rule, plus zero or more decorative shapes) plus body content for the chosen
 * layout. Geometry is authored relative to page 1 only so the chrome forms a
 * tight cluster and body reads top-to-bottom; `appendSectionAtEnd` repositions
 * the whole strip into the document flow, so absolute positions here are
 * intentionally provisional.
 *
 * Layouts:
 *  - "aa": heading + chrome + one auto-height content textarea.
 *  - "cc-edu": heading + chrome + one education-style record — degree/diploma
 *    title, school subtitle, city·period meta, bullet description (4 lines).
 *    Mirrors the backend generator's `_place_education_record`
 *    (backend/app/services/cv_templates/shared/records.py).
 *  - "cc-exp": heading + chrome + one experience-style record — role title,
 *    company·period meta, bullet description (3 lines, no subtitle line).
 *    Mirrors `_place_experience_record` in the same module.
 *  - "cc-sub": heading + chrome + one subcategory record — bold category
 *    label + body line (2 lines). Same shape as nested skills groups under
 *    UMIEJĘTNOŚCI; used for user-added category sections (tools, soft skills,
 *    certifications-as-groups, …).
 *
 * Education and Experience are NOT interchangeable: Education carries a
 * distinct school/university line that Experience's structure does not have
 * (company and period are a single meta line there). Collapsing both into one
 * generic 4-line "cc" record — as an earlier version of this module did —
 * produces a phantom subtitle field on experience-style sections.
 * Subcategory must stay at two lines — inflating it to education placeholders
 * is the Add-record bug fixed in `sectionRecord.ensureCanonicalRecordTemplate`.
 */
import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from "./flowSpacing.js";

/**
 * Backend `Builder.text()` (cv_generator_primitives.py) advances its cursor
 * by `fontSize * 1.35` after painting any heading/label — confirmed against
 * real generator output (Cinder: an 8.7px heading's rule sits 11.745px below
 * it, 8.7*1.35). Chrome built here must use the same multiplier so a rule
 * placed directly under a fresh heading lands where the backend would put
 * it, instead of drifting a few px too high and widening the rule-to-body
 * gap once the packer re-pins the strip.
 */
const TEXT_CURSOR_ADVANCE = 1.35;

/**
 * Height of one record/textarea line, matching backend
 * `PDF_Generator.measure_textarea_height` + `Builder.measure_block(..., min_h=lh)`:
 * `lines * lineHeight`, floored at one line. Deliberately omits the `+ 6`
 * canvas heuristic in `measureTextareaHeight` — that overshoot makes added
 * record stacks sit ~6px taller per line than wizard-generated peers, so the
 * same SPACE_STACK gap looks like a looser rhythm.
 *
 * @param {string} content
 * @param {number} width
 * @param {number} fontSize
 * @param {number} lineHeight
 * @returns {number}
 */
function measureGeneratorBlockHeight(content, width, fontSize, lineHeight) {
  const lh = lineHeight || Math.round(fontSize * 1.4);
  const cpl = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  let renderedLines = 0;
  for (const seg of (content || "").split("\n")) {
    renderedLines += seg.trim() ? Math.max(1, Math.ceil(seg.length / cpl)) : 1;
  }
  return Math.max(lh, renderedLines * lh);
}

export const SECTION_LAYOUTS = Object.freeze({
  TEXTAREA: "aa",
  RECORD_EDUCATION: "cc-edu",
  RECORD_EXPERIENCE: "cc-exp",
  /** Bold heading + body (skills subcategories under UMIEJĘTNOŚCI). */
  RECORD_SUBCATEGORY: "cc-sub",
});

/** Field-naming placeholder copy (Polish UI). */
const PLACEHOLDER = Object.freeze({
  heading: "Nowa sekcja",
  textarea: "Treść sekcji…",
  education: Object.freeze({
    title: "Nazwa dyplomu",
    subtitle: "Uczelnia",
    meta: "Miasto · okres",
    description: "Opis…",
  }),
  experience: Object.freeze({
    title: "Stanowisko",
    meta: "Firma · okres",
    description: "Opis…",
  }),
  subcategory: Object.freeze({
    title: "Nazwa kategorii",
    body: "Treść…",
  }),
});

/**
 * Field-naming placeholder lines for a record layout, styled from the sampled
 * body/muted colors. Education, Experience, and Subcategory have different
 * line counts (see module doc) — this is the single place that encodes the split.
 *
 * @param {"cc-edu"|"cc-exp"|"cc-sub"} layout
 * @param {object} style
 * @returns {{ content: string, color: string, bold: boolean, bulletList?: boolean }[]}
 */
function recordLineSpecs(layout, style) {
  if (layout === SECTION_LAYOUTS.RECORD_EDUCATION) {
    const copy = PLACEHOLDER.education;
    return [
      { content: copy.title, color: style.body.color, bold: true },
      { content: copy.subtitle, color: style.body.color, bold: false },
      { content: copy.meta, color: style.mutedColor, bold: false },
      { content: copy.description, color: style.body.color, bold: false, bulletList: true },
    ];
  }
  if (layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
    const copy = PLACEHOLDER.subcategory;
    return [
      { content: copy.title, color: style.body.color, bold: true },
      { content: copy.body, color: style.body.color, bold: false },
    ];
  }
  const copy = PLACEHOLDER.experience;
  return [
    { content: copy.title, color: style.body.color, bold: true },
    { content: copy.meta, color: style.mutedColor, bold: false },
    { content: copy.description, color: style.body.color, bold: false, bulletList: true },
  ];
}

/**
 * Build one auto-height content textarea matching the sampled body style.
 * @returns {object}
 */
function contentTextarea({
  elementId, content, left, top, width,
  fontSize, fontFamily, lineHeight, color,
  bold = false, bulletList = false, flowGroup = null,
  flowLane = null,
}) {
  const lh = lineHeight || Math.round(fontSize * 1.4);
  const element = {
    element_id: elementId,
    category: "textarea",
    content,
    flowRole: "content",
    autoHeight: true,
    // Match fill_template textareas: shrink-only on first mount so browser
    // metrics cannot inflate the generator-matched stack before the user edits.
    preserveInitialLayout: true,
    left,
    top,
    width,
    height: measureGeneratorBlockHeight(content, width, fontSize, lh),
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
  if (flowLane) element.flowLane = flowLane;
  return element;
}

/**
 * Build one decorative chrome shape (marker dot, badge square, icon frame,
 * accent tick, …) offset from the heading. A section may sample zero, one, or
 * several such shapes (Monument's numbered badge alone is two: a filled
 * square block and a label frame) — each is replicated verbatim, including
 * its category-specific `borderWidth`/`filled` fields where the sampled
 * shape carried them.
 * @returns {object}
 */
function decorativeShapeElement({ elementId, shape, left, flowRole = "section-chrome", flowLane = null }) {
  const base = {
    element_id: elementId,
    category: shape.category,
    flowRole,
    left: left + shape.relLeft,
    // Preserve the sampled vertical offset verbatim, including negatives.
    // `deriveSectionStyle` reports a negative `relTop` when a template's
    // decorative shape sits a few pixels above the heading baseline. The
    // value is provisional: the packer's chrome-cluster normalization re-pins
    // the whole strip on append and handles a negative authored top
    // correctly, so clamping here would needlessly collapse a legitimate
    // offset.
    top: shape.relTop,
    width: shape.width,
    height: shape.height,
    backgroundColor: shape.backgroundColor,
    isSelected: false,
    isMove: false,
    locked: false,
    zIndex: 3,
    page: 1,
  };
  if (shape.borderWidth != null) base.borderWidth = shape.borderWidth;
  if (shape.filled != null) base.filled = shape.filled;
  // Section-heading icons (Cardinal / Nova / Tessera / …) are image markers.
  // Without src the canvas would render an empty chrome slot beside the title.
  if (shape.category === "image") {
    if (shape.src) base.src = shape.src;
    if (shape.alignWithText) base.alignWithText = true;
  }
  if (flowLane) base.flowLane = flowLane;
  return base;
}

/**
 * Build the decorative ordinal-badge text for a Monument-style section
 * ("01", "02", …). Only the digits are new — every other property is
 * replicated from the sampled badge's own style. The new digits are the
 * section's computed position in the document (see `sectionOrdinal` on
 * `buildSectionElements`), zero-padded to the sampled digit count so a new
 * section's badge matches its siblings' width ("5" -> "05" alongside "01").
 * Tagged `isDecorativeChromeText` so `isSectionHeading` never mistakes it for
 * the section's real title (see `sectionStructure.js`).
 * @returns {object}
 */
function badgeNumberElement({
  elementId, badgeNumber, sectionOrdinal, left,
  flowRole = "section-chrome", flowLane = null,
}) {
  const element = {
    element_id: elementId,
    category: "text",
    content: String(sectionOrdinal).padStart(badgeNumber.digits, "0"),
    flowRole,
    isDecorativeChromeText: true,
    left: left + badgeNumber.relLeft,
    top: badgeNumber.relTop,
    fontSize: badgeNumber.fontSize,
    fontFamily: badgeNumber.fontFamily,
    color: badgeNumber.color,
    bold: badgeNumber.bold,
    italic: false,
    underline: false,
    isSelected: false,
    isMove: false,
    locked: false,
    zIndex: 5,
    page: 1,
  };
  if (flowLane) element.flowLane = flowLane;
  return element;
}

/**
 * Build a new section's elements for the chosen layout.
 *
 * @param {{ name: string, layout: "aa"|"cc-edu"|"cc-exp"|"cc-sub", style: object, spacing?: object, sectionOrdinal?: number, idFactory: () => string, lane?: "main"|"sidebar" }} args
 * @returns {{ elements: object[], headingId: string, firstBodyId: string }}
 *
 * Decorative markers (including iconic section images) come from `style.markers`.
 * Callers that offer an icon gallery should run `applySelectedSectionIcon` on
 * the style before invoking this builder so the chosen glyph lands at the same
 * offset as sibling headings.
 *
 * Pass `lane: "sidebar"` to stamp `flowLane: "sidebar"` and
 * `flowRole: "sidebar-chrome"` so the strip joins the rail packer.
 */
export function buildSectionElements({
  name, layout, style, spacing, sectionOrdinal, idFactory, lane = "main",
}) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  // `PLACEHOLDER.heading` ("Nowa sekcja") is the authoritative default for a
  // blank section name. Callers such as AddSectionModal.handleConfirm also
  // default defensively before invoking this builder — that duplication is
  // intentional (this util must not trust its caller), but if either default
  // string changes, update both so they do not silently diverge.
  const label = String(name || "").trim() || PLACEHOLDER.heading;
  // Heading / chrome column (Monument title at 118) vs content column
  // (Monument body at 102). Mixing them parks new record fields under the
  // title instead of in the wizard's content gutter.
  const left = style.left;
  const bodyLeft = Number.isFinite(Number(style.bodyLeft)) ? Number(style.bodyLeft) : left;
  const width = style.recordWidth;
  const headingId = idFactory();
  const elements = [];
  const intoSidebar = lane === "sidebar";
  const chromeRole = intoSidebar ? "sidebar-chrome" : "section-chrome";
  const flowLane = intoSidebar ? "sidebar" : null;

  for (const shape of style.markers || []) {
    elements.push(decorativeShapeElement({
      elementId: idFactory(), shape, left, flowRole: chromeRole, flowLane,
    }));
  }

  if (style.badgeNumber) {
    elements.push(badgeNumberElement({
      elementId: idFactory(),
      badgeNumber: style.badgeNumber,
      sectionOrdinal: Number(sectionOrdinal) || 1,
      left,
      flowRole: chromeRole,
      flowLane,
    }));
  }

  // Heading label (section title). Placed at relTop 0 so it anchors the chrome.
  const headingElement = {
    element_id: headingId,
    category: "text",
    content: label,
    flowRole: chromeRole,
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
  };
  // Cardinal samples an authored chrome-band height; keep it so after_rule
  // originates under the title band, not under a midline hairline.
  if (Number.isFinite(Number(style.heading.height)) && Number(style.heading.height) > 0) {
    headingElement.height = Number(style.heading.height);
  }
  if (flowLane) headingElement.flowLane = flowLane;
  elements.push(headingElement);

  // Default rule top matches Builder.text() cursor advance (Cinder/Regent).
  // Prefer a sampled `rule.relTop` when present — Monument's accent rule sits
  // mid-band beside the title frame (~heading+7), not flush under the label.
  const defaultRuleTop = style.heading.fontSize * TEXT_CURSOR_ADVANCE;
  const ruleTop = style.rule && Number.isFinite(Number(style.rule.relTop))
    ? Number(style.rule.relTop)
    : defaultRuleTop;
  // Opt-in from the generator / deriveSectionStyle (Cardinal only today).
  const midlineRule = style.rule?.chromeAlign === "midline";

  if (style.rule) {
    // Horizontal offset may differ from the title (Monument rule at +251).
    let ruleRelLeft = Number.isFinite(Number(style.rule.relLeft))
      ? Number(style.rule.relLeft)
      : 0;
    let ruleWidth = Number(style.rule.width) || width;
    // Midline rules trail the label instead of underlining the whole column.
    // Recompute their start from the new label's tracked width, while
    // preserving the sampled right edge.
    const sampledLabelGap = Number(style.rule.labelGap);
    if (
      midlineRule
      && ruleRelLeft > 0
      && Number.isFinite(sampledLabelGap)
    ) {
      const estimatedLabelWidth = label.length * (
        style.heading.fontSize * 0.58 + (Number(style.heading.letterSpacing) || 0)
      );
      const sampledRight = ruleRelLeft + ruleWidth;
      ruleRelLeft = estimatedLabelWidth + sampledLabelGap;
      ruleWidth = Math.max(1, sampledRight - ruleRelLeft);
    }
    const ruleElement = {
      element_id: idFactory(),
      category: "line",
      flowRole: chromeRole,
      left: left + ruleRelLeft,
      top: ruleTop,
      width: ruleWidth,
      height: style.rule.height,
      backgroundColor: style.rule.backgroundColor,
      isSelected: false,
      isMove: false,
      locked: false,
      zIndex: 2,
      page: 1,
    };
    if (midlineRule) ruleElement.chromeAlign = "midline";
    if (flowLane) ruleElement.flowLane = flowLane;
    elements.push(ruleElement);
  }

  // Body starts below the chrome band, using the document's actual
  // configured after_rule rhythm rather than a hardcoded gap; exact offset
  // is re-pinned on append regardless (see appendSectionAtEnd/forceTargets).
  const markerBottoms = (style.markers || []).map(
    (shape) => (Number(shape.relTop) || 0) + (Number(shape.height) || 0),
  );
  // Midline hairlines are not underlines — do not let their top define
  // chromeBottom (they already sit inside the heading row).
  const ruleBottom = style.rule && !midlineRule
    ? ruleTop + (Number(style.rule.height) || 1)
    : 0;
  const headingBand = Number.isFinite(Number(style.heading.height))
    && Number(style.heading.height) > 0
    ? Number(style.heading.height)
    : defaultRuleTop;
  const chromeBottom = Math.max(headingBand, ruleBottom, ...markerBottoms, 0);
  const bodyTop = chromeBottom + rhythm.after_rule;
  let firstBodyId = null;

  const isRecordLayout = layout === SECTION_LAYOUTS.RECORD_EDUCATION
    || layout === SECTION_LAYOUTS.RECORD_EXPERIENCE
    || layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY;
  if (isRecordLayout) {
    const group = `section-${headingId}-rec1`;
    const lines = recordLineSpecs(layout, style);
    let top = bodyTop;
    lines.forEach((line, index) => {
      const elementId = idFactory();
      if (index === 0) firstBodyId = elementId;
      const lineHeight = style.body.lineHeight;
      const height = measureGeneratorBlockHeight(
        line.content, width, style.body.fontSize, lineHeight,
      );
      elements.push(contentTextarea({
        elementId,
        content: line.content,
        left: bodyLeft,
        top,
        width,
        fontSize: style.body.fontSize,
        fontFamily: style.body.fontFamily,
        lineHeight,
        color: line.color,
        bold: line.bold,
        bulletList: Boolean(line.bulletList),
        flowGroup: group,
        flowLane,
      }));
      // Advance by the real box height (not bare lineHeight) so authored
      // intra-record gaps stay non-negative before forceTargets re-pins them.
      top += height + rhythm.stack;
    });
  } else {
    firstBodyId = idFactory();
    elements.push(contentTextarea({
      elementId: firstBodyId,
      content: PLACEHOLDER.textarea,
      left: bodyLeft,
      top: bodyTop,
      width,
      fontSize: style.body.fontSize,
      fontFamily: style.body.fontFamily,
      lineHeight: style.body.lineHeight,
      color: style.body.color,
      flowLane,
    }));
  }

  return { elements, headingId, firstBodyId };
}
