import { sliceRuns } from "./textRuns.js";
import { canvasFontFamily } from "./canvasFont.js";

/**
 * A trailing line that should not inflate textarea height / storage.
 * Blank lines and bullet-only placeholders (`•` / `• `) are empty.
 *
 * @param {string} line
 * @param {boolean} [bulletList=false]
 * @returns {boolean}
 */
export function isEmptyTextareaLine(line, bulletList = false) {
  const text = String(line ?? "");
  if (!text.trim()) return true;
  // Bullet lists often leave a bare marker after Enter; treat it as empty
  // trailing chrome, not a real list item.
  if (bulletList && /^\s*•\s*$/.test(text)) return true;
  return false;
}

/**
 * Drop trailing empty rows from bullet-list textarea content.
 *
 * Plain textareas preserve every authored newline, including trailing blank
 * paragraphs. Those rows are user-controlled spacing and must remain visible
 * after edit mode closes. Bullet lists still accumulate bare `•` placeholders
 * while editing; trimming those placeholders prevents accidental list chrome
 * from inflating section rhythm after reflow.
 *
 * Only *trailing* empties are removed. Blank lines between real content
 * (paragraph breaks, a heading line above a bullet group) are preserved.
 *
 * @param {string|null|undefined} content
 * @param {{ bulletList?: boolean, keepTrailingEmptyLines?: number }} [options]
 * @returns {string}
 */
export function trimTrailingEmptyTextareaLines(
  content,
  { bulletList = false, keepTrailingEmptyLines = 0 } = {},
) {
  if (!bulletList) {
    return String(content ?? "");
  }

  const lines = String(content ?? "").split("\n");
  let end = lines.length;
  while (end > 0 && isEmptyTextareaLine(lines[end - 1], bulletList)) {
    end -= 1;
  }
  const keep = Math.max(0, Math.floor(Number(keepTrailingEmptyLines) || 0));
  const keepCount = Math.min(keep, lines.length - end);
  return lines.slice(0, end + keepCount).join("\n");
}

/**
 * Trim trailing empty lines and re-base inline runs onto the shorter string.
 *
 * @param {string|null|undefined} content
 * @param {object[]|null|undefined} runs
 * @param {{ bulletList?: boolean, keepTrailingEmptyLines?: number }} [options]
 * @returns {{ content: string, runs: object[]|null|undefined }}
 */
export function trimTrailingEmptyTextareaPayload(
  content,
  runs,
  options = {},
) {
  const nextContent = trimTrailingEmptyTextareaLines(content, options);
  if (nextContent === String(content ?? "")) {
    return { content: nextContent, runs };
  }
  if (!Array.isArray(runs) || runs.length === 0) {
    return { content: nextContent, runs };
  }
  return {
    content: nextContent,
    runs: sliceRuns(runs, 0, nextContent.length),
  };
}

/**
 * Build a reusable text-width reader backed by the browser's canvas engine.
 *
 * The CV canvas and this reader use the same registered font family, weight,
 * style, size, and letter spacing. That makes typography-preset transactions
 * aware of real glyph widths before React paints the resized textareas. When
 * no browser canvas is available (SSR/tests), callers receive `null` and the
 * existing deterministic character-count fallback remains in force.
 *
 * @returns {null|((text: string, style?: object) => number)}
 */
export function createCanvasTextWidthMeasurer() {
  if (typeof document === "undefined" || !document.createElement) return null;
  const context = document.createElement("canvas").getContext?.("2d");
  if (!context) return null;

  return (text, style = {}) => {
    const fontSize = Math.max(1, Number(style.fontSize) || 12);
    const weight = style.bold ? 700 : 400;
    const fontStyle = style.italic ? "italic" : "normal";
    context.font = `${fontStyle} ${weight} ${fontSize}px ${canvasFontFamily(style.fontFamily)}`;
    const value = String(text ?? "");
    const letterSpacing = Number(style.letterSpacing) || 0;
    return context.measureText(value).width
      + Math.max(0, value.length - 1) * letterSpacing;
  };
}

/**
 * Count browser-style soft wraps for one authored line.
 *
 * Words move to the next row as a unit when possible. A token wider than the
 * complete box is split character-by-character, matching the textarea CSS
 * `overflow-wrap: break-word` fallback. Whitespace that triggers a wrap is not
 * carried onto the next visual row, which mirrors normal line wrapping.
 */
