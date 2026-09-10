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
        return { index, rects: [...range.getClientRects(),
          ...(shape ? [shape.getBoundingClientRect()] : [])] };
      }
      offset = next;
    }
    return { index, rects: [] };
  });
}
