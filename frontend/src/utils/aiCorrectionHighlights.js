/**
 * Collect canvas element ids that still have a pending AI suggestion.
 *
 * Covers every assistant review category:
 * - content / style patches (`corrections`)
 * - layout moves (`layout_groups`)
 * - section rebuilds (`structure_groups`)
 * - deletions (`deletion_groups`)
 * - clones (`clone_groups`)
 *
 * Accepted / rejected items drop out. Preview-active groups stay highlighted so
 * the user can still see which elements the active suggestion touches.
 */

/** @typedef {"content"|"style"|"layout"|"structure"|"deletion"|"clone"} AiHighlightKind */

const KIND_PRIORITY = Object.freeze({
  deletion: 5,
  content: 4,
  style: 3,
  layout: 2,
  structure: 2,
  clone: 1,
});

const ACTIVE_GROUP_STATES = new Set(["pending", "preview"]);

/**
 * @param {string|null|undefined} id
 * @param {AiHighlightKind} kind
 * @param {Map<string, AiHighlightKind>} into
 */
function addHighlight(id, kind, into) {
  if (id == null || id === "") return;
  const key = String(id);
  const prev = into.get(key);
  if (!prev || KIND_PRIORITY[kind] > KIND_PRIORITY[prev]) {
    into.set(key, kind);
  }
}

/**
 * @param {object} patch
 * @returns {AiHighlightKind}
 */
function kindForContentPatch(patch) {
  if (!patch || typeof patch !== "object") return "style";
  return Object.prototype.hasOwnProperty.call(patch, "content") ? "content" : "style";
}

/**
 * @param {object} group
 * @param {AiHighlightKind} kind
 * @param {Map<string, AiHighlightKind>} into
 */
function addGroupElementIds(group, kind, into) {
  if (!group || typeof group !== "object") return;
  for (const patch of group.patches || []) {
    addHighlight(patch?.element_id, kind, into);
  }
  for (const id of group.remove_element_ids || []) {
    addHighlight(id, kind === "structure" ? "structure" : kind, into);
  }
  if (group.source_element_id) {
    addHighlight(group.source_element_id, kind, into);
  }
  // Clone / structure previews may already place temporary additions on canvas.
  for (const el of group.add_elements || []) {
    addHighlight(el?.element_id, kind, into);
  }
}

/**
 * @param {object} options
 * @param {Array<object>} options.messages
 * @param {Record<string, string>} [options.correctionStates]
 * @param {Record<string, string>} [options.layoutStates]
 * @param {Record<string, string>} [options.structureStates]
 * @param {Record<string, string>} [options.deletionStates]
 * @param {Record<string, string>} [options.cloneStates]
 * @returns {Array<{ elementId: string, kind: AiHighlightKind }>}
 */
export function collectPendingAiHighlights({
  messages,
  correctionStates = {},
  layoutStates = {},
  structureStates = {},
  deletionStates = {},
  cloneStates = {},
} = {}) {
  const into = new Map();
  if (!Array.isArray(messages)) return [];

  for (const msg of messages) {
    if (!msg || msg.role === "user") continue;
    const msgId = msg.id;
    if (msgId == null) continue;

    for (const patch of msg.corrections || []) {
      if (!patch?.element_id) continue;
      const state = correctionStates[`${msgId}_${patch.element_id}`] || "pending";
      if (state !== "pending") continue;
      addHighlight(patch.element_id, kindForContentPatch(patch), into);
    }

    for (const group of msg.layout_groups || []) {
      const state = layoutStates[`${msgId}_${group.id}`] || "pending";
      if (!ACTIVE_GROUP_STATES.has(state)) continue;
      addGroupElementIds(group, "layout", into);
    }

    for (const group of msg.structure_groups || []) {
      const state = structureStates[`${msgId}_${group.id}`] || "pending";
      if (!ACTIVE_GROUP_STATES.has(state)) continue;
      addGroupElementIds(group, "structure", into);
    }

    for (const group of msg.deletion_groups || []) {
      const state = deletionStates[`${msgId}_${group.id}`] || "pending";
      if (!ACTIVE_GROUP_STATES.has(state)) continue;
      addGroupElementIds(group, "deletion", into);
    }

    for (const group of msg.clone_groups || []) {
      const state = cloneStates[`${msgId}_${group.id}`] || "pending";
      if (!ACTIVE_GROUP_STATES.has(state)) continue;
      addGroupElementIds(group, "clone", into);
    }
  }

  return [...into.entries()].map(([elementId, kind]) => ({ elementId, kind }));
}
