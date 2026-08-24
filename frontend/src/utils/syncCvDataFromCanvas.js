/**
 * Keep the profile used for template regeneration aligned with direct canvas
 * text edits. Canvas geometry remains the source of truth for the current
 * layout; this utility only updates uniquely identifiable text values in the
 * normalized profile.
 *
 * Template generators split one profile into multiple canvas text elements.
 * Replacing a value only when its previous text occurs once in the profile
 * avoids silently changing two unrelated fields with the same wording.
 * Structural deletion is identified explicitly by `deletedRecord` tombstones,
 * so removing one freeform text box never removes its whole profile record.
 */

function cloneProfile(cvData) {
  return JSON.parse(JSON.stringify(cvData));
}

function countStringLeaves(value, target) {
  if (typeof value === "string") return value === target ? 1 : 0;
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countStringLeaves(item, target), 0);
  }
  if (!value || typeof value !== "object") return 0;
  return Object.values(value).reduce(
    (count, item) => count + countStringLeaves(item, target),
    0,
  );
}

function replaceUniqueString(value, from, to) {
  if (typeof value === "string") return value === from ? to : value;
  if (Array.isArray(value)) return value.map((item) => replaceUniqueString(item, from, to));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceUniqueString(item, from, to)]),
  );
}

function stringLeaves(value) {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringLeaves);
}

function profileTextForElement(element) {
  const content = String(element?.content ?? "").trim();
  if (!element?.bulletList) return content;

  // Template renderers add visual list markers while cv_data stores the plain
  // source sentence. Compare and persist the source form so an AI translation
  // of `• Polish text` can update `Polish text` in the profile.
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[•*–—-]\s*)+/, ""))
    .join("\n")
    .trim();
}

function pruneDeletedRecords(value, deletedTexts) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return true;
        }
        const leaves = stringLeaves(item);
        const matched = leaves.filter((leaf) => deletedTexts.has(leaf));
        return matched.length === 0;
      })
      .map((item) => pruneDeletedRecords(item, deletedTexts));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, pruneDeletedRecords(item, deletedTexts)]),
  );
}

function editableTextChanges(previousElements, nextElements) {
  const previousById = new Map(
    previousElements
      .filter((element) => element?.element_id)
      .map((element) => [element.element_id, element]),
  );

  return nextElements.flatMap((next) => {
    if (!next?.element_id || !["text", "textarea"].includes(next.category)) return [];
    const previous = previousById.get(next.element_id);
    if (!previous || previous.content === next.content) return [];
    const from = profileTextForElement(previous);
    const to = profileTextForElement(next);
    // An accepted AI shortening can intentionally clear a field. Ignoring an
    // empty `to` value would make the old profile text return on the next
    // template fill, even though the canvas correctly shows it removed.
    return from && from !== to ? [{ from, to }] : [];
  });
}

/**
 * Apply direct text edits to a normalized CV profile.
 *
 * @param {object|null} cvData - Current structured CV profile.
 * @param {object[]} previousElements - Canvas state before an edit.
 * @param {object[]} nextElements - Canvas state after an edit.
 * @param {object[]} deletedElements - Tombstones emitted by structural deletes.
 * @returns {object|null} The updated profile, or the original when no mapping exists.
 */
export function syncCvDataFromCanvas(
  cvData,
  previousElements,
  nextElements,
  deletedElements = [],
) {
  if (!cvData || !Array.isArray(previousElements) || !Array.isArray(nextElements)) {
    return cvData || null;
  }

  const markedRecordDeletes = deletedElements.filter((element) => element?.deletedRecord);
  const deletedTexts = new Set(
    deletedElements
      .filter((element) => element?.deletedRecord)
      .flatMap((element) => stringLeaves(element?.content))
      .map((text) => text.trim())
      .filter(Boolean),
  );
  let nextProfile = markedRecordDeletes.length > 0 && deletedTexts.size > 0
    ? pruneDeletedRecords(cvData, deletedTexts)
    : cvData;
  for (const { from, to } of editableTextChanges(previousElements, nextElements)) {
    if (countStringLeaves(nextProfile, from) !== 1) continue;
    if (nextProfile === cvData) nextProfile = cloneProfile(cvData);
    nextProfile = replaceUniqueString(nextProfile, from, to);
  }
  return nextProfile;
}
