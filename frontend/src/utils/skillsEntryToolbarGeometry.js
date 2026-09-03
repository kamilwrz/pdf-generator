/** Screen-space gap between the final chip row and its compact add control. */
export const SKILL_CHIP_ACTION_GAP_SCREEN_PX = 8;

/** Screen-space gap retained when the compact plus expands into its form. */
export const SKILL_FORM_OFFSET_SCREEN_PX = 18;

/**
 * Resolve the page-local top coordinate for the Skills entry toolbar.
 *
 * Inline and bullet controls straddle the textarea bottom through the visual
 * centre of the plus button. Chips use an explicit 8px gap, while the larger
 * form remains clear of authored content. Layout values are already inverse-
 * scaled; screen-only offsets are divided by zoom here for the same reason.
 *
 * @param {{bottom:number,mode:string,formOpen:boolean,zoom:number,layout:object}} options
 * @returns {number}
 */
export function resolveSkillsEntryToolbarTop({
  bottom,
  mode,
  formOpen,
  zoom,
  layout,
}) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  const safeBottom = Number(bottom) || 0;
  if (formOpen) return safeBottom + SKILL_FORM_OFFSET_SCREEN_PX / safeZoom;
  if (mode === "chips") return safeBottom + SKILL_CHIP_ACTION_GAP_SCREEN_PX / safeZoom;
  return safeBottom - (
    Number(layout?.buttonSize || 0) / 2
    + Number(layout?.gap || 0)
    + Number(layout?.borderWidth || 0)
  );
}
