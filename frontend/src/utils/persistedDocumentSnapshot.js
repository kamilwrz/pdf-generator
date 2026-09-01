/** UI-only element fields that must not participate in dirty-state checks. */
const TRANSIENT_ELEMENT_KEYS = new Set([
  "isSelected",
  "isMove",
  "isEditing",
  "isResizeable",
]);

function persistedElement(element) {
  if (!element || typeof element !== "object") return element;
  return Object.fromEntries(
    Object.entries(element || {}).filter(([key]) => !TRANSIENT_ELEMENT_KEYS.has(key)),
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

/**
 * Build the exact user-authored state used to decide whether leaving the
 * editor would lose work. Array order is intentionally preserved because it
 * controls document/export order.
 */
export function createPersistedDocumentSnapshot({
  title = "",
  elements = [],
  deletedElements = [],
  pageCount = 1,
  pageSize = { width: 595, height: 842 },
  editorMode = "freeform",
  templateId = null,
  flowSpacing = null,
  cvData = null,
  sourceImportId = null,
} = {}) {
  return {
    title: String(title),
    elements: elements.map(persistedElement),
    deletedElements: deletedElements.map(persistedElement),
    pageCount,
    pageSize,
    editorMode,
    templateId,
    flowSpacing,
    cvData,
    sourceImportId,
  };
}

/** Stable signature used for lazy baseline comparison and regression tests. */
export function persistedDocumentSignature(snapshot) {
  return JSON.stringify(stableValue(snapshot));
}

export function hasPersistedDocumentContent(snapshot) {
  if (String(snapshot?.title || "").trim()) return true;
  return (snapshot?.elements || []).some((element) => {
    if (element.category !== "text" && element.category !== "textarea") return true;
    return String(element.content || "").trim().length > 0;
  });
}
