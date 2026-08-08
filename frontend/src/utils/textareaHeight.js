import { sliceRuns } from "./textRuns.js";

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
 * Drop trailing empty lines from textarea content.
 *
 * Bullet lists and plain textareas both accumulate `\n` / bare `•` rows while
 * editing; those rows were previously stored and measured, so the orange edit
 * outline and the display box grew past the visible copy and broke section
 * rhythm after reflow.
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

// Ports the backend's character-count wrap heuristic (cv_generator.py's
// Builder.block) so the frontend can keep a textarea's height in sync with
// its content without needing a mounted, editable DOM node to measure —
// e.g. during a width-resize drag, when the box isn't in edit mode.
export function measureTextareaHeight(
  content,
  width,
  fontSize,
  lineHeight,
  { bulletList = false } = {},
) {
  // Ignore trailing empty / bare-bullet rows so the heuristic matches the
  // browser measure used by auto-height display boxes.
  const text = trimTrailingEmptyTextareaLines(content, { bulletList });
  const cpl = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  let renderedLines = 0;
  for (const seg of text.split("\n")) {
    renderedLines += seg.trim() ? Math.max(1, Math.ceil(seg.length / cpl)) : 1;
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
