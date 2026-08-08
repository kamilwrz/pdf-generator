/**
 * AI structure-operation preview and fixed-page chrome cloning.
 *
 * `previewStructureOperation` applies a reviewed remove/add/patch group locally
 * without committing, so the user can accept or reject the card.
 * `cloneFixedPageDecorations` copies backgrounds/page numbers onto new pages
 * when overflow creates them — page-number text is updated to the new index
 * (including zero-padded Nova-style "01" / "02").
 * Page-one-only masthead artwork opts out with `repeatOnContinuation: false`.
 *
 * `reconcileDocumentPages` is the single entry for keep-in-sync page chrome:
 * ensure decorations exist through a target page count, drop chrome-only
 * trailing pages when content collapses, and renumber page labels.
 */

/** True when fixed text looks like a page index ("1", "01", " 2 "). */
export function isPageNumberContent(content) {
  return /^\s*\d+\s*$/.test(String(content || ""));
}

/**
 * Format a continuation page label from a source page-number string.
 * Preserves zero-padding width ("01" → "02", "1" → "2").
 *
 * @param {unknown} sourceContent
 * @param {number} page
 * @returns {string}
 */
export function formatContinuationPageNumber(sourceContent, page) {
  const raw = String(sourceContent ?? "").trim();
  if (!/^\d+$/.test(raw)) return String(sourceContent ?? "");
  const width = raw.length;
  const value = String(Math.max(1, Math.trunc(page)));
  return width > 1 ? value.padStart(width, "0") : value;
}

/**
 * Highest page that holds interactive content (not fixed page chrome).
 * Empty documents still count as page 1.
 *
 * @param {object[]} elements
 * @returns {number}
 */
export function contentMaxPage(elements) {
  let max = 1;
  for (const element of elements || []) {
    if (!element || element.fixedToPage) continue;
    max = Math.max(max, Math.max(1, Math.trunc(element.page ?? 1)));
  }
  return max;
}

/**
 * Rewrite fixed page-number labels so each page shows its own index.
 *
 * @param {object[]} elements
 * @returns {object[]}
 */
export function renumberFixedPageNumbers(elements) {
  return (elements || []).map((element) => {
    if (!element?.fixedToPage) return element;
    if (element.category !== "text" || !isPageNumberContent(element.content)) {
      return element;
    }
    const page = Math.max(1, Math.trunc(element.page ?? 1));
    const next = formatContinuationPageNumber(element.content, page);
    return next === element.content ? element : { ...element, content: next };
  });
}

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
        && element.repeatOnContinuation !== false
      ))
      .forEach((element) => {
        const isPageNumber = isPageNumberContent(element.content);
        clones.push({
          ...element,
          element_id: createId(),
          page,
          content: isPageNumber
            ? formatContinuationPageNumber(element.content, page)
            : element.content,
          isSelected: false,
          isMove: false,
          isEditing: false,
        });
      });
  }
  return clones;
}

/**
 * Keep page chrome aligned with content (and optional explicit blank pages).
 *
 * @param {object[]} elements
 * @param {() => string} createId
 * @param {{
 *   minPageCount?: number,
 *   collapseEmpty?: boolean,
 * }} [options]
 *   - minPageCount: ensure at least this many pages (Dodaj stronę / goTo beyond end)
 *   - collapseEmpty: drop trailing chrome-only pages above the last content page
 * @returns {{ elements: object[], pageCount: number }}
 */
export function reconcileDocumentPages(elements, createId, options = {}) {
  const collapseEmpty = options.collapseEmpty !== false;
  const minPageCount = Math.max(1, Math.trunc(options.minPageCount ?? 1));
  const list = Array.isArray(elements) ? elements : [];
  const contentMax = contentMaxPage(list);
  const existingMax = Math.max(
    1,
    ...list.map((element) => Math.max(1, Math.trunc(element.page ?? 1))),
  );

  // When collapsing, trailing chrome-only pages disappear. When not, keep any
  // intentionally blank pages the user just added (minPageCount / existing).
  const pageCount = collapseEmpty
    ? Math.max(contentMax, minPageCount)
    : Math.max(contentMax, minPageCount, existingMax);

  let next = list.filter((element) => Math.max(1, Math.trunc(element.page ?? 1)) <= pageCount);
  const generated = cloneFixedPageDecorations(next, 1, pageCount, createId);
  if (generated.length) next = [...next, ...generated];
  next = renumberFixedPageNumbers(next);

  return { elements: next, pageCount };
}
