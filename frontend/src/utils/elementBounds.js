// Shared element-measurement helpers. Both the canvas drag logic
// (useA4Elements.js) and the AI assistant's geometry snapshot sent to the
// backend need the real rendered size of an element, not stale stored
// values — especially for textareas, whose height depends on wrapped text.
import { imageDisplayTop } from "./iconAlignment";

function getCanvasMeasurement(node) {
  const canvas = node.closest("[data-page-canvas]");
  const canvasRect = canvas?.getBoundingClientRect();
  if (!canvas || !canvasRect) {
    return { canvasRect: null, scaleX: 1, scaleY: 1 };
  }

  const layoutWidth = canvas.clientWidth || canvasRect.width || 1;
  const layoutHeight = canvas.clientHeight || canvasRect.height || 1;
  return {
    canvasRect,
    scaleX: canvasRect.width / layoutWidth || 1,
    scaleY: canvasRect.height / layoutHeight || 1,
  };
}

function getTextRangeRect(node) {
  if (!node.ownerDocument?.createRange) return null;

  // A collapsed CSS box can still contain visible glyphs. Range geometry is
  // the browser's direct measurement of those glyphs and therefore provides a
  // reliable fallback when getBoundingClientRect() reports a zero-size <p>.
  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  const clientRects = range.getClientRects();
  if (clientRects.length > 0) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const rect of clientRects) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    if (Number.isFinite(left) && right > left && bottom > top) {
      return {
        left,
        top,
        width: right - left,
        height: bottom - top,
        right,
        bottom,
      };
    }
  }

  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

export function getElementBounds(element) {
  const node = typeof document !== "undefined"
    ? document.getElementById(element.element_id)
    : null;
  if (node) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const { scaleX, scaleY } = getCanvasMeasurement(node);
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
    const { canvasRect, scaleX, scaleY } = getCanvasMeasurement(node);
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
    } else {
      const rangeRect = getTextRangeRect(node);
      if (rangeRect) return toCanvas(rangeRect);
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
  // Text-aligned template icons store the companion label's line top rather
  // than the image's painted top. Consumers asking for *visual* bounds (for
  // example a section highlight) must include that optical shift or their top
  // border will cross the icon halfway down its glyph.
  const top = imageDisplayTop(element);
  const { width, height } = getElementBounds(element);
  return { left, top, width, height };
}

/**
 * Return the page-local rectangle used by editor selection and hover chrome.
 *
 * Single-line text follows its rendered glyph ink instead of its optional
 * alignment width. Every other category follows the rendered element box,
 * including the optical top shift applied to text-aligned icons. The one-pixel
 * minimum keeps an empty but editable element discoverable without changing
 * its authored geometry.
 *
 * @param {object} element - A mounted or model-only canvas element.
 * @returns {{left:number,top:number,width:number,height:number}}
 */
export function getElementOutlineBounds(element) {
  const bounds = getVisualBounds(element);
  return {
    left: Number.isFinite(bounds.left) ? bounds.left : Number(element?.left) || 0,
    top: Number.isFinite(bounds.top) ? bounds.top : Number(element?.top) || 0,
    width: Math.max(Number(bounds.width) || 0, 1),
    height: Math.max(Number(bounds.height) || 0, 1),
  };
}

// Attaches a real, DOM-measured layout_bounds to every element that's
// currently mounted on screen (i.e. on the page currently being viewed).
// Elements with no live DOM node are marked bounds_estimated so the backend
// can prefer content-based fallbacks instead of treating stale boxes as truth.
// A visible text node with a collapsed box falls back to its Range geometry.
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
        bounds_estimate_reason: "missing_dom_node",
      };
    }

    const boxRect = node.getBoundingClientRect();
    const { scaleX, scaleY } = getCanvasMeasurement(node);
    let measuredWidth = boxRect.width / scaleX;
    let measuredHeight = boxRect.height / scaleY;
    let measurementSource = "dom_box";

    if (
      element.category === "text"
      && (measuredWidth <= 0 || measuredHeight <= 0)
    ) {
      const rangeRect = getTextRangeRect(node);
      if (rangeRect) {
        const fontSize = Number(element.fontSize) || 12;
        measuredWidth = rangeRect.width / scaleX;
        // Text.jsx uses line-height: 1. Range height measures glyph ink, which
        // can be shorter than the line box, so preserve at least one font-size
        // line for backend bottom-edge and gap calculations.
        measuredHeight = Math.max(rangeRect.height / scaleY, fontSize);
        measurementSource = "text_range_line_box";
      }
    }

    if (measuredWidth <= 0 || measuredHeight <= 0) {
      return {
        ...element,
        bounds_estimated: true,
        bounds_estimate_reason: "zero_dom_rect",
      };
    }

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
      bounds_measurement_source: measurementSource,
      ...(contentHeight !== undefined ? { content_height: contentHeight } : {}),
      ...(clipped !== undefined ? { clipped } : {}),
      layout_bounds: {
        left: Number(element.left) || 0,
        top: Number(element.top) || 0,
        width: measuredWidth,
        height: measuredHeight,
      },
    };
  });
}
