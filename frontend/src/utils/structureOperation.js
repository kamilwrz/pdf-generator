export function previewStructureOperation(elements, group) {
  if (!group?.remove_element_ids || !group?.add_elements) return elements;
  const removedIds = new Set(group.remove_element_ids);
  const patchesById = new Map((group.patches || []).map((patch) => [patch.element_id, patch]));
  const retained = elements
    .filter((element) => !removedIds.has(element.element_id))
    .map((element) => {
      const patch = patchesById.get(element.element_id);
      return patch
        ? { ...element, ...patch, isSelected: false, isMove: false, isEditing: false }
        : { ...element, isSelected: false, isMove: false, isEditing: false };
    });
  return [
    ...retained,
    ...group.add_elements.map((element) => ({
      ...element,
      isSelected: false,
      isMove: false,
      isEditing: false,
      locked: false,
    })),
  ];
}

export function cloneFixedPageDecorations(elements, firstNewPage, targetMaxPage, createId) {
  const clones = [];
  for (let page = firstNewPage; page <= targetMaxPage; page += 1) {
    if (elements.some((element) => element.fixedToPage && (element.page ?? 1) === page)) continue;
    const source = [...elements]
      .filter((element) => element.fixedToPage && (element.page ?? 1) < page)
      .sort((first, second) => (second.page ?? 1) - (first.page ?? 1))[0];
    if (!source) continue;
    const sourcePage = source.page ?? 1;
    elements
      .filter((element) => (
        element.fixedToPage
        && (element.page ?? 1) === sourcePage
        && element.category !== "connector"
      ))
      .forEach((element) => {
        const isPageNumber = element.category === "text" && /^\s*\d+\s*$/.test(String(element.content || ""));
        clones.push({
          ...element,
          element_id: createId(),
          page,
          content: isPageNumber ? String(page) : element.content,
          isSelected: false,
          isMove: false,
          isEditing: false,
        });
      });
  }
  return clones;
}
