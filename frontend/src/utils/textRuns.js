/**
 * Inline decoration model for text / textarea content.
 *
 * A "run" is a style overlay addressed by character offset into the plain
 * `content` string: `{ start, end, bold?, italic?, underline?, color? }`.
 * `content` itself stays plain text — runs never change it. This mirrors the
 * backend `TextRun` contract so the same offsets drive the PDF renderer.
 *
 * A mark KEY present on a run means "override this mark for the span":
 *   - bold / italic / underline: the value `true` applies the mark.
 *   - color: a hex string sets the text colour.
 * Removing a mark deletes its key so the span falls back to the element base
 * style. v1 does not store explicit `false` overrides (see `applyMark`), which
 * keeps runs compact; the backend collapses any no-op span regardless.
 *
 * All functions here are pure and DOM-free so they can be unit tested under
 * Node. DOM serialization lives in `editableSerialize.js`.
 */

export const MARK_KEYS = ["bold", "italic", "underline", "color"];

function clampOffset(value, len) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(len, n));
}

// True when a mark descriptor carries at least one active override. Explicit
// `false` booleans are treated as "no override" so they never bloat the model.
function hasActiveMark(marks) {
  if (!marks) return false;
  return (
    marks.bold === true
    || marks.italic === true
    || marks.underline === true
    || (typeof marks.color === "string" && marks.color !== "")
  );
}

// Keep only the active overrides from a raw mark descriptor.
function cleanMarks(marks) {
  const out = {};
  if (marks.bold === true) out.bold = true;
  if (marks.italic === true) out.italic = true;
  if (marks.underline === true) out.underline = true;
  if (typeof marks.color === "string" && marks.color !== "") out.color = marks.color;
  return out;
}

function sameMarks(a, b) {
  if (!a || !b) return false;
  return (
    !!a.bold === !!b.bold
    && !!a.italic === !!b.italic
    && !!a.underline === !!b.underline
    && (a.color || null) === (b.color || null)
  );
}

/**
 * Expand runs into a per-character array of active mark descriptors (or null).
 * Later runs overlay earlier ones on overlap, so callers do not need to
 * pre-sort or de-overlap their input.
 */
export function runsToPerChar(content, runs) {
  const len = typeof content === "string" ? content.length : 0;
  const perChar = new Array(len).fill(null);
  if (!Array.isArray(runs) || len === 0) return perChar;

  for (const run of runs) {
    if (!run) continue;
    const start = clampOffset(run.start, len);
    const end = clampOffset(run.end, len);
    if (start === null || end === null || end <= start) continue;
    for (let i = start; i < end; i += 1) {
      const current = perChar[i] || {};
      const next = { ...current };
      for (const key of MARK_KEYS) {
        const value = run[key];
        if (key === "color") {
          if (typeof value === "string" && value !== "") next.color = value;
          else if (value === null) delete next.color;
        } else if (value === true) {
          next[key] = true;
        } else if (value === false) {
          delete next[key];
        }
      }
      perChar[i] = next;
    }
  }
  return perChar;
}

// Coalesce a per-character mark array back into minimal, sorted, non-overlapping
// runs, dropping characters that carry no active mark.
function perCharToRuns(perChar) {
  const out = [];
  const len = perChar.length;
  let i = 0;
  while (i < len) {
    const marks = perChar[i];
    if (!hasActiveMark(marks)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < len && sameMarks(perChar[j], marks)) j += 1;
    out.push({ start: i, end: j, ...cleanMarks(marks) });
    i = j;
  }
  return out;
}

/**
 * Normalize arbitrary run input against `content`: clamp offsets to the content
 * length, drop empty/no-op spans, merge adjacent equal spans, and sort. The
 * result is the canonical form persisted and sent to the backend.
 */
export function normalizeRuns(content, runs) {
  return perCharToRuns(runsToPerChar(content, runs));
}

/**
 * Toggle or set a single mark over `[start, end)` and return normalized runs.
 *
 * @param {string} content
 * @param {Array} runs - current runs (any shape; normalized internally)
 * @param {number} start
 * @param {number} end
 * @param {"bold"|"italic"|"underline"|"color"} mark
 * @param {boolean|string|null} value - true/false for b-i-u, hex/null for color.
 *   A falsy value (false / null) removes the mark so the span reverts to base.
 */
export function applyMark(content, runs, start, end, mark, value) {
  const len = typeof content === "string" ? content.length : 0;
  const from = clampOffset(start, len);
  const to = clampOffset(end, len);
  const perChar = runsToPerChar(content, runs);
  if (from === null || to === null || to <= from) return perCharToRuns(perChar);

  const remove = value === false || value === null || value === undefined || value === "";
  for (let i = from; i < to; i += 1) {
    const marks = { ...(perChar[i] || {}) };
    if (remove) delete marks[mark];
    else marks[mark] = value;
    perChar[i] = marks;
  }
  return perCharToRuns(perChar);
}

/**
 * True when every character in `[start, end)` already carries `mark`. Used by
 * the toolbar to decide whether a B/I/U button should add or remove the mark.
 */
export function rangeHasMark(content, runs, start, end, mark) {
  const len = typeof content === "string" ? content.length : 0;
  const from = clampOffset(start, len);
  const to = clampOffset(end, len);
  if (from === null || to === null || to <= from) return false;
  const perChar = runsToPerChar(content, runs);
  for (let i = from; i < to; i += 1) {
    const marks = perChar[i];
    if (mark === "color") {
      if (!marks || typeof marks.color !== "string" || marks.color === "") return false;
    } else if (!marks || marks[mark] !== true) {
      return false;
    }
  }
  return true;
}

/**
 * Re-base runs onto a substring window `[start, end)` of the content, returning
 * runs whose offsets are relative to the window. Used to style a single wrapped
 * or bullet line whose text is a slice of the whole content.
 */
export function sliceRuns(runs, start, end) {
  const out = [];
  if (!Array.isArray(runs)) return out;
  for (const run of runs) {
    if (!run) continue;
    const s = Math.max(run.start, start);
    const e = Math.min(run.end, end);
    if (e > s) {
      const { start: _s, end: _e, ...marks } = run;
      out.push({ start: s - start, end: e - start, ...marks });
    }
  }
  return out;
}

/**
 * Split `content` into consecutive styled segments covering the whole string,
 * including unstyled gaps. Each segment is
 * `{ text, bold, italic, underline, color }` with defaults filled in, ready for
 * rendering as a span. Returns a single plain segment when there are no runs.
 */
export function styledSegments(content, runs) {
  const text = typeof content === "string" ? content : String(content ?? "");
  const normalized = normalizeRuns(text, runs);
  const fill = (slice, marks) => ({
    text: slice,
    bold: !!marks.bold,
    italic: !!marks.italic,
    underline: !!marks.underline,
    color: typeof marks.color === "string" && marks.color !== "" ? marks.color : null,
  });

  if (normalized.length === 0) {
    return text === "" ? [] : [fill(text, {})];
  }

  const segments = [];
  let index = 0;
  for (const run of normalized) {
    if (run.start > index) segments.push(fill(text.slice(index, run.start), {}));
    segments.push(fill(text.slice(run.start, run.end), run));
    index = run.end;
  }
  if (index < text.length) segments.push(fill(text.slice(index), {}));
  return segments;
}

/** True when the element carries at least one active inline run. */
export function hasRuns(runs) {
  return Array.isArray(runs) && runs.some(hasActiveMark);
}
