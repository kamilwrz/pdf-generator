/**
 * Group drag clamping and cross-page moves for canvas selections.
 *
 * Locked elements never move. Crossing pages drops connectors whose endpoints
 * would land on different pages (PDF cannot draw those).
 */
import { getElementBounds } from "./elementBounds.js";
import { crossPageConnectorIds } from "./pageSpread.js";

// Clamp a shared group delta so relative distances never change and no member
// can leave the page.
export function getClampedMoveDelta(elements, elementIds, deltaX, deltaY, pageSize) {
  const movable = elements.filter((element) => (
    elementIds.has(element.element_id)
    && !element.locked
    && Number.isFinite(Number(element.left))
    && Number.isFinite(Number(element.top))
  ));
  if (movable.length === 0) return { movable, deltaX: 0, deltaY: 0 };

  let minX = -Infinity;
  let maxX = Infinity;
  let minY = -Infinity;
  let maxY = Infinity;

  movable.forEach((element) => {
    const { width, height } = getElementBounds(element);
    const left = Number(element.left);
    const top = Number(element.top);
    minX = Math.max(minX, -left);
    maxX = Math.min(maxX, pageSize.width - left - width);
    minY = Math.max(minY, -top);
    maxY = Math.min(maxY, pageSize.height - top - height);
  });

  const safeDeltaX = minX > maxX
    ? 0
    : Math.min(Math.max(deltaX, minX), maxX);
  const safeDeltaY = minY > maxY
    ? 0
    : Math.min(Math.max(deltaY, minY), maxY);

  return { movable, deltaX: safeDeltaX, deltaY: safeDeltaY };
}

export function moveElementsByDelta(elements, elementIds, deltaX, deltaY, pageSize) {
  const { movable, deltaX: safeDeltaX, deltaY: safeDeltaY } = getClampedMoveDelta(
    elements, elementIds, deltaX, deltaY, pageSize,
  );
  if (movable.length === 0 || (safeDeltaX === 0 && safeDeltaY === 0)) return elements;

  return elements.map((element) => (
    elementIds.has(element.element_id)
      && Number.isFinite(Number(element.left))
      && Number.isFinite(Number(element.top))
      ? {
          ...element,
          left: Number(element.left) + safeDeltaX,
          top: Number(element.top) + safeDeltaY,
        }
      : element
  ));
}

// Move a page-local selection into a resolved page canvas. Coordinates remain
// local to the target page and are clamped with the same rules as a normal drag.
export function moveElementsToPage(elements, elementIds, deltaX, deltaY, targetPage, pageSize) {
  const { movable, deltaX: safeDeltaX, deltaY: safeDeltaY } = getClampedMoveDelta(
    elements, elementIds, deltaX, deltaY, pageSize,
  );
  if (movable.length === 0) {
    return { elements, deltaX: 0, deltaY: 0, removedConnectorIds: [] };
  }

  const movableIds = new Set(movable.map((element) => element.element_id));
  const positioned = elements.map((element) => (
    movableIds.has(element.element_id)
      ? {
          ...element,
          left: Number(element.left) + safeDeltaX,
          top: Number(element.top) + safeDeltaY,
          page: targetPage,
        }
      : element
  ));
  const byId = new Map(positioned.map((element) => [element.element_id, element]));
  const moved = positioned.map((element) => {
    if (element.category !== "connector") return element;
    const source = byId.get(element.source_id);
    const target = byId.get(element.target_id);
    if (source && target && (source.page ?? 1) === (target.page ?? 1)) {
      return { ...element, page: source.page ?? 1 };
    }
    return element;
  });
  const removedConnectorIds = crossPageConnectorIds(moved);
  return {
    elements: removedConnectorIds.length > 0
      ? moved.filter((element) => !removedConnectorIds.includes(element.element_id))
      : moved,
    deltaX: safeDeltaX,
    deltaY: safeDeltaY,
    removedConnectorIds,
  };
}
