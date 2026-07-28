/** Delay before text/textarea long-press shows spacing distance guides (ms). */
export const TEXT_SPACING_HOLD_MS = 1200;

/**
 * Start (or restart) a long-press timer that reveals spacing guides for a
 * text element. Call from pointerdown while not editing.
 */
export function startTextSpacingHold({
  timerRef,
  elementId,
  setSpacingHoldId,
  delayMs = TEXT_SPACING_HOLD_MS,
}) {
  clearTextSpacingHoldTimer(timerRef);
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    setSpacingHoldId(elementId);
  }, delayMs);
}

/** Cancel the pending timer only (does not clear an already-visible hold). */
export function clearTextSpacingHoldTimer(timerRef) {
  if (timerRef?.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

/**
 * Cancel timer and clear spacing-hold focus for this element (pointer up /
 * cancel / drag start).
 */
export function endTextSpacingHold({ timerRef, elementId, setSpacingHoldId }) {
  clearTextSpacingHoldTimer(timerRef);
  setSpacingHoldId((prev) => (prev === elementId ? null : prev));
}
