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
 * `reconcileDocumentPages` only touches fixed page chrome and `pageCount`.
 * It must never rewrite content geometry (left/top/page of flow elements) —
 * packing / reflow own those positions.
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
 * Preserves object identity when a label does not change.
 *
 * @param {object[]} elements
 * @returns {{ elements: object[], changed: boolean }}
 */
export function renumberFixedPageNumbers(elements) {
  let changed = false;
  const next = (elements || []).map((element) => {
    if (!element?.fixedToPage) return element;
    if (element.category !== "text" || !isPageNumberContent(element.content)) {
      return element;
    }
    const page = Math.max(1, Math.trunc(element.page ?? 1));
    const content = formatContinuationPageNumber(element.content, page);
    if (content === element.content) return element;
    changed = true;
    return { ...element, content };
  });
  return { elements: changed ? next : elements, changed };
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

/**
 * True for a page-1-only letterhead band (full-page width, short height at the
 * top). Sterling's tinted masthead field must not clone onto continuation
 * pages — those keep a single vertical rail only.
 *
 * @param {object} element
 * @param {number} [pageHeight=842]
 * @returns {boolean}
 */
export function isLetterheadBandChrome(element, pageHeight = 842) {
  if (!element || element.category !== "line") return false;
  const left = Number(element.left) || 0;
  const top = Number(element.top) || 0;
  const width = Number(element.width) || 0;
  const height = Number(element.height) || 0;
  return left <= 1
    && top <= 1
    && width >= 500
    && height > 40
    && height < pageHeight * 0.4;
}

/**
 * Expand a short page-1 sidebar rail / divider so continuation pages get a
 * full-height vertical strip. Legacy Sterling docs authored rail+divider under
 * the letterhead band (top > 0); cloning that geometry left a stub on page 2.
 *
 * @param {object} element
 * @param {number} [pageHeight=842]
 * @returns {object}
 */
export function expandContinuationRailChrome(element, pageHeight = 842) {
  if (!element || element.category !== "line") return element;
  const left = Number(element.left) || 0;
  const top = Number(element.top) || 0;
  const width = Number(element.width) || 0;
  const height = Number(element.height) || 0;
  if (top <= 0 || height >= pageHeight - 8) return element;
  // Wide left rail fill (Tessera / Slate / Sterling ~150–230pt).
  if (left <= 1 && width >= 100 && width <= 280) {
    return { ...element, top: 0, height: pageHeight };
  }
  // Thin vertical divider at the rail edge.
  if (left >= 140 && left <= 280 && width > 0 && width <= 4) {
    return { ...element, top: 0, height: pageHeight };
  }
  return element;
}

export function cloneFixedPageDecorations(elements, firstNewPage, targetMaxPage, createId) {
  const clones = [];
  const pageHeight = 842;
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
        // Legacy docs may omit `repeatOnContinuation` on the letterhead band.
        && !isLetterheadBandChrome(element, pageHeight)
      ))
      .forEach((element) => {
        const isPageNumber = isPageNumberContent(element.content);
        const geometry = expandContinuationRailChrome(element, pageHeight);
        clones.push({
          ...geometry,
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
 * Never modifies content element geometry. Returns the original `elements`
 * array reference when chrome / pageCount need no change — callers that pack
 * rhythm must not churn identities and re-trigger textarea reflow.
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
  const existingMax = list.length === 0
    ? 1
    : Math.max(
      1,
      ...list.map((element) => Math.max(1, Math.trunc(element.page ?? 1))),
    );

  // When collapsing, trailing chrome-only pages disappear. When not, keep any
  // intentionally blank pages the user just added (minPageCount / existing).
  const pageCount = collapseEmpty
    ? Math.max(contentMax, minPageCount)
    : Math.max(contentMax, minPageCount, existingMax);

  // Only drop fixed chrome on pages beyond pageCount — never drop content.
  let droppedChrome = false;
  const withoutOrphanChrome = [];
  for (const element of list) {
    const page = Math.max(1, Math.trunc(element.page ?? 1));
    if (page > pageCount && element.fixedToPage) {
      droppedChrome = true;
      continue;
    }
    withoutOrphanChrome.push(element);
  }

  const base = droppedChrome ? withoutOrphanChrome : list;
  // Page-1 chrome is authored by the template. Only fill gaps on continuations.
  const generated = pageCount >= 2
    ? cloneFixedPageDecorations(base, 2, pageCount, createId)
    : [];

  const withClones = generated.length ? [...base, ...generated] : base;
  const renumbered = renumberFixedPageNumbers(withClones);

  if (!droppedChrome && generated.length === 0 && !renumbered.changed) {
    return { elements: list, pageCount };
  }
  return { elements: renumbered.elements, pageCount };
}
