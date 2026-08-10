/**
 * Freeform geometric ornaments shared by canvas, factories, and tests.
 *
 * Coordinates inside `points` / `curves` are normalized to the element box
 * (0..1 on both axes). Resizing the bounding box therefore scales the shape
 * without rewriting the authored geometry. Absolute canvas pixels are derived
 * at render time from `left/top/width/height`.
 *
 * Bezier paths use cubic segments (`C`) so canvas SVG and ReportLab `curveTo`
 * stay in lockstep. Control-point editing mutates the normalized curves in
 * place; the bounding box remains the resize/move frame.
 */

/** @typedef {[number, number]} Point2 */

/** Closed polygon presets authored as unit-square points. */
export const POLYGON_PRESETS = Object.freeze({
  triangle: Object.freeze([
    [0.5, 0.06],
    [0.94, 0.92],
    [0.06, 0.92],
  ]),
  diamond: Object.freeze([
    [0.5, 0.04],
    [0.96, 0.5],
    [0.5, 0.96],
    [0.04, 0.5],
  ]),
  hexagon: Object.freeze([
    [0.25, 0.08],
    [0.75, 0.08],
    [0.98, 0.5],
    [0.75, 0.92],
    [0.25, 0.92],
    [0.02, 0.5],
  ]),
});

/**
 * Open cubic Bezier ornaments. Each curve after the initial move is a cubic
 * with control points and an end point, all in unit-square space.
 */
export const PATH_PRESETS = Object.freeze({
  // Soft double-wave hairline — classic CV flourish under a name or section.
  wave: Object.freeze([
    Object.freeze({ type: "M", x: 0.02, y: 0.55 }),
    Object.freeze({ type: "C", x1: 0.18, y1: 0.1, x2: 0.32, y2: 1.0, x: 0.5, y: 0.55 }),
    Object.freeze({ type: "C", x1: 0.68, y1: 0.1, x2: 0.82, y2: 1.0, x: 0.98, y: 0.55 }),
  ]),
  // Single gentle arc — useful as a name underline or photo accent.
  arc: Object.freeze([
    Object.freeze({ type: "M", x: 0.04, y: 0.78 }),
    Object.freeze({ type: "C", x1: 0.28, y1: 0.08, x2: 0.72, y2: 0.08, x: 0.96, y: 0.78 }),
  ]),
  // Short calligraphic flourish with an overshoot on the right.
  flourish: Object.freeze([
    Object.freeze({ type: "M", x: 0.05, y: 0.7 }),
    Object.freeze({ type: "C", x1: 0.22, y1: 0.15, x2: 0.4, y2: 0.95, x: 0.58, y: 0.45 }),
    Object.freeze({ type: "C", x1: 0.72, y1: 0.1, x2: 0.86, y2: 0.2, x: 0.95, y: 0.55 }),
  ]),
});

/**
 * @param {string} shape
 * @returns {Point2[]}
 */
export function polygonPointsForShape(shape) {
  const key = String(shape || "").trim();
  const points = POLYGON_PRESETS[key];
  if (!points) return POLYGON_PRESETS.triangle.map((point) => [...point]);
  return points.map((point) => [...point]);
}

/**
 * @param {string} pathKind
 * @returns {object[]}
 */
export function pathCurvesForKind(pathKind) {
  const key = String(pathKind || "").trim();
  const curves = PATH_PRESETS[key];
  if (!curves) {
    return PATH_PRESETS.wave.map((segment) => ({ ...segment }));
  }
  return curves.map((segment) => ({ ...segment }));
}

/**
 * Build an SVG path `d` string from normalized curves and a pixel box.
 *
 * @param {object[]} curves
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function curvesToSvgPath(curves, width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const parts = [];
  for (const segment of curves || []) {
    if (!segment) continue;
    if (segment.type === "M") {
      parts.push(`M ${Number(segment.x) * w} ${Number(segment.y) * h}`);
      continue;
    }
    if (segment.type === "C") {
      parts.push(
        `C ${Number(segment.x1) * w} ${Number(segment.y1) * h}`
        + ` ${Number(segment.x2) * w} ${Number(segment.y2) * h}`
        + ` ${Number(segment.x) * w} ${Number(segment.y) * h}`,
      );
    }
  }
  return parts.join(" ");
}

/**
 * Build an SVG polygon `points` attribute from normalized vertices.
 *
 * @param {Point2[]} points
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function polygonToSvgPoints(points, width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  return (points || [])
    .map(([x, y]) => `${Number(x) * w},${Number(y) * h}`)
    .join(" ");
}

/**
 * Absolute canvas handles for every editable Bezier control / end point.
 *
 * Returned items carry enough metadata for a drag handler to rewrite the
 * matching normalized curve field without scanning the whole path again.
 *
 * @param {object} element
 * @returns {{ id: string, left: number, top: number, curveIndex: number, role: string, kind: "anchor"|"control" }[]}
 */
export function listPathControlHandles(element) {
  const left = Number(element?.left) || 0;
  const top = Number(element?.top) || 0;
  const width = Math.max(1, Number(element?.width) || 1);
  const height = Math.max(1, Number(element?.height) || 1);
  const curves = Array.isArray(element?.curves) ? element.curves : [];
  const handles = [];

  curves.forEach((segment, curveIndex) => {
    if (!segment) return;
    if (segment.type === "M") {
      handles.push({
        id: `${curveIndex}:anchor`,
        curveIndex,
        role: "anchor",
        kind: "anchor",
        left: left + Number(segment.x) * width,
        top: top + Number(segment.y) * height,
      });
      return;
    }
    if (segment.type === "C") {
      handles.push(
        {
          id: `${curveIndex}:c1`,
          curveIndex,
          role: "c1",
          kind: "control",
          left: left + Number(segment.x1) * width,
          top: top + Number(segment.y1) * height,
        },
        {
          id: `${curveIndex}:c2`,
          curveIndex,
          role: "c2",
          kind: "control",
          left: left + Number(segment.x2) * width,
          top: top + Number(segment.y2) * height,
        },
        {
          id: `${curveIndex}:anchor`,
          curveIndex,
          role: "anchor",
          kind: "anchor",
          left: left + Number(segment.x) * width,
          top: top + Number(segment.y) * height,
        },
      );
    }
  });

  return handles;
}

/**
 * Move one Bezier handle. Coordinates are absolute canvas pixels; the helper
 * writes normalized values back into a shallow-cloned curves array.
 *
 * @param {object} element
 * @param {{ curveIndex: number, role: string }} handle
 * @param {number} absoluteLeft
 * @param {number} absoluteTop
 * @returns {object[]}
 */
export function movePathHandle(element, handle, absoluteLeft, absoluteTop) {
  const width = Math.max(1, Number(element?.width) || 1);
  const height = Math.max(1, Number(element?.height) || 1);
  const boxLeft = Number(element?.left) || 0;
  const boxTop = Number(element?.top) || 0;
  const nx = Math.min(1.15, Math.max(-0.15, (absoluteLeft - boxLeft) / width));
  const ny = Math.min(1.15, Math.max(-0.15, (absoluteTop - boxTop) / height));
  const curves = (Array.isArray(element?.curves) ? element.curves : []).map((segment) => ({ ...segment }));
  const segment = curves[handle.curveIndex];
  if (!segment) return curves;

  if (handle.role === "anchor") {
    segment.x = nx;
    segment.y = ny;
  } else if (handle.role === "c1") {
    segment.x1 = nx;
    segment.y1 = ny;
  } else if (handle.role === "c2") {
    segment.x2 = nx;
    segment.y2 = ny;
  }
  curves[handle.curveIndex] = segment;
  return curves;
}