function measuredWrappedLineCount(value, maxWidth, measureTextWidth, textStyle) {
  const text = String(value ?? "");
  if (!text) return 1;
  const safeWidth = Math.max(1, Number(maxWidth) || 1);
  const tokens = text.match(/\s+|\S+/g) || [text];
  let rows = 1;
  let current = "";

  const appendBrokenToken = (token) => {
    for (const character of token) {
      const candidate = current + character;
      if (current && measureTextWidth(candidate, textStyle) > safeWidth) {
        rows += 1;
        current = character;
      } else {
        current = candidate;
      }
    }
  };

  for (const token of tokens) {
    const isWhitespace = /^\s+$/.test(token);
    const candidate = current + token;
    if (!current || measureTextWidth(candidate, textStyle) <= safeWidth) {
      appendBrokenToken(token);
      continue;
    }

    rows += 1;
    current = "";
    // Browser wrapping consumes the separating space at the line boundary.
    if (!isWhitespace) appendBrokenToken(token);
  }
  return rows;
}

// Ports the backend's character-count wrap heuristic (cv_generator.py's
// Builder.block) so the frontend can keep a textarea's height in sync with
// its content without needing a mounted, editable DOM node to measure —
// e.g. during a width-resize drag, when the box isn't in edit mode. Callers
// performing a whole-document typography transaction may additionally supply
// `measureTextWidth`; that path uses real glyph widths and word boundaries.
export function measureTextareaHeight(
  content,
  width,
  fontSize,
  lineHeight,
  { bulletList = false, measureTextWidth = null, textStyle = {} } = {},
) {
  // Plain textarea blank rows remain measurable authored spacing. Bullet-list
  // placeholders are trimmed so the heuristic matches display-mode content.
  const text = trimTrailingEmptyTextareaLines(content, { bulletList });
  let renderedLines = 0;
  if (typeof measureTextWidth === "function") {
    const bulletMarker = "• ";
    const bulletMarkerWidth = measureTextWidth(bulletMarker, textStyle);
    for (const segment of text.split("\n")) {
      const bulletMatch = bulletList ? segment.match(/^\s*•[ \t]*/) : null;
      const visibleText = bulletMatch ? segment.slice(bulletMatch[0].length) : segment;
      const availableWidth = bulletMatch
        ? Math.max(1, Number(width) - bulletMarkerWidth)
        : width;
      renderedLines += measuredWrappedLineCount(
        visibleText,
        availableWidth,
        measureTextWidth,
        textStyle,
      );
    }
  } else {
    const cpl = Math.max(10, Math.floor(width / (fontSize * 0.52)));
    for (const seg of text.split("\n")) {
      renderedLines += seg.trim() ? Math.max(1, Math.ceil(seg.length / cpl)) : 1;
    }
  }
  // An empty field still needs one line box so the caret / placeholder fits.
  if (renderedLines === 0) renderedLines = 1;
  return renderedLines * lineHeight + 6;
}

// scrollHeight cannot be smaller than an element's currently assigned height.
// Measure with an intrinsic height so auto-height fields can shrink as well as
// grow, then restore the rendered style before React's state update lands.
export function measureNaturalScrollHeight(node) {
  if (!node?.style) return 0;

  const previousHeight = node.style.height;
  node.style.height = "auto";
  const measuredHeight = node.scrollHeight;
  node.style.height = previousHeight;

  return Number.isFinite(measuredHeight) ? measuredHeight : 0;
}

/**
 * Whether a preserveInitialLayout textarea should shrink to browser metrics.
 *
 * ReportLab-authored heights can overshoot the canvas scrollHeight, leaving
 * empty space that inflates visual section gaps. Growing on first mount still
 * races and stretches gaps, so the first pass is shrink-only.
 */
export function shouldShrinkPreservedLayout(authoredHeight, measuredHeight) {
  const authored = Number(authoredHeight);
  const measured = Number(measuredHeight);
  if (!Number.isFinite(authored) || !Number.isFinite(measured) || measured <= 0) {
    return false;
  }
  return measured < authored - 0.5;
}
