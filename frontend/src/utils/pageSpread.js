/**
 * Page-spread helpers for multi-page canvas view and cross-page connectors.
 *
 * `visiblePageNumbers` decides which A4 surfaces to mount in one- vs two-page
 * mode. Hit-testing uses page canvas DOM nodes registered by PdfCanvas.
 */
export function visiblePageNumbers(currentPage, pageCount, isTwoPageView) {
  const count = Math.max(1, Number(pageCount) || 1);
  const active = Math.min(Math.max(1, Number(currentPage) || 1), count);
  if (!isTwoPageView || count < 2) return [active];
  return active < count ? [active, active + 1] : [active - 1, active];
}

/** Return the page under a client-space pointer, or null. */
export function findPageCanvasAtPoint(pageCanvases, clientX, clientY) {
  for (const { page, node } of pageCanvases) {
    const rect = node?.getBoundingClientRect?.();
    if (
      rect
      && clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom
    ) {
      return { page, node, rect };
    }
  }
  return null;
}

/** Connector ids whose endpoints live on different pages (invalid for PDF). */
export function crossPageConnectorIds(elements) {
  const byId = new Map(elements.map((element) => [element.element_id, element]));
  return elements
    .filter((element) => {
      if (element.category !== "connector") return false;
      const source = byId.get(element.source_id);
      const target = byId.get(element.target_id);
      return source && target && (source.page ?? 1) !== (target.page ?? 1);
    })
    .map((element) => element.element_id);
}
