// Ports the backend's character-count wrap heuristic (cv_generator.py's
// Builder.block) so the frontend can keep a textarea's height in sync with
// its content without needing a mounted, editable DOM node to measure —
// e.g. during a width-resize drag, when the box isn't in edit mode.
export function measureTextareaHeight(content, width, fontSize, lineHeight) {
  const cpl = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  let renderedLines = 0;
  for (const seg of (content || "").split("\n")) {
    renderedLines += seg.trim() ? Math.max(1, Math.ceil(seg.length / cpl)) : 1;
  }
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
