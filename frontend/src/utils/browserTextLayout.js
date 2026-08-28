/**
 * Resolve textarea soft-wraps with the browser's own shaping engine.
 *
 * ReportLab embeds the same font files as the canvas, but it does not apply
 * Chromium's kerning and shaping decisions. A width tolerance can repair one
 * phrase while breaking another. Export therefore carries transient line
 * records measured by Chromium; persisted canvas content remains plain text.
 */
import { canvasFontFamily } from "./canvasFont.js";
import { bulletRunsToEditableHtml, runsToHtml } from "./editableSerialize.js";
import { sliceRuns, styledSegments } from "./textRuns.js";

const BULLET_RE = /^\s*•[ \t]*/;
const STRONG_RTL_RE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u{10800}-\u{10fff}\u{1e800}-\u{1eeff}]/u;

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function codePointLength(value) {
  return Array.from(String(value ?? "")).length;
}

function plainParagraphsHtml(content, runs) {
  let offset = 0;
  return String(content ?? "").split("\n").map((line) => {
    const start = offset;
    const end = start + line.length;
    offset = end + 1;
    return (
      '<div data-export-paragraph="plain">'
      + runsToHtml(line, sliceRuns(runs, start, end))
      + "</div>"
    );
  }).join("");
}

function textNodes(root, documentRef) {
  const nodes = [];
  const showText = documentRef.defaultView?.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = documentRef.createTreeWalker(root, showText);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node);
  }
  return nodes;
}

/**
 * Measure one logical paragraph without inserting per-character spans.
 *
 * Character spans would disable kerning at every boundary and reproduce the
 * very ReportLab discrepancy this helper is meant to avoid. DOM Ranges inspect
 * glyph positions without changing shaping. Whitespace at a soft boundary is
 * intentionally omitted from both adjacent line records, matching what is
 * visibly painted and the PDF renderer's existing word-wrap convention.
 */
function measureParagraphLines({
  body,
  bodyText,
  sourceStart,
  paragraphEndOffset,
  mirrorLeft,
  indent,
  bullet,
  lineHeight,
  documentRef,
}) {
  if (!bodyText || !/\S/.test(bodyText)) {
    return [{
      text: bodyText,
      start: sourceStart,
      end: paragraphEndOffset,
      paragraphEnd: true,
      indent,
      bulletPrefix: bullet ? "• " : "",
      xOffset: indent,
      advanceWidth: 0,
    }];
  }

  const range = documentRef.createRange();
  const rows = [];
  let localOffset = 0;
  let current = null;
  // Range rectangles can differ slightly between real bold/italic cuts on the
  // same baseline. Half a line box still cleanly separates adjacent rows while
  // keeping those inline variants grouped as one visual line.
  const rowTolerance = Math.max(1, finiteNumber(lineHeight, 12) * 0.45);

  for (const node of textNodes(body, documentRef)) {
    const value = node.nodeValue ?? "";
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      const charOffset = localOffset + index;
      if (/\s/.test(char)) continue;

      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.top)) continue;

      if (!current || Math.abs(rect.top - current.top) > rowTolerance) {
        current = {
          top: rect.top,
          start: charOffset,
          end: charOffset + 1,
          left: rect.left,
          right: rect.right,
        };
        rows.push(current);
      } else {
        current.end = charOffset + 1;
        current.left = Math.min(current.left, rect.left);
        current.right = Math.max(current.right, rect.right);
      }
    }
    localOffset += value.length;
  }
  range.detach?.();

  if (rows.length === 0) {
    return [{
      text: bodyText,
      start: sourceStart,
      end: paragraphEndOffset,
      paragraphEnd: true,
      indent,
      bulletPrefix: bullet ? "• " : "",
      xOffset: indent,
      advanceWidth: 0,
    }];
  }

  return rows.map((row, index) => ({
    text: bodyText.slice(row.start, row.end),
    start: sourceStart + codePointLength(bodyText.slice(0, row.start)),
    end: sourceStart + codePointLength(bodyText.slice(0, row.end)),
    paragraphEnd: index === rows.length - 1,
    indent,
    bulletPrefix: bullet && index === 0 ? "• " : "",
    xOffset: row.left - mirrorLeft,
    advanceWidth: Math.max(0, row.right - row.left),
  }));
}

function requiredFontVariants(element) {
  const variants = new Map();
  const add = (bold, italic) => {
    const key = `${bold ? 700 : 400}:${italic ? "italic" : "normal"}`;
    variants.set(key, { bold: !!bold, italic: !!italic });
  };
  add(element.bold, element.italic);
  for (const segment of styledSegments(String(element.content ?? ""), element.runs)) {
    add(element.bold || segment.bold, element.italic || segment.italic);
  }
  return [...variants.values()];
}

async function loadElementFonts(element, documentRef) {
  if (!documentRef.fonts?.load) return false;
  const size = finiteNumber(element.fontSize, 12);
  const family = canvasFontFamily(element.fontFamily);
  const sample = String(element.content ?? "").slice(0, 64) || "M";
  const results = await Promise.allSettled(
    requiredFontVariants(element).map(({ bold, italic }) => (
      documentRef.fonts.load(
        `${italic ? "italic" : "normal"} ${bold ? 700 : 400} ${size}px ${family}`,
        sample,
      )
    )),
  );
  return results.every((result) => (
    result.status === "fulfilled"
    && Array.isArray(result.value)
    && result.value.length > 0
  ));
}

