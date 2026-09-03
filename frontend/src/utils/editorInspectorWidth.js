/**
 * Width contract for the element-properties inspector.
 *
 * The explicitly opened inspector prefers a compact 272 px desktop footprint. The live A4 edge and
 * viewport are hard safety limits at every zoom, so a narrower workspace
 * shrinks the panel instead of allowing it to cover the document. The compact
 * mobile drawer is handled separately in CSS.
 */
export const EDITOR_INSPECTOR_FIXED_WIDTH_PX = 272;

/**
 * Resolve the inspector width without letting zoom-out enlarge the panel.
 *
 * @param {{
 *   exactDockWidth: number,
 *   availableWidth: number,
 *   minimumWidth?: number,
 * }} geometry - Live canvas geometry expressed in viewport pixels.
 * @returns {number} A viewport-safe width for the fixed inspector.
 */
export function resolveEditorInspectorWidth({
  exactDockWidth,
  availableWidth,
  minimumWidth = 120,
}) {
  const safeAvailableWidth = Math.max(0, Math.floor(Number(availableWidth) || 0));
  const fixedWidth = Math.min(EDITOR_INSPECTOR_FIXED_WIDTH_PX, safeAvailableWidth);
  const safeMinimumWidth = Math.min(minimumWidth, safeAvailableWidth);
  const dockWidth = Math.max(safeMinimumWidth, Math.floor(Number(exactDockWidth) || 0));

  // The preferred-width cap prevents a wide viewport from enlarging the form,
  // while the live dock cap preserves the A4 gap whenever usable space exists.
  return Math.min(fixedWidth, dockWidth);
}
