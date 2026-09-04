/** Minimum readable exposure for each successful save or download stage. */
export const OPERATION_PROGRESS_STAGE_MIN_MS = 1_200;

/**
 * Resolve when the next operation stage may become visible.
 *
 * A stage waits for both its real operation boundary and the previous stage's
 * minimum reading time. The presentation timer never delays the network work
 * and can never announce a boundary before the boundary actually exists.
 *
 * @param {number} previousStageStartedAt - Timestamp when the prior stage appeared.
 * @param {number} operationBoundaryAt - Timestamp when the real next phase became ready.
 * @returns {number} Earliest timestamp at which the next stage may be shown.
 */
export function nextOperationProgressStageAt(previousStageStartedAt, operationBoundaryAt) {
  return Math.max(
    operationBoundaryAt,
    previousStageStartedAt + OPERATION_PROGRESS_STAGE_MIN_MS,
  );
}

/**
 * Keep the final successful state readable before dismissing the modal.
 *
 * @param {number} finalStageShownAt - Timestamp when the final stage became visible.
 * @returns {number} Earliest safe dismissal timestamp.
 */
export function operationProgressDismissAt(finalStageShownAt) {
  return finalStageShownAt + OPERATION_PROGRESS_STAGE_MIN_MS;
}