/**
 * Return Chromium-authored line records for one textarea element.
 *
 * The mirror is detached from the canvas transform, so its CSS-pixel width is
 * the stored element width regardless of the editor's current zoom or page.
 * It is appended only while measuring and never changes application state.
 */
export function resolveTextareaBrowserLines(
  element,
  documentRef = typeof document === "undefined" ? null : document,
) {
  if (!documentRef?.body || element?.category !== "textarea") return null;

  const content = String(element.content ?? "");
  const width = finiteNumber(element.width, 0);
  if (width <= 0) return null;
  // ReportLab's current text path is LTR. Browser-authored starts for bidi text
  // would make that fallback worse, so leave such elements on the established
  // backend wrapper until shaped RTL glyph placement is supported end to end.
  if (STRONG_RTL_RE.test(content)) return null;
  if (
    element.textTransform === "uppercase"
    && codePointLength(content.toUpperCase()) !== codePointLength(content)
  ) return null;

  const mirror = documentRef.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-2147483647",
    width: `${width}px`,
    height: "auto",
    margin: "0",
    padding: "0",
    border: "0",
    boxSizing: "border-box",
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "break-word",
    fontFamily: canvasFontFamily(element.fontFamily),
    fontSize: `${finiteNumber(element.fontSize, 12)}px`,
    lineHeight: `${finiteNumber(element.lineHeight, finiteNumber(element.fontSize, 12) * 1.2)}px`,
    letterSpacing: `${finiteNumber(element.letterSpacing, 0)}px`,
    fontWeight: element.bold ? "700" : "400",
    fontStyle: element.italic ? "italic" : "normal",
    textDecoration: element.underline ? "underline" : "none",
    textAlign: element.align || "left",
    textTransform: element.textTransform || "none",
  });
  mirror.innerHTML = element.bulletList
    ? bulletRunsToEditableHtml(content, element.runs)
    : plainParagraphsHtml(content, element.runs);

  const paragraphs = Array.from(mirror.children);
  const logicalLines = content.split("\n");
  if (paragraphs.length !== logicalLines.length) return null;

  documentRef.body.appendChild(mirror);
  try {
    const mirrorLeft = mirror.getBoundingClientRect().left;
    const resolved = [];
    let lineStart = 0;
    let lineStartCodePoints = 0;

    logicalLines.forEach((logicalLine, index) => {
      const paragraph = paragraphs[index];
      const lineEnd = lineStart + logicalLine.length;
      const lineEndCodePoints = lineStartCodePoints + codePointLength(logicalLine);
      const match = element.bulletList ? logicalLine.match(BULLET_RE) : null;
      const bullet = Boolean(match);
      const prefixLength = match?.[0]?.length ?? 0;
      const sourceStart = lineStartCodePoints
        + codePointLength(logicalLine.slice(0, prefixLength));
      const bodyText = logicalLine.slice(prefixLength);
      const body = bullet
        ? paragraph.querySelector('[data-editable-bullet-body="true"]')
        : paragraph;
      const marker = bullet
        ? paragraph.querySelector('[data-editable-bullet-marker="true"]')
        : null;

      if (bullet) {
        Object.assign(paragraph.style, {
          display: "grid",
          gridTemplateColumns: "max-content minmax(0, 1fr)",
          width: "100%",
        });
        if (marker) marker.style.whiteSpace = "pre";
        if (body) body.style.minWidth = "0";
      } else {
        paragraph.style.display = "block";
        paragraph.style.width = "100%";
      }
      if (!logicalLine) {
        paragraph.style.minHeight = mirror.style.lineHeight;
      }

      const indent = marker?.getBoundingClientRect().width ?? 0;
      if (!body) throw new Error("Textarea export mirror is missing its body node.");
      resolved.push(...measureParagraphLines({
        body,
        bodyText,
        sourceStart,
        paragraphEndOffset: lineEndCodePoints,
        mirrorLeft,
        indent,
        bullet,
        lineHeight: finiteNumber(
          element.lineHeight,
          finiteNumber(element.fontSize, 12) * 1.2,
        ),
        documentRef,
      }));
      lineStart = lineEnd + 1;
      lineStartCodePoints = lineEndCodePoints + 1;
    });

    if (element.textTransform === "uppercase") {
      return resolved.map((line) => ({ ...line, text: line.text.toUpperCase() }));
    }
    return resolved;
  } finally {
    mirror.remove();
  }
}

/**
 * Add transient browser line records to every renderable textarea.
 *
 * The function is fail-open by design: unsupported/test environments keep the
 * original elements so ReportLab's calibrated wrapper remains a compatible
 * fallback. The records are attached only to the outgoing request and are not
 * written back into editor state.
 */
export async function resolveBrowserTextLayouts(
  elements,
  documentRef = typeof document === "undefined" ? null : document,
) {
  if (!Array.isArray(elements) || !documentRef?.body) return elements;
  const fontReady = await Promise.all(elements.map(async (element) => {
    if (element?.category !== "textarea" || element.deleted) return false;
    try {
      return await loadElementFonts(element, documentRef);
    } catch {
      return false;
    }
  }));
  try {
    await documentRef.fonts?.ready;
  } catch {
    // Individual readiness already failed closed. The backend wrapper remains
    // available for every element whose primary face could not be confirmed.
  }

  return elements.map((element, index) => {
    if (element?.category !== "textarea" || element.deleted) return element;
    if (!fontReady[index]) return element;
    try {
      const resolvedLines = resolveTextareaBrowserLines(element, documentRef);
      return resolvedLines?.length ? { ...element, resolvedLines } : element;
    } catch {
      return element;
    }
  });
}
