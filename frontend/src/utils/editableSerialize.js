/**
 * contentEditable ⇆ `{ content, runs }` bridge for inline-decorated text.
 *
 * The editing surface is a contentEditable node whose DOM is authoritative
 * while the user types. These helpers convert between that DOM and the plain
 * `content` string + inline `runs` overlay the rest of the app stores.
 *
 * The seeded HTML uses explicit `data-*` attributes on `<span>`s (not
 * execCommand output), so serialization is deterministic. Pasted rich content
 * is parsed on a best-effort basis from common tags and inline styles.
 *
 * Newline handling: the editing surfaces use `white-space: pre-wrap`, so our
 * seeded content keeps literal "\n" text nodes. Browsers may still insert
 * `<br>` / block elements when the user presses Enter; serialization folds both
 * back to "\n", and the offset helpers count them identically so toolbar
 * selection offsets always line up with `content`.
 */

import {
  normalizeRuns,
  runsToPerChar,
  sliceRuns,
  styledSegments,
} from "./textRuns.js";
import { sanitizeChar } from "./sanitizeTextContent.js";

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
// Elements whose boundary represents a line break in the flattened text.
const BLOCK_TAGS = new Set(["DIV", "P", "LI"]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render `{ content, runs }` to an HTML string for seeding a contentEditable.
 * Styled spans carry both inline style (so they look right immediately) and
 * `data-*` attributes (so {@link serializeEditable} can read them back exactly).
 */
export function runsToHtml(content, runs) {
  const segments = styledSegments(content, runs);
  if (segments.length === 0) return "";
  return segments
    .map((segment) => {
      const text = escapeHtml(segment.text);
      if (!segment.bold && !segment.italic && !segment.underline && !segment.color) {
        return text;
      }
      const attrs = [];
      const styles = [];
      if (segment.bold) {
        attrs.push('data-bold="true"');
        styles.push("font-weight:700");
      }
      if (segment.italic) {
        attrs.push('data-italic="true"');
        styles.push("font-style:italic");
      }
      if (segment.underline) {
        attrs.push('data-underline="true"');
        styles.push("text-decoration:underline");
      }
      if (segment.color) {
        attrs.push(`data-color="${escapeHtml(segment.color)}"`);
        styles.push(`color:${segment.color}`);
      }
      return `<span ${attrs.join(" ")} style="${styles.join(";")}">${text}</span>`;
    })
    .join("");
}

/**
 * Render a bullet-list editing surface as explicit logical paragraphs.
 *
 * Display mode and the PDF renderer reserve a separate, font-sized column for
 * the normalized `• ` marker. A flat contentEditable text node cannot express
 * that hanging indent: wrapped continuation lines receive the full box width
 * and may keep one extra word. These paragraph nodes give edit mode the same
 * two-column geometry while preserving the stored plain-text representation.
 * Non-bullet paragraphs remain full-width because bullet-list textareas can
 * intentionally contain a heading or blank row between bullet groups.
 *
 * @param {string} content - Sanitized textarea content.
 * @param {Array} runs - Inline style runs indexed against `content`.
 * @returns {string} Deterministic HTML for seeding or measuring the editor.
 */
export function bulletRunsToEditableHtml(content, runs) {
  const text = typeof content === "string" ? content : String(content ?? "");
  let offset = 0;
  return text.split("\n").map((line) => {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;

    const bulletMatch = line.match(/^\s*•[ \t]*/);
    if (!bulletMatch) {
      const lineRuns = sliceRuns(runs, lineStart, lineEnd);
      return `<div data-editable-paragraph="plain">${runsToHtml(line, lineRuns)}</div>`;
    }

    const bodyStart = lineStart + bulletMatch[0].length;
    const body = line.slice(bulletMatch[0].length);
    const bodyRuns = sliceRuns(runs, bodyStart, lineEnd);
    return (
      '<div data-editable-paragraph="bullet">'
      + '<span data-editable-bullet-marker="true">• </span>'
      + `<span data-editable-bullet-body="true">${runsToHtml(body, bodyRuns)}</span>`
      + "</div>"
    );
  }).join("");
}

// Replace one stored-text range and move every inline run with its character.
// Inserted paragraph separators and bullet markers intentionally start without
// marks; text on either side keeps the exact decoration it had before Enter.
function replaceEditableTextRange(content, runs, start, end, insertedText) {
  const text = typeof content === "string" ? content : String(content ?? "");
  const beforeMarks = runsToPerChar(text, runs);
  const insertion = String(insertedText ?? "");
  const nextContent = text.slice(0, start) + insertion + text.slice(end);
  const nextMarks = [
    ...beforeMarks.slice(0, start),
    ...new Array(insertion.length).fill(null),
    ...beforeMarks.slice(end),
  ];
  const rawRuns = [];
  for (let index = 0; index < nextMarks.length; index += 1) {
    const marks = nextMarks[index];
    if (!marks) continue;
    rawRuns.push({ start: index, end: index + 1, ...marks });
  }
  return {
    content: nextContent,
    runs: normalizeRuns(nextContent, rawRuns),
    caret: start + insertion.length,
  };
}

/**
 * Build the authoritative textarea payload produced by pressing Enter.
 *
 * Bullet editing follows the familiar list contract: a filled item creates a
 * new `• ` item, an empty item exits the list into a plain empty paragraph,
 * and Enter inside a plain paragraph creates another plain paragraph. The
 * operation is DOM-independent so Chromium cannot relocate the caret while a
 * bullet paragraph is being rebuilt into its marker/body grid.
 *
 * @param {{
 *   content: string,
 *   runs?: object[],
 *   selection?: {start: number, end: number}|null,
 *   bulletList?: boolean,
 * }} options
 * @returns {{content: string, runs: object[], caret: number}}
 */
export function createTextareaEnterEdit({
  content,
  runs,
  selection,
  bulletList = false,
}) {
  const text = typeof content === "string" ? content : String(content ?? "");
  const rawStart = Number.isFinite(selection?.start) ? selection.start : text.length;
  const rawEnd = Number.isFinite(selection?.end) ? selection.end : rawStart;
  const from = Math.max(0, Math.min(text.length, Math.min(rawStart, rawEnd)));
  const to = Math.max(from, Math.min(text.length, Math.max(rawStart, rawEnd)));

  if (!bulletList) {
    return replaceEditableTextRange(text, runs, from, to, "\n");
  }

  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const lineEndIndex = text.indexOf("\n", from);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);
  const bulletMatch = line.match(/^\s*•[ \t]*/);

  if (bulletMatch && line.slice(bulletMatch[0].length).trim() === "") {
    // Replace the complete marker-only row, not just the marker glyph. This
    // leaves the surrounding newline in place and therefore creates one real
    // plain paragraph that can accept text or another Enter immediately.
    return replaceEditableTextRange(text, runs, lineStart, lineEnd, "");
  }

  return replaceEditableTextRange(
    text,
    runs,
    from,
    to,
    bulletMatch ? "\n• " : "\n",
  );
}

