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
      const canvas = node.closest("[data-page-canvas]");
      const canvasRect = canvas?.getBoundingClientRect();
      const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
      const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);
      return { width: rect.width / scaleX, height: rect.height / scaleY };
    }
  }

  const fontSize = Number(element.fontSize) || 12;
  if (element.category === "text") {
    return {
      width: parseFloat(element.width)
        || Math.max(fontSize, String(element.content || "").length * fontSize * 0.56),
      height: parseFloat(element.height) || fontSize,
    };
  }

  return {
    width: parseFloat(element.width) || 0,
    height: parseFloat(element.height) || 0,
  };
}

// Text elements can carry an authoring width that is wider or narrower than
// their visible glyphs. A Range measures the rendered content itself, which is
// the appropriate size for a canvas selection frame at every zoom level.
export function getTextContentBounds(element) {
  const node = typeof document !== "undefined"
    ? document.getElementById(element.element_id)
    : null;
  if (node) {
    const canvas = node.closest("[data-page-canvas]");
    const canvasRect = canvas?.getBoundingClientRect();
    const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
    const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);
    const toCanvas = (rect) => ({
      left: (rect.left - (canvasRect?.left ?? rect.left)) / scaleX,
      top: (rect.top - (canvasRect?.top ?? rect.top)) / scaleY,
      width: rect.width / scaleX,
      height: rect.height / scaleY,
    });

    // Native inputs/textareas have no DOM text children — measure the control
    // box. For everything else prefer ink bounds via Range.
    if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return toCanvas(rect);
    } else if (node.ownerDocument?.createRange) {
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(node);
      // Prefer client rects: they track glyph ink more tightly than the
      // aggregate bounding rect on some engines when line-boxes are involved.
      const clientRects = range.getClientRects();
      if (clientRects.length > 0) {
        let leftEdge = Infinity;
        let topEdge = Infinity;
        let rightEdge = -Infinity;
        let bottomEdge = -Infinity;
        for (const rect of clientRects) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          leftEdge = Math.min(leftEdge, rect.left);
          topEdge = Math.min(topEdge, rect.top);
          rightEdge = Math.max(rightEdge, rect.right);
          bottomEdge = Math.max(bottomEdge, rect.bottom);
        }
        if (Number.isFinite(leftEdge) && rightEdge > leftEdge && bottomEdge > topEdge) {
          return toCanvas({
            left: leftEdge,
            top: topEdge,
            width: rightEdge - leftEdge,
            height: bottomEdge - topEdge,
            right: rightEdge,
            bottom: bottomEdge,
          });
        }
      }
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return toCanvas(rect);
    }
  }

  return {
    left: Number(element.left) || 0,
    top: Number(element.top) || 0,
    ...getElementBounds(element),
  };
}

/**
 * Bounds used by orange spacing guides: glyph edges for text (ignores
 * line-height leading), element box for everything else.
 */
export function getVisualBounds(element) {
  if (element?.category === "text") {
    return getTextContentBounds(element);
  }
  const left = Number(element?.left) || 0;
  const top = Number(element?.top) || 0;
  const { width, height } = getElementBounds(element);
  return { left, top, width, height };
}

// Attaches a real, DOM-measured layout_bounds to every element that's
// currently mounted on screen (i.e. on the page currently being viewed).
// Elements with no live DOM node are marked bounds_estimated so the backend
// can prefer content-based fallbacks instead of treating stale boxes as truth.
// Textareas also report scrollHeight-based clipping for AI layout repair.
export function measureElements(elements) {
  return elements.map(element => {
    const node = typeof document !== "undefined"
      ? document.getElementById(element.element_id)
      : null;
    if (!node) {
      return {
        ...element,
        bounds_estimated: true,
      };
    }

    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return {
        ...element,
        bounds_estimated: true,
      };
    }

    const canvas = node.closest("[data-page-canvas]");
    const canvasRect = canvas?.getBoundingClientRect();
    const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
    const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);

    // scrollHeight/clientHeight are in the element's CSS pixel space, which
    // matches stored left/top/width/height (not the zoomed screen rect).
    const isTextarea = node.tagName === "TEXTAREA" || element.category === "textarea";
    const contentHeight = isTextarea
      ? node.scrollHeight
      : undefined;
    const clipped = isTextarea
      ? node.scrollHeight > node.clientHeight + 1
      : undefined;

    return {
      ...element,
      bounds_estimated: false,
      ...(contentHeight !== undefined ? { content_height: contentHeight } : {}),
      ...(clipped !== undefined ? { clipped } : {}),
      layout_bounds: {
        left: Number(element.left) || 0,
        top: Number(element.top) || 0,
        width: rect.width / scaleX,
        height: rect.height / scaleY,
      },
    };
  });
}
