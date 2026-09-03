/** Locate the semantic name field and distinguish real text from guidance. */
export function findRequiredCvNameElement(elements) {
  return (elements || []).find((element) => (
    element?.mastheadRole === "name"
    && ["text", "textarea"].includes(element.category)
  )) || null;
}

export function hasRequiredCvName(elements) {
  const nameElement = findRequiredCvNameElement(elements);
  // Older freeform documents may not have a semantic masthead field. They
  // remain saveable because there is no deterministic target the UI can focus;
  // every generated starter/import that exposes the role is still validated.
  if (!nameElement) return true;
  return Boolean(String(nameElement.content || "").trim());
}
