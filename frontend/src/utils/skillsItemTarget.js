/**
 * Locate one semantic skill in authored text without adding wrappers to the
 * editable/PDF DOM. Offsets retain whitespace and separators for lossless edits.
 */
export function skillTextSegments(content, bulletList) {
  const text = String(content || "");
  const segments = [];
  const pattern = bulletList ? /[^\n]+/g : /[^·]+/g;
  for (const match of text.matchAll(pattern)) {
    const label = match[0].trim().replace(/^[•\-–*—∙·]\s*/, "").trim();
    if (!label) continue;
    segments.push({ label,
      start: match.index + match[0].length - match[0].trimStart().length,
      end: match.index + match[0].trimEnd().length,
    });
  }
  return segments;
}

/**
 * Measure each item's real glyph fragments, including wrapped text and inline
 * formatting. Searching in reading order distinguishes duplicate skill names.
 * The returned rectangles are screen coordinates and never enter saved state.
 */
export function measureSkillTargets(targets) {
  const offsets = new Map();
  return targets.map((target, index) => {
    const node = document.getElementById(target.elementId);
    if (!node) return { index, rects: [] };
    const start = node.textContent.indexOf(target.label, offsets.get(node) || 0);
    if (start < 0) return { index, rects: [] };
    const end = start + target.label.length;
    offsets.set(node, end);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    let started = false;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const next = offset + text.length;
      if (!started && start < next) {
        range.setStart(text, start - offset);
        started = true;
      }
      if (started && end <= next) {
        range.setEnd(text, end - offset);
        const shape = target.shapeId && document.getElementById(target.shapeId);
        const shapeRect = shape?.getBoundingClientRect();
        // One chip is its full shape. Underline variants have a one-pixel
        // shape, so use the glyphs to keep their delete target on the label.
        return { index, rects: mergeSkillRects(shapeRect?.height > 2
          ? [shapeRect] : [...range.getClientRects()]) };
      }
      offset = next;
    }
    return { index, rects: [] };
  });
}

/** Merge adjacent styled spans on the same visual line without joining wraps. */
export function mergeSkillRects(rects) {
  const lines = [];
  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const previous = lines.at(-1);
    if (previous && Math.abs(previous.top - rect.top) <= 2
      && Math.abs(previous.bottom - rect.bottom) <= 2
      && rect.left <= previous.right + 1 && rect.right >= previous.left - 1) {
      previous.left = Math.min(previous.left, rect.left);
      previous.right = Math.max(previous.right, rect.right);
      previous.top = Math.min(previous.top, rect.top);
      previous.bottom = Math.max(previous.bottom, rect.bottom);
    } else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  }
  return lines;
}

/**
 * Overlay the compact trash on the right end of the entered line fragment.
 * Use the live control size for viewport clamping and hide offscreen targets.
 * The fragment index is fixed while hovering a skill, preventing the button
 * from following the pointer as it moves toward the action.
 */
export function skillDeletePosition(rects, fragmentIndex, viewport, size = 24) {
  const rect = rects[fragmentIndex] || rects[0];
  if (!rect || rect.right <= 0 || rect.left >= viewport.width
    || rect.bottom <= 0 || rect.top >= viewport.height) return null;
  return {
    left: Math.max(8, Math.min(rect.right - size, viewport.width - size - 8)),
    top: Math.max(8, Math.min((rect.top + rect.bottom - size) / 2, viewport.height - size - 8)),
  };
}
