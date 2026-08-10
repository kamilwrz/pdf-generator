/**
 * Pure constructors for new canvas elements.
 *
 * Kept outside `useA4Elements` so add-handlers stay thin and factories can be
 * unit-tested without mounting the full editor hook. Callers supply `page`
 * and a fresh `element_id` (usually from nanoid).
 */
import { measureTextareaHeight } from "./textareaHeight";
import { pathCurvesForKind, polygonPointsForShape } from "./freeformShapes.js";

/**
 * @param {{ elementId: string, page?: number }} opts
 * @returns {object}
 */
export function createTextElement({ elementId, page = 1 }) {
  return {
    element_id: elementId,
    content: "Przykładowy tekst…",
    fontSize: 14,
    fontFamily: "Inter",
    color: "#000000",
    left: 10,
    top: 10,
    isSelected: false,
    isMove: false,
    locked: false,
    category: "text",
    bold: false,
    italic: false,
    underline: false,
    zIndex: 3,
    page,
  };
}

/**
 * @param {{ elementId: string, page?: number }} opts
 * @returns {object}
 */
export function createLineElement({ elementId, page = 1 }) {
  return {
    element_id: elementId,
    backgroundColor: "#000000",
    left: 10,
    width: 100,
    height: 10,
    top: 10,
    isSelected: false,
    isMove: false,
    locked: false,
    category: "line",
    zIndex: 2,
    page,
  };
}

/**
 * @param {{ elementId: string, page?: number }} opts
 * @returns {object}
 */
export function createRectangleElement({ elementId, page = 1 }) {
  return {
    element_id: elementId,
    backgroundColor: "#000000", // fill when filled; otherwise stroke colour
    borderWidth: 1,
    borderRadius: 0,
    filled: false,
    left: 20,
    top: 20,
    width: 120,
    height: 80,
    isSelected: false,
    isMove: false,
    locked: false,
    category: "rectangle",
    zIndex: 2,
    page,
  };
}

/**
 * @param {{ elementId: string, page?: number }} opts
 * @returns {object}
 */
export function createCircleElement({ elementId, page = 1 }) {
  return {
    element_id: elementId,
    backgroundColor: "#000000",
    borderWidth: 1,
    filled: false,
    left: 20,
    top: 20,
    width: 80,
    height: 80,
    isSelected: false,
    isMove: false,
    locked: false,
    category: "circle",
    zIndex: 2,
    page,
  };
}

/**
 * @param {{ elementId: string, page?: number }} opts
 * @returns {object}
 */
export function createEllipseElement({ elementId, page = 1 }) {
  return {
    element_id: elementId,
    backgroundColor: "#000000",
    borderWidth: 1,
    filled: false,
    left: 20,
    top: 20,
    width: 120,
    height: 80,
    isSelected: false,
    isMove: false,
    locked: false,
    category: "ellipse",
    zIndex: 2,
    page,
  };
}

/**
 * Closed polygon ornament (triangle / diamond / hexagon).
 *
 * Points stay normalized to the bounding box so resize scales the silhouette
 * without rewriting geometry. `shape` records the preset for inspector UX.
 *
 * @param {{ elementId: string, page?: number, shape?: "triangle"|"diamond"|"hexagon" }} opts
 * @returns {object}
 */
export function createPolygonElement({ elementId, page = 1, shape = "triangle" }) {
  const resolved = ["triangle", "diamond", "hexagon"].includes(shape) ? shape : "triangle";
  return {
    element_id: elementId,
    category: "polygon",
    shape: resolved,
    points: polygonPointsForShape(resolved),
    backgroundColor: "#24201E",
    borderWidth: 1.2,
    filled: false,
    left: 40,
    top: 40,
    width: resolved === "hexagon" ? 96 : 72,
    height: resolved === "hexagon" ? 84 : 72,
    isSelected: false,
    isMove: false,
    locked: false,
    zIndex: 2,
    page,
  };
}

/**
 * Open cubic-Bezier path ornament (wave / arc / flourish).
 *
 * Curves are cubic segments in unit-square space. Freeform selection exposes
 * draggable control-point handles; the box remains the move/resize frame.
 *
 * @param {{ elementId: string, page?: number, pathKind?: "wave"|"arc"|"flourish" }} opts
 * @returns {object}
 */
export function createPathElement({ elementId, page = 1, pathKind = "wave" }) {
  const resolved = ["wave", "arc", "flourish"].includes(pathKind) ? pathKind : "wave";
  return {
    element_id: elementId,
    category: "path",
    pathKind: resolved,
    curves: pathCurvesForKind(resolved),
    backgroundColor: "#24201E",
    borderWidth: 1.4,
    filled: false,
    left: 40,
    top: 60,
    width: resolved === "flourish" ? 140 : 180,
    height: resolved === "arc" ? 36 : 48,
    isSelected: false,
    isMove: false,
    locked: false,
    zIndex: 2,
    page,
  };
}

/**
 * Build a canvas image element from a gallery click or a stable content URL.
 *
 * Prefer `imgId` + API content URL over the display `src` (which may be a
 * short-lived blob URL after authenticated gallery loads).
 *
 * @param {{
 *   elementId: string,
 *   src: string,
 *   imgId?: string|number|null,
 *   naturalWidth?: number,
 *   naturalHeight?: number,
 *   page?: number,
 * }} opts
 * @returns {object}
 */
export function createImageElement({
  elementId,
  src,
  imgId = null,
  naturalWidth = 100,
  naturalHeight = 100,
  page = 1,
}) {
  const nw = Number(naturalWidth) || 100;
  const nh = Number(naturalHeight) || 100;
  return {
    element_id: elementId,
    src,
    width: 100,
    height: (nh / nw) * 100,
    left: 10,
    top: 10,
    isSelected: false,
    isMove: false,
    locked: false,
    category: "image",
    zIndex: 1,
    img_id: imgId,
    page,
  };
}

/**
 * @param {{ elementId: string, page?: number }} opts
 * @returns {object}
 */
export function createTextareaElement({ elementId, page = 1 }) {
  const fontSize = 14;
  const lineHeight = Math.round(fontSize * 1.4);
  const width = 260;
  return {
    element_id: elementId,
    content: "",
    fontSize,
    fontFamily: "Inter",
    color: "#000000",
    lineHeight,
    letterSpacing: 0,
    left: 20,
    top: 20,
    width,
    height: measureTextareaHeight("", width, fontSize, lineHeight),
    isSelected: true,
    isMove: false,
    locked: false,
    isEditing: true,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    bulletList: false,
    category: "textarea",
    zIndex: 4,
    page,
  };
}
