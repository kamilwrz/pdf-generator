/**
 * Reconcile user presentation edits with a freshly generated template.
 *
 * The target template owns geometry, flow metadata, and decorative chrome.
 * The current canvas owns editable presentation values such as typography and
 * text color. Matching is conservative because flowGroup values are generated
 * per fill and cannot identify the same record across templates.
 */

const PRESERVED_STYLE_FIELDS = [
  "color",
  "fontFamily",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "bold",
  "italic",
  "underline",
  "align",
  "textTransform",
];

function normalizedContent(value) {
  // Collapse editor whitespace so matching is unaffected by renderer-specific
  // line breaks while preserving the actual content stored on the target.
  return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function isEditableElement(element) {
  return (
    element
    && (element.category === "text" || element.category === "textarea")
    && !element.fixedToPage
    && !element.isDecorativeChromeText
  );
}

function semanticKey(element) {
  if (element.mastheadRole) return `masthead:${element.mastheadRole}`;
  if (element.contactChannel) return `contact:${element.contactChannel}`;
  if (element.id && !String(element.id).includes("record-")) return `id:${element.id}`;
  return null;
}

function roleKey(element) {
  return [
    element.category,
    element.flowRole || "content",
    element.flowLane || "main",
    normalizedContent(element.content),
  ].join("|");
}

function copyStyles(previous, next) {
  const merged = { ...next };
  for (const field of PRESERVED_STYLE_FIELDS) {
    if (previous[field] !== undefined && previous[field] !== null) {
      merged[field] = previous[field];
    }
  }
  // Character offsets are valid only for the exact same text.
  if (previous.runs && normalizedContent(previous.content) === normalizedContent(next.content)) {
    merged.runs = previous.runs;
  } else if (next.runs !== undefined) {
    merged.runs = next.runs;
  }
  return merged;
}

/**
 * Preserve user-edited text presentation while replacing template geometry.
 *
 * @param {object[]} previousElements - Current canvas elements.
 * @param {object[]} nextElements - Freshly generated target-template elements.
 * @returns {object[]} Target elements with uniquely matched editable styles.
 */
export function reconcileTemplateStyles(previousElements, nextElements) {
  const previous = (previousElements || []).filter(isEditableElement);
  const used = new Set();
  const bySemanticKey = new Map();
  const byRoleKey = new Map();

  for (const element of previous) {
    const key = semanticKey(element);
    if (key) {
      const candidates = bySemanticKey.get(key) || [];
      candidates.push(element);
      bySemanticKey.set(key, candidates);
    }
    const keyByRole = roleKey(element);
    const candidates = byRoleKey.get(keyByRole) || [];
    candidates.push(element);
    byRoleKey.set(keyByRole, candidates);
  }

  return (nextElements || []).map((next) => {
    if (!isEditableElement(next)) return next;

    const semanticCandidates = semanticKey(next)
      ? (bySemanticKey.get(semanticKey(next)) || [])
      : [];
    const roleCandidates = byRoleKey.get(roleKey(next)) || [];
    const candidates = semanticCandidates.length === 1
      ? semanticCandidates
      : roleCandidates.length === 1
        ? roleCandidates
        : [];
    const match = candidates.find((candidate) => !used.has(candidate.element_id));
    if (!match) return next;
    used.add(match.element_id);
    return copyStyles(match, next);
  });
}
