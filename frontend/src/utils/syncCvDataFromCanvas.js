/**
 * Keep the profile used for template regeneration aligned with direct canvas
 * text edits. Canvas geometry remains the source of truth for the current
 * layout; this utility only updates uniquely identifiable text values in the
 * normalized profile.
 *
 * Template generators split one profile into multiple canvas text elements.
 * Replacing a value only when its previous text occurs once in the profile
 * avoids silently changing two unrelated fields with the same wording.
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
    const from = String(previous.content ?? "").trim();
    const to = String(next.content ?? "").trim();
    return from && to && from !== to ? [{ from, to }] : [];
  });
}

/**
 * Apply direct text edits to a normalized CV profile.
 *
 * @param {object|null} cvData - Current structured CV profile.
 * @param {object[]} previousElements - Canvas state before an edit.
 * @param {object[]} nextElements - Canvas state after an edit.
 * @returns {object|null} The original profile when no unambiguous mapping exists.
 */
export function syncCvDataFromCanvas(cvData, previousElements, nextElements) {
  if (!cvData || !Array.isArray(previousElements) || !Array.isArray(nextElements)) {
    return cvData || null;
  }

  let nextProfile = cvData;
  for (const { from, to } of editableTextChanges(previousElements, nextElements)) {
    if (countStringLeaves(nextProfile, from) !== 1) continue;
    if (nextProfile === cvData) nextProfile = cloneProfile(cvData);
    nextProfile = replaceUniqueString(nextProfile, from, to);
  }
  return nextProfile;
}
