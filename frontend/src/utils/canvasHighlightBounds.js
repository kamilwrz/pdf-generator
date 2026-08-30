import { imageDisplayTop, isTextAlignedIcon } from "./iconAlignment.js";

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

function storedDimension(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function storedCoordinate(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Returns deterministic page-local visual bounds from persisted element data.
 *
 * This helper deliberately does not inspect the DOM. Section anchors are
 * calculated during render, before React commits positions changed by reorder
 * or lane transfer. Reading a live Range at that point can return the previous
 * position and make a moved section's outline absorb its former neighbour.
 * Text-aligned icon offsets remain safe because `imageDisplayTop` is pure math
 * derived from the same persisted geometry used by the renderer.
 *
 * @param {object|null|undefined} element
 * @returns {{left:number,top:number,width:number,height:number}}
 */
export function getStoredVisualBounds(element) {
  const fontSize = storedDimension(element?.fontSize) || 12;
  const explicitWidth = storedDimension(element?.width);
  const explicitHeight = storedDimension(element?.height);
  const isText = element?.category === "text";

  return {
    left: storedCoordinate(element?.left),
    top: imageDisplayTop(element),
    width: isText
      ? explicitWidth
        || Math.max(fontSize, String(element?.content || "").length * fontSize * 0.56)
      : explicitWidth,
    height: isText ? explicitHeight || fontSize : explicitHeight,
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
 * Applies page-local semantic vertical limits to a visual rectangle.
 *
 * The current section start protects against stale members above the section;
 * the next lane-local section start protects against oversized body boxes
 * below it. The function is intentionally reusable after every union so a
 * post-commit heading measurement cannot reintroduce either overflow.
 *
 * @param {{left:number,top:number,width:number,height:number}|null} bounds
 * @param {{minTop?:number|null,maxBottom?:number|null}} [limits]
 * @returns {{left:number,top:number,width:number,height:number}|null}
 */
export function clampCanvasBounds(
  bounds,
  { minTop = null, maxBottom = null } = {},
) {
  const valid = validBounds(bounds);
  if (!valid) return null;

  const numericMinTop = optionalNumber(minTop);
  const numericMaxBottom = optionalNumber(maxBottom);
  const top = numericMinTop != null
    ? Math.max(valid.top, numericMinTop)
    : valid.top;
  const bottom = numericMaxBottom != null
    ? Math.min(valid.top + valid.height, numericMaxBottom)
    : valid.top + valid.height;

  // Crossing structural limits indicate corrupt or mid-transition geometry.
  // Suppress the outline instead of drawing a zero-height horizontal line that
  // looks like authored CV content.
  if (bottom <= top) return null;

  return {
    ...valid,
    top,
    height: bottom - top,
  };
}

/**
 * Resolves the trusted visual start of one section on its heading page.
 *
 * `sectionStartAbs` is structural model data. Only the current heading and its
 * explicitly tagged leading chrome may extend that start upward optically.
 * This keeps Nova icons and Monument badges inside the outline without
 * allowing an accidentally supplied body member from the previous section to
 * move the boundary.
 *
 * @param {object[]} documentElements
 * @param {Set<string>} memberIds
 * @param {string} headingId
 * @param {number} page
 * @param {number} pageHeight
 * @param {number} sectionStartAbs
 * @returns {number}
 */
export function sectionVisualStartOnPage(
  documentElements,
  memberIds,
  headingId,
  page,
  pageHeight,
  sectionStartAbs,
) {
  const normalizedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const normalizedPageHeight = Math.max(1, Number(pageHeight) || 842);
  const pageStartAbs = (normalizedPage - 1) * normalizedPageHeight;
  const heading = documentElements.find((element) => element.element_id === headingId);
  const headingTop = storedCoordinate(heading?.top);
  const numericStartAbs = Number(sectionStartAbs);
  const semanticStart = Number.isFinite(numericStartAbs)
    ? numericStartAbs - pageStartAbs
    : headingTop;
  const candidates = [semanticStart];

  for (const element of documentElements) {
    if (!memberIds.has(element.element_id)) continue;
    if (Math.max(1, Math.trunc(Number(element.page) || 1)) !== normalizedPage) continue;
    const isOwnHeading = element.element_id === headingId;
    const isOwnChrome = element.flowRole === "section-chrome"
      || element.flowRole === "sidebar-chrome"
      // Older Iconic documents may have lost flow metadata while retaining the
      // asset path/alignment convention. Membership and structural detection
      // already accept these icons, so the visual boundary must do the same.
      || (element.category === "image"
        && isTextAlignedIcon(element.src, element.alignWithText));
    if (!isOwnHeading && !isOwnChrome) continue;

    const storedTop = storedCoordinate(element.top);
    // `listDocumentSections` already expands `sectionStartAbs` to leading
    // chrome. Requiring the persisted top to remain in that trusted band
    // excludes an unrelated member even if its id was supplied accidentally.
    if (storedTop < semanticStart - 0.01 || storedTop > headingTop + 0.01) continue;
    candidates.push(getStoredVisualBounds(element).top);
  }

  return Math.max(0, Math.min(normalizedPageHeight, ...candidates));
}

/**
 * Measures the page-local highlight for a semantic section or record.
 *
 * The base rectangle is intentionally model-only. Live text ink is measured
 * after React commits and merged by `includeRenderedBounds`; doing that work
 * here would read the pre-reorder DOM while this function runs during render.
 *
 * @param {object[]} documentElements - Complete canvas document state.
 * @param {Set<string>} memberIds - IDs belonging to the highlighted block.
 * @param {number} page - One-based page whose members should be measured.
 * @param {{minTop?:number|null,maxBottom?:number|null}} [options]
 * @returns {{left:number,top:number,width:number,height:number}|null}
 */
export function elementBoundsOnPage(
  documentElements,
  memberIds,
  page,
  { minTop = null, maxBottom = null } = {},
) {
  const members = documentElements.filter((element) => (
    memberIds.has(element.element_id)
    && Math.max(1, Math.trunc(Number(element.page) || 1)) === page
  ));
  const bounds = unionCanvasBounds(members.map(getStoredVisualBounds));
  return clampCanvasBounds(bounds, { minTop, maxBottom });
}

function extendBoundaryUp(boundary, renderedBounds, maximumExtension) {
  const numericBoundary = optionalNumber(boundary);
  const rendered = validBounds(renderedBounds);
  const extension = Math.max(0, Number(maximumExtension) || 0);
  if (numericBoundary == null || !rendered) return boundary;
  if (rendered.top >= numericBoundary || rendered.top < numericBoundary - extension) {
    return numericBoundary;
  }
  return Math.max(0, rendered.top);
}

/**
 * Refines model section limits with trusted post-commit heading ink.
 *
 * Browser glyphs can begin a few pixels above their stored `line-height: 1`
 * coordinate. Only that bounded optical extension is accepted. A Range from a
 * duplicate or stale DOM node that is farther away is ignored, so live
 * measurement cannot merge neighbouring sections again. The same rule lowers
 * the current section's bottom to the next heading's live ink start.
 *
 * @param {{minTop?:number|null,maxBottom?:number|null}} limits
 * @param {{
 *   headingBounds?:{left:number,top:number,width:number,height:number}|null,
 *   nextHeadingBounds?:{left:number,top:number,width:number,height:number}|null,
 *   headingTopExtension?:number,
 *   nextHeadingTopExtension?:number,
 * }} [rendered]
 * @returns {{minTop:number|null,maxBottom:number|null}}
 */
export function resolveRenderedHighlightLimits(
  { minTop = null, maxBottom = null } = {},
  {
    headingBounds = null,
    nextHeadingBounds = null,
    headingTopExtension = 0,
    nextHeadingTopExtension = 0,
  } = {},
) {
  return {
    minTop: extendBoundaryUp(minTop, headingBounds, headingTopExtension),
    maxBottom: extendBoundaryUp(maxBottom, nextHeadingBounds, nextHeadingTopExtension),
  };
}

/**
 * Merges a post-commit heading measurement into a semantic section highlight.
 *
 * The caller must supply bounds measured in `useLayoutEffect` for the current
 * model geometry and limits already refined by
 * `resolveRenderedHighlightLimits`. Both section boundaries are reapplied
 * after the union.
 *
 * @param {{left:number,top:number,width:number,height:number}|null} highlight
 * @param {{left:number,top:number,width:number,height:number}|null} renderedBounds
 * @param {{minTop?:number|null,maxBottom?:number|null}} [limits]
 * @returns {{left:number,top:number,width:number,height:number}|null}
 */
export function includeRenderedBounds(
  highlight,
  renderedBounds,
  { minTop = null, maxBottom = null } = {},
) {
  const rendered = validBounds(renderedBounds);
  return clampCanvasBounds(
    unionCanvasBounds([highlight, rendered]),
    { minTop, maxBottom },
  );
}
