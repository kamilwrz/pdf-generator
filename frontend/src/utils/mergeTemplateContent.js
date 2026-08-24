/**
 * Transfer the current canvas text into a freshly generated template.
 *
 * Template generation remains responsible for structure, labels, geometry,
 * and presentation. The existing canvas is the authoritative source for
 * editable body text because AI corrections can change rendered strings that
 * do not map one-to-one to a normalized `cv_data` leaf.
 */

function isTransferableText(element) {
  return (
    element
    && (element.category === "text" || element.category === "textarea")
    && !element.fixedToPage
    && (
      element.flowRole === "content"
      || element.contactChannel
      || element.mastheadRole
    )
    && element.flowRole !== "section-chrome"
    && element.flowRole !== "sidebar-chrome"
    && !element.isDecorativeChromeText
  );
}

function semanticKey(element) {
  if (element.contactChannel) return `contact:${element.contactChannel}`;
  if (element.mastheadRole) return `masthead:${element.mastheadRole}`;
  if (element.id) return `id:${element.id}`;
  return null;
}

function structuralBase(element) {
  // Positional fallback is safe only for ordinary body blocks. Masthead roles
  // must match by their explicit semantic key so a phone cannot occupy the
  // name slot when two templates order their headers differently.
  return [
    element.category,
    element.flowRole,
    element.flowLane || "main",
  ].join("|");
}

function contentSlots(elements) {
  const groupCounters = new Map();
  const memberCounters = new Map();
  return elements.map((element) => {
    const base = structuralBase(element);
    const groupId = element.flowGroup || "ungrouped";
    const groupKey = `${base}|${groupId}`;
    if (!memberCounters.has(groupKey)) memberCounters.set(groupKey, 0);
    const memberIndex = memberCounters.get(groupKey);
    memberCounters.set(groupKey, memberIndex + 1);
    if (!groupCounters.has(base)) groupCounters.set(base, new Map());
    const groups = groupCounters.get(base);
    if (!groups.has(groupId)) groups.set(groupId, groups.size);
    return {
      element,
      slotKey: `${base}|${groups.get(groupId)}|${memberIndex}`,
    };
  });
}

/**
 * Preserve the current editable text while applying target-template styles.
 *
 * @param {object[]} currentElements - Elements currently visible in the editor.
 * @param {object[]} generatedElements - Elements returned by the target fill.
 * @returns {object[]} Generated elements with matched content and inline runs.
 */
export function mergeTemplateContent(currentElements, generatedElements) {
  const currentText = (currentElements || []).filter(isTransferableText);
  const used = new Set();
  const bySemantic = new Map();
  const byStructural = new Map();

  for (const { element, slotKey } of contentSlots(currentText)) {
    const semantic = semanticKey(element);
    if (semantic) {
      const candidates = bySemantic.get(semantic) || [];
      candidates.push(element);
      bySemantic.set(semantic, candidates);
    }
    byStructural.set(slotKey, element);
  }

  const generatedText = (generatedElements || []).filter(isTransferableText);
  const generatedSlots = new Map(
    contentSlots(generatedText).map(({ element, slotKey }) => [element, slotKey]),
  );

  return (generatedElements || []).map((generated) => {
    if (!isTransferableText(generated)) return generated;

    const semanticCandidates = semanticKey(generated)
      ? (bySemantic.get(semanticKey(generated)) || [])
      : [];
    const structuralCandidate = generated.flowRole === "content"
      ? byStructural.get(generatedSlots.get(generated))
      : null;
    const candidates = semanticCandidates.length === 1
      ? semanticCandidates
      : structuralCandidate ? [structuralCandidate] : [];
    const match = candidates.find((candidate) => !used.has(candidate.element_id));
    if (!match) return generated;

    used.add(match.element_id);
    return {
      ...generated,
      content: match.content,
      ...(match.runs !== undefined ? { runs: match.runs } : {}),
    };
  });
}
