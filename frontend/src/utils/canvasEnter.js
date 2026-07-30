/**
 * Canvas enter-fade registry.
 *
 * Newly created / freshly loaded content elements are marked here so the
 * canvas can hold them at opacity 0 until fonts settle, then fade 0→1.
 * Decorative chrome (`fixedToPage`) is never marked — it appears immediately.
 */

const pendingEnterIds = new Set();

/** Opacity fade duration after fonts are ready (or the font wait caps out). */
export const CANVAS_ENTER_MS = 750;

/**
 * Max time to wait for `document.fonts.ready` before starting the fade anyway.
 * Long enough to cover typical webfont swaps on CV load / wizard finish.
 */
export const CANVAS_ENTER_FONT_WAIT_MS = 1000;

/** Mark one or more newly created element ids for enter animation. */
export function markElementsEnter(ids) {
  if (!ids) return;
  const list = Array.isArray(ids) ? ids : [ids];
  for (const id of list) {
    if (id != null) pendingEnterIds.add(id);
  }
}

/**
 * Mark interactive content for enter fade; skip decorative chrome and connectors.
 * Used when a full document lands on the canvas (AI upload, bio wizard, template).
 */
export function markContentElementsEnter(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return;
  markElementsEnter(
    elements
      .filter((element) => (
        element
        && element.element_id != null
        && !element.fixedToPage
        && element.category !== "connector"
      ))
      .map((element) => element.element_id),
  );
}

/** Which of `candidateIds` are still waiting to animate. */
export function takeEnteringIds(candidateIds) {
  const out = [];
  for (const id of candidateIds) {
    if (pendingEnterIds.has(id)) out.push(id);
  }
  return out;
}

export function clearEnteringIds(ids) {
  for (const id of ids) pendingEnterIds.delete(id);
}
