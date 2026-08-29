import { getVisualBounds } from "./elementBounds";

function validBounds(bounds) {
  if (!bounds) return null;
  const left = Number(bounds.left);
  const top = Number(bounds.top);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return {
    left,
    top,
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

/**
 * Returns the smallest rectangle containing every valid input rectangle.
 *
 * Zero-size rectangles remain useful because a section can contain a line or
 * anchor whose position extends the semantic highlight even when it has no
 * painted area of its own.
 *
 * @param {Array<{left:number,top:number,width:number,height:number}|null>} bounds
 * @returns {{left:number,top:number,width:number,height:number}|null}
 */
export function unionCanvasBounds(bounds) {
  const valid = bounds.map(validBounds).filter(Boolean);
  if (valid.length === 0) return null;

  const left = Math.min(...valid.map((box) => box.left));
  const top = Math.min(...valid.map((box) => box.top));
  const right = Math.max(...valid.map((box) => box.left + box.width));
  const bottom = Math.max(...valid.map((box) => box.top + box.height));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * Measures the page-local highlight for a semantic section or record.
 *
 * Single-line text uses live Range geometry when mounted, while optically
 * aligned icons use their painted top rather than their stored label-line top.
 * Other elements retain their actual DOM or persisted box. This distinction is
 * required because `line-height: 1` text and section icons can paint above the
 * coordinates used by the document-flow model.
 *
 * @param {object[]} documentElements - Complete canvas document state.
 * @param {Set<string>} memberIds - IDs belonging to the highlighted block.
 * @param {number} page - One-based page whose members should be measured.
 * `maxBottom` is a page-local semantic boundary, normally the start of the
 * next section in the same lane. It prevents a stale or deliberately generous
 * textarea height from making the current highlight cover that next section.
 *
 * @param {{maxBottom?:number|null}} [options]
 * @returns {{left:number,top:number,width:number,height:number}|null}
 */
export function elementBoundsOnPage(
  documentElements,
  memberIds,
  page,
  { maxBottom = null } = {},
) {
  const members = documentElements.filter((element) => (
    memberIds.has(element.element_id)
    && Math.max(1, Math.trunc(Number(element.page) || 1)) === page
  ));
  const bounds = unionCanvasBounds(members.map(getVisualBounds));
  if (maxBottom == null) return bounds;
  const numericMaxBottom = Number(maxBottom);
  if (!bounds || !Number.isFinite(numericMaxBottom)) return bounds;

  const boundedBottom = Math.min(bounds.top + bounds.height, numericMaxBottom);
  return {
    ...bounds,
    height: Math.max(0, boundedBottom - bounds.top),
  };
}

/**
 * Expands a previously calculated semantic highlight to include one element's
 * current painted bounds without ever shrinking the rest of the section.
 *
 * Section membership is calculated before the hover toolbar mounts. Calling
 * this when the toolbar becomes visible re-reads the heading's live Range, so
 * a late font/layout settle cannot leave the border crossing the heading.
 *
 * @param {{left:number,top:number,width:number,height:number}|null} highlight
 * @param {object|null} element
 * @returns {{left:number,top:number,width:number,height:number}|null}
 */
export function includeRenderedElementBounds(highlight, element) {
  return unionCanvasBounds([
    highlight,
    element ? getVisualBounds(element) : null,
  ]);
}
