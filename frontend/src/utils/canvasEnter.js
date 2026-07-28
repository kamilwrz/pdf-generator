/** IDs of canvas elements that should fade in on next paint (add / clone). */
const pendingEnterIds = new Set();

export const CANVAS_ENTER_MS = 280;

/** Mark one or more newly created element ids for enter animation. */
export function markElementsEnter(ids) {
  if (!ids) return;
  const list = Array.isArray(ids) ? ids : [ids];
  for (const id of list) {
    if (id != null) pendingEnterIds.add(id);
  }
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
