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
    && element.flowRole !== "section-chrome"
    && element.flowRole !== "sidebar-chrome"
    && !element.isDecorativeChromeText
  );
}

function semanticKey(element) {
  if (element.id) return `id:${element.id}`;
  if (element.contactChannel) return `contact:${element.contactChannel}`;
  if (element.mastheadRole) return `masthead:${element.mastheadRole}`;
  return null;
}

function structuralKey(element) {
  return [
    element.category,
    element.flowRole || "content",
    element.flowLane || "main",
    element.flowGroup || "ungrouped",
  ].join("|");
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

  for (const element of currentText) {
    const semantic = semanticKey(element);
    if (semantic) {
      const candidates = bySemantic.get(semantic) || [];
      candidates.push(element);
      bySemantic.set(semantic, candidates);
    }
    const structural = structuralKey(element);
    const candidates = byStructural.get(structural) || [];
    candidates.push(element);
    byStructural.set(structural, candidates);
  }

  return (generatedElements || []).map((generated) => {
    if (!isTransferableText(generated)) return generated;

    const semanticCandidates = semanticKey(generated)
      ? (bySemantic.get(semanticKey(generated)) || [])
      : [];
    const structuralCandidates = byStructural.get(structuralKey(generated)) || [];
    const candidates = semanticCandidates.length === 1
      ? semanticCandidates
      : structuralCandidates;
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
