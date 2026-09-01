/**
 * Width contract for the element-properties inspector.
 *
 * The inspector keeps the compact 308 px footprint shown at the automatic
 * 200% text-edit zoom when the user views the document at 200% or less. Above
 * 200%, the enlarged A4 page may enter that space, so the inspector can shrink
 * to preserve the page gap. Viewport width remains a hard safety limit at
 * every zoom level; the compact mobile drawer is handled separately in CSS.
 */
export const EDITOR_INSPECTOR_FIXED_WIDTH_PX = 308;
export const EDITOR_INSPECTOR_REFLOW_ZOOM = 2;

/**
 * Resolve the inspector width without letting zoom-out enlarge the panel.
 *
 * @param {{
 *   zoom: number,
 *   exactDockWidth: number,
 *   availableWidth: number,
 *   minimumWidth?: number,
 * }} geometry - Live canvas geometry expressed in viewport pixels.
 * @returns {number} A viewport-safe width for the fixed inspector.
 */
export function resolveEditorInspectorWidth({
  zoom,
  exactDockWidth,
  availableWidth,
  minimumWidth = 120,
}) {
  const safeAvailableWidth = Math.max(0, Math.floor(Number(availableWidth) || 0));
  const fixedWidth = Math.min(EDITOR_INSPECTOR_FIXED_WIDTH_PX, safeAvailableWidth);

  if ((Number(zoom) || 0) <= EDITOR_INSPECTOR_REFLOW_ZOOM) {
    return fixedWidth;
  }

  // Only zoom levels above 200% may use the page edge to narrow the panel.
  // The fixed-width cap also prevents an unusually wide viewport from making
  // the inspector larger than the user-requested compact footprint.
  const safeMinimumWidth = Math.min(minimumWidth, safeAvailableWidth);
  const dockWidth = Math.max(safeMinimumWidth, Math.floor(Number(exactDockWidth) || 0));
  return Math.min(fixedWidth, dockWidth);
}
