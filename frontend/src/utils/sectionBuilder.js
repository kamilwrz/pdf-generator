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
    // Preserve the sampled vertical offset verbatim, including negatives.
    // `deriveSectionStyle` reports a negative `relTop` when a template's
    // decorative mark sits a few pixels above the heading baseline. The value
    // is provisional: the packer's chrome-cluster normalization re-pins the
    // whole strip on append and handles a negative authored top correctly, so
    // clamping here would needlessly collapse a legitimate offset.
    top: marker.relTop,
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
  // `PLACEHOLDER.heading` ("Nowa sekcja") is the authoritative default for a
  // blank section name. Callers such as AddSectionModal.handleConfirm also
  // default defensively before invoking this builder — that duplication is
  // intentional (this util must not trust its caller), but if either default
  // string changes, update both so they do not silently diverge.
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