// Read the marks an element node contributes, layered over inherited marks.
function marksFromElement(node, inherited) {
  const marks = { ...inherited };
  const tag = (node.nodeName || "").toUpperCase();

  // Primary path: our own data-* spans.
  const attr = node.getAttribute ? (name) => node.getAttribute(name) : () => null;
  if (attr("data-bold") === "true") marks.bold = true;
  if (attr("data-italic") === "true") marks.italic = true;
  if (attr("data-underline") === "true") marks.underline = true;
  const dataColor = attr("data-color");
  if (dataColor) marks.color = dataColor;

  // Best-effort fallback for pasted content.
  if (tag === "B" || tag === "STRONG") marks.bold = true;
  if (tag === "I" || tag === "EM") marks.italic = true;
  if (tag === "U") marks.underline = true;
  const style = node.style;
  if (style) {
    const weight = String(style.fontWeight || "");
    if (weight === "bold" || Number(weight) >= 600) marks.bold = true;
    if (style.fontStyle === "italic") marks.italic = true;
    const decoration = String(style.textDecorationLine || style.textDecoration || "");
    if (decoration.includes("underline")) marks.underline = true;
  }
  return marks;
}

// Flatten the DOM subtree into a parallel (chars, marks) pair, inserting "\n"
// for <br> and block boundaries so the text matches the stored content shape.
function flatten(root) {
  const chars = [];
  const marks = [];
  let explicitParagraphCount = 0;

  const pushBreak = (inherited) => {
    // Avoid a leading newline and collapse doubles the browser sometimes emits.
    if (chars.length === 0 || chars[chars.length - 1] === "\n") return;
    chars.push("\n");
    marks.push(inherited);
  };

  const walk = (node, inherited) => {
    const children = node.childNodes || [];
    for (const child of children) {
      if (child.nodeType === TEXT_NODE) {
        const value = child.nodeValue ?? "";
        for (const ch of value) {
          chars.push(ch);
          marks.push(inherited);
        }
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      const tag = (child.nodeName || "").toUpperCase();
      if (tag === "BR") {
        chars.push("\n");
        marks.push(inherited);
        continue;
      }
      const isExplicitParagraph = BLOCK_TAGS.has(tag)
        && child.getAttribute?.("data-editable-paragraph") !== null;
      if (isExplicitParagraph) {
        // Our bullet editor renders one explicit block per stored logical
        // line. Every boundary is authoritative, including two adjacent empty
        // paragraphs; collapsing those boundaries made repeated Enter a no-op.
        if (explicitParagraphCount > 0) {
          chars.push("\n");
          marks.push(inherited);
        }
        explicitParagraphCount += 1;
      } else if (BLOCK_TAGS.has(tag)) {
        // Browser-created wrappers can coexist with literal newline nodes.
        // Keep the legacy de-duplication only for those unowned wrappers.
        pushBreak(inherited);
      }
      walk(child, marksFromElement(child, inherited));
    }
  };

  walk(root, {});
  return { chars, marks };
}

/**
 * Serialize a contentEditable node to `{ content, runs }`.
 *
 * Control/invisible characters are dropped and exotic spaces folded (matching
 * {@link sanitizeTextContent}) while the parallel style array is kept aligned,
 * so run offsets always index the returned `content`.
 */
export function serializeEditable(root) {
  if (!root) return { content: "", runs: [] };
  const { chars, marks } = flatten(root);

  let content = "";
  const rawRuns = [];
  for (let i = 0; i < chars.length; i += 1) {
    const clean = sanitizeChar(chars[i]);
    if (clean === "") continue; // dropped char drops its style entry too
    const index = content.length;
    content += clean;
    const marksAt = marks[i];
    if (marksAt && (marksAt.bold || marksAt.italic || marksAt.underline || marksAt.color)) {
      rawRuns.push({ start: index, end: index + 1, ...marksAt });
    }
  }
  return { content, runs: normalizeRuns(content, rawRuns) };
}

/**
 * Character offset of a DOM (node, offset) selection boundary within the
 * flattened text. Uses the SAME traversal and newline rules as
 * {@link serializeEditable} — but WITHOUT sanitization, because the caret sits
 * in the live DOM whose characters have not been dropped. Sanitization only
 * removes characters that cannot be typed or that fold to a space, so for the
 * caret's purposes the pre-sanitize offset matches the stored content in every
 * realistic editing case.
 */
function offsetOfBoundary(root, targetNode, targetOffset) {
  let count = 0;
  let found = false;
  let lastChar = "";
  let explicitParagraphCount = 0;

  const pushBreak = () => {
    if (count === 0 || lastChar === "\n") return;
    count += 1;
    lastChar = "\n";
  };

  const walk = (node) => {
    if (found) return;
    const children = node.childNodes || [];
    for (let idx = 0; idx < children.length; idx += 1) {
      if (found) return;
      const child = children[idx];
      if (child.nodeType === TEXT_NODE) {
        if (child === targetNode) {
          count += targetOffset;
          found = true;
          return;
        }
        const value = child.nodeValue ?? "";
        count += value.length;
        if (value.length) lastChar = value[value.length - 1];
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      const tag = (child.nodeName || "").toUpperCase();
      if (tag === "BR") {
        count += 1;
        lastChar = "\n";
        // A selection can point at the parent with an offset that lands here.
        if (node === targetNode && targetOffset === idx + 1) {
          found = true;
          return;
        }
        continue;
      }
      const isExplicitParagraph = BLOCK_TAGS.has(tag)
        && child.getAttribute?.("data-editable-paragraph") !== null;
      if (isExplicitParagraph) {
        if (explicitParagraphCount > 0) {
          count += 1;
          lastChar = "\n";
        }
        explicitParagraphCount += 1;
      } else if (BLOCK_TAGS.has(tag)) {
        pushBreak();
      }
      // Selection anchored to an element container at a child index.
      if (child === targetNode) {
        walkUntilChildIndex(child, targetOffset);
        found = true;
        return;
      }
      walk(child);
    }
  };

  // When the selection is anchored to an element node with a child-index
  // offset, count the characters of its first `childIndex` children.
  const walkUntilChildIndex = (node, childIndex) => {
    const children = node.childNodes || [];
    for (let i = 0; i < childIndex && i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType === TEXT_NODE) {
        const value = child.nodeValue ?? "";
        count += value.length;
        if (value.length) lastChar = value[value.length - 1];
      } else if (child.nodeType === ELEMENT_NODE) {
        const tag = (child.nodeName || "").toUpperCase();
        if (tag === "BR") {
          count += 1;
          lastChar = "\n";
        } else {
          const sub = countText(child);
          count += sub.length;
          if (sub.length) lastChar = sub[sub.length - 1];
        }
      }
    }
  };

  const countText = (node) => {
    let text = "";
    const children = node.childNodes || [];
    for (const child of children) {
      if (child.nodeType === TEXT_NODE) text += child.nodeValue ?? "";
      else if (child.nodeType === ELEMENT_NODE) {
        const tag = (child.nodeName || "").toUpperCase();
        text += tag === "BR" ? "\n" : countText(child);
      }
    }
    return text;
  };

  if (targetNode === root) {
    walkUntilChildIndex(root, targetOffset);
    return count;
  }
  walk(root);
  return count;
}

/**
 * Current selection as `{ start, end }` character offsets within `root`, or
 * null when there is no selection inside it. Browser-only.
 */
export function getSelectionOffsets(root) {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const start = offsetOfBoundary(root, range.startContainer, range.startOffset);
  const end = offsetOfBoundary(root, range.endContainer, range.endOffset);
  return start <= end ? { start, end } : { start: end, end: start };
}

// Resolve a character offset to a concrete (textNode, offset) DOM position,
// walking the same flattened order used everywhere else.
function domPositionForOffset(root, offset) {
  let remaining = offset;
  let lastText = null;
  let lastTextLen = 0;
  let emittedAny = false;
  let lastChar = "";
  let explicitParagraphCount = 0;

  const walk = (node) => {
    const children = node.childNodes || [];
    for (const child of children) {
      if (child.nodeType === TEXT_NODE) {
        const len = (child.nodeValue ?? "").length;
        lastText = child;
        lastTextLen = len;
        const endsAtBulletMarker = remaining === len
          && child.parentNode?.getAttribute?.("data-editable-bullet-marker") === "true";
        if (endsAtBulletMarker) {
          // The stored offset after `• ` is also the start of the bullet body.
          // Prefer that semantic insertion point over the visual end of the
          // marker span, otherwise newly typed copy widens the marker column.
          remaining = 0;
          if (len > 0) {
            emittedAny = true;
            lastChar = child.nodeValue[len - 1];
          }
          continue;
        }
        if (remaining <= len) {
          const found = { node: child, offset: remaining };
          remaining = -1;
          return found;
        }
        remaining -= len;
        if (len > 0) {
          emittedAny = true;
          lastChar = child.nodeValue[len - 1];
        }
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      const tag = (child.nodeName || "").toUpperCase();
      if (
        remaining <= 0
        && child.getAttribute?.("data-editable-bullet-body") === "true"
      ) {
        return { node: child, offset: 0 };
      }
      if (tag === "BR") {
        if (remaining <= 0) {
          const found = { node: child.parentNode, offset: 0 };
          remaining = -1;
          return found;
        }
        remaining -= 1;
        emittedAny = true;
        lastChar = "\n";
        continue;
      }
      const isExplicitParagraph = BLOCK_TAGS.has(tag)
        && child.getAttribute?.("data-editable-paragraph") !== null;
      if (isExplicitParagraph) {
        // `flatten` preserves every boundary between our explicit logical
        // paragraphs, including consecutive empty rows. Consume the same
        // synthetic newline for offset-to-DOM restoration.
        if (explicitParagraphCount > 0) {
          remaining -= 1;
          emittedAny = true;
          lastChar = "\n";
          if (remaining <= 0) {
            return { node: child, offset: 0 };
          }
        }
        explicitParagraphCount += 1;
        if (explicitParagraphCount === 1 && remaining <= 0) {
          return { node: child, offset: 0 };
        }
      // Unowned browser block wrappers retain the collapsed-boundary contract
      // used by `flatten` so literal newlines are never counted twice.
      } else if (BLOCK_TAGS.has(tag) && emittedAny && lastChar !== "\n") {
        remaining -= 1;
        lastChar = "\n";
        // Offset immediately after that newline belongs at the start of this
        // paragraph. Falling through used to return the previous text node
        // when this paragraph was empty, so Enter appeared to do nothing and
        // the next keystroke continued the preceding bullet instead.
        if (remaining <= 0) {
          return { node: child, offset: 0 };
        }
      } else if (BLOCK_TAGS.has(tag) && !emittedAny && remaining <= 0) {
        // Empty editors and offset zero of the first paragraph need a concrete
        // insertion point inside that paragraph, not beside it at root level.
        return { node: child, offset: 0 };
      }
      const result = walk(child);
      if (result) return result;
    }
    return null;
  };

  const found = walk(root);
  if (found) return found;
  if (lastText) return { node: lastText, offset: lastTextLen };
  return { node: root, offset: 0 };
}

/**
 * Restore a selection spanning `[start, end)` character offsets within `root`.
 * Browser-only; used after the toolbar re-renders the editable from runs.
 */
export function setSelectionOffsets(root, start, end) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const selection = window.getSelection();
  if (!selection) return;
  const from = domPositionForOffset(root, start);
  const to = domPositionForOffset(root, end);
  const range = document.createRange();
  try {
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Offsets can momentarily be stale during rapid edits; ignore and let the
    // next user interaction re-establish a valid selection.
  }
}
