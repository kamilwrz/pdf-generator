/** Screen-space gap retained when the compact plus expands into its form. */
export const SKILL_FORM_OFFSET_SCREEN_PX = 18;

/**
 * Resolve the page-local top coordinate for the Skills entry toolbar.
 *
 * The compact plus straddles the authored content bottom through its visual
 * centre in inline, bullet, and chip modes. The larger form remains clear of
 * authored content. Layout values are already inverse-scaled; screen-only
 * offsets are divided by zoom here for the same reason.
 *
 * @param {{bottom:number,formOpen:boolean,zoom:number,layout:object}} options
 * @returns {number}
 */
export function resolveSkillsEntryToolbarTop({
  bottom,
  formOpen,
  zoom,
  layout,
}) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  const safeBottom = Number(bottom) || 0;
  if (formOpen) return safeBottom + SKILL_FORM_OFFSET_SCREEN_PX / safeZoom;
  return safeBottom - (
    Number(layout?.buttonSize || 0) / 2
    + Number(layout?.gap || 0)
    + Number(layout?.borderWidth || 0)
  );
}
