/**
 * Pure undo/redo stack transitions for the A4 document history.
 *
 * Extracted from `useDocumentHistory` so the recording rules can be reasoned
 * about and unit-tested without React. A history state is `{ stack, index }`
 * where `stack` is an ordered list of snapshots and `index` points at the
 * currently displayed snapshot. Entries after `index` are the "redo tail".
 *
 * Two kinds of records exist:
 *
 * - **Real change** (a user edit): pushes a new snapshot after `index` and
 *   discards the redo tail — the normal branch of any undo/redo stack.
 * - **Quiet settle** (a load/reflow adjustment that must not become its own
 *   undo step): refreshes the current tip in place and MUST preserve the redo
 *   tail. Truncating on a quiet settle was the bug that made redo unusable:
 *   `applySnapshot` marks history quiet and re-renders, which fires a quiet
 *   record while `index < stack.length - 1`, silently deleting every redo
 *   entry.
 */

/**
 * Structural equality of two snapshots. Snapshots are plain JSON (elements +
 * page count with volatile UI flags already stripped), so a stable stringify is
 * sufficient and keeps parity with the previous inline comparison.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Fold a new snapshot into the history state.
 *
 * @param {{ stack: object[], index: number }} state - Current history state.
 * @param {object} snapshot - New snapshot to record.
 * @param {object} [options]
 * @param {boolean} [options.quiet=false] - When true, refresh the current tip
 *   in place and preserve the redo tail (load/reflow settle). When false, push
 *   a new step and drop the redo tail (a real edit).
 * @param {number} [options.limit=100] - Maximum stack length; oldest entries
 *   are dropped once a push would exceed it.
 * @returns {{ stack: object[], index: number }} The next history state. Returns
 *   the same reference when a non-quiet record is a no-op (unchanged snapshot),
 *   so callers can skip redundant flag syncs if they wish.
 */
export function recordSnapshotState(state, snapshot, { quiet = false, limit = 100 } = {}) {
  const { stack, index } = state;

  if (quiet) {
    // No baseline yet (fresh document / just reset): seed the stack.
    if (index < 0 || stack.length === 0) {
      return { stack: [snapshot], index: 0 };
    }
    // Refresh the tip in place. Copy the WHOLE stack — including entries after
    // `index` — so a settle that lands after an undo cannot wipe out redo.
    const nextStack = stack.slice();
    nextStack[index] = snapshot;
    return { stack: nextStack, index };
  }

  // Ignore records that do not change document content (e.g. selection-only
  // churn) so they never consume an undo step.
  const current = stack[index];
  if (current && snapshotsEqual(current, snapshot)) return state;

  // A real edit invalidates any redo tail: keep everything up to and including
  // the current index, then append the new snapshot.
  const next = stack.slice(0, index + 1);
  next.push(snapshot);
  const overflow = next.length - limit;
  const capped = overflow > 0 ? next.slice(overflow) : next;
  return { stack: capped, index: capped.length - 1 };
}
