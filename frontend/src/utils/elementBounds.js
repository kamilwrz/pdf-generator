// Shared element-measurement helpers. Both the canvas drag logic
// (useA4Elements.js) and the AI assistant's geometry snapshot sent to the
// backend need the real rendered size of an element, not stale stored
// values — especially for textareas, whose height depends on wrapped text.

export function getElementBounds(element) {
  const node = typeof document !== "undefined"
    ? document.getElementById(element.element_id)
    : null;
  if (node) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const canvas = node.closest("#A4");
      const canvasRect = canvas?.getBoundingClientRect();
      const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
      const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);
      return { width: rect.width / scaleX, height: rect.height / scaleY };
    }
  }

  return {
    width: parseFloat(element.width) || 0,
    height: parseFloat(element.height)
      || (element.category === "text" ? (element.fontSize || 12) * 1.35 : 0),
  };
}

// Attaches a real, DOM-measured layout_bounds to every element that's
// currently mounted on screen (i.e. on the page currently being viewed).
// Elements with no live DOM node are left unchanged — the backend's own
// bounds fallback already handles a missing layout_bounds.
export function measureElements(elements) {
  return elements.map(element => {
    const node = typeof document !== "undefined"
      ? document.getElementById(element.element_id)
      : null;
    if (!node) return element;

    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return element;

    const canvas = node.closest("#A4");
    const canvasRect = canvas?.getBoundingClientRect();
    const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
    const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);

    return {
      ...element,
      layout_bounds: {
        left: Number(element.left) || 0,
        top: Number(element.top) || 0,
        width: rect.width / scaleX,
        height: rect.height / scaleY,
      },
    };
  });
}
