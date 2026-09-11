export const GOOGLE_BUTTON_BASE_HEIGHT = 40;

const GOOGLE_BUTTON_MIN_WIDTH = 200;
const GOOGLE_BUTTON_MAX_WIDTH = 400;
const GOOGLE_BUTTON_MIN_SCALE = 1.1;
const GOOGLE_BUTTON_MAX_SCALE = 1.2;

/**
 * Resolve a provider-supported base width and a proportional visual scale.
 *
 * Google caps its rendered control at 400 px. Scaling the complete control,
 * rather than stretching one axis, lets it fill CV Studio's wider form column
 * without distorting the Google mark. Narrow surfaces keep the same rule while
 * remaining inside their available width.
 *
 * @param {number} availableWidth - Width of the host surface in CSS pixels.
 * @returns {{ providerWidth: number, scale: number, renderedHeight: number }}
 * Geometry used by the provider container and its clipping frame.
 */
export function resolveGoogleButtonGeometry(availableWidth) {
  const safeWidth = Number.isFinite(availableWidth) && availableWidth > 0
    ? availableWidth
    : GOOGLE_BUTTON_MAX_WIDTH;
  const preferredScale = Math.min(
    GOOGLE_BUTTON_MAX_SCALE,
    Math.max(GOOGLE_BUTTON_MIN_SCALE, safeWidth / GOOGLE_BUTTON_MAX_WIDTH),
  );
  const providerWidth = Math.min(
    GOOGLE_BUTTON_MAX_WIDTH,
    Math.max(GOOGLE_BUTTON_MIN_WIDTH, Math.floor(safeWidth / preferredScale)),
  );
  const scale = Math.min(GOOGLE_BUTTON_MAX_SCALE, safeWidth / providerWidth);

  return {
    providerWidth,
    scale,
    renderedHeight: GOOGLE_BUTTON_BASE_HEIGHT * scale,
  };
}
