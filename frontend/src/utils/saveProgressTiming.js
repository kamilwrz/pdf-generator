/** Minimum readable exposure for each successful save stage. */
export const SAVE_PROGRESS_STAGE_MIN_MS = 800;

/**
 * Resolve when a save stage may become visible.
 *
 * A stage waits for both conditions: its real operation boundary and the
 * previous stage's minimum reading time. This keeps fast saves legible without
 * ever announcing persistence or confirmation before it actually happened.
 *
 * @param {number} previousStageStartedAt - Timestamp when the prior stage appeared.
 * @param {number} operationBoundaryAt - Timestamp when the real next phase became ready.
 * @returns {number} Earliest timestamp at which the next stage may be shown.
 */
export function nextSaveProgressStageAt(previousStageStartedAt, operationBoundaryAt) {
  return Math.max(
    operationBoundaryAt,
    previousStageStartedAt + SAVE_PROGRESS_STAGE_MIN_MS,
  );
}

/**
 * Keep the confirmed state readable before dismissing a successful save.
 *
 * @param {number} confirmationShownAt - Timestamp when confirmation became visible.
 * @returns {number} Earliest safe dismissal timestamp.
 */
export function saveProgressDismissAt(confirmationShownAt) {
  return confirmationShownAt + SAVE_PROGRESS_STAGE_MIN_MS;
}
