/**
 * "Is this CV too long?" heuristics for the long-document assistant.
 *
 * The detection is deliberately cheap and deterministic (no API cost): it
 * measures how full the last page is and diagnoses whether the problem is
 * likely wasted whitespace (→ try compact spacing first) or genuinely too much
 * content (→ suggest AI shortening directly). The AI step is only reached when
 * the free spacing pass cannot fix it.
 */

// Match the frontend reflow geometry (see useA4Elements: pageTop 66 /
// bottomMargin 72 at pageHeight 842). The usable content band per page is
// therefore CONTENT_BOTTOM - PAGE_TOP = 704 px.
const PAGE_TOP = 66;
const CONTENT_BOTTOM = 842 - 72; // 770

/** Page count at/above which a CV is considered a candidate for shortening. */
export const TOO_LONG_MIN_PAGES = 3;

/**
 * Last-page fill ratio (0..1). Below this the document has enough wasted
 * whitespace that tightening spacing alone is likely to reclaim a page, so the
 * modal leads with the free spacing pass. At or above it the pages are
 * genuinely full and the modal leads with AI content shortening instead.
 */
export const SPARSE_LAST_PAGE_RATIO = 0.45;

function elementBottom(element) {
  const top = Number(element?.top) || 0;
  const height = Number(element?.height);
  return top + (Number.isFinite(height) && height > 0 ? height : 0);
}

/**
 * Fraction of the last page's usable content band occupied by real content.
 *
 * Only flowing content counts — `fixedToPage` chrome (backgrounds, footers,
 * page numbers) spans the whole page and would always report ~100%. Returns 0
 * when the last page has no measurable flowing content.
 *
 * @param {object[]} elements full document element list
 * @param {number} pageCount total page count
 * @returns {number} utilization in [0, 1]
 */
export function measureLastPageUtilization(elements, pageCount) {
  const lastPage = Math.max(1, Math.trunc(Number(pageCount) || 1));
  let maxBottom = PAGE_TOP;
  for (const element of elements || []) {
    if (!element || element.fixedToPage) continue;
    const page = Math.max(1, Math.trunc(Number(element.page) || 1));
    if (page !== lastPage) continue;
    const bottom = elementBottom(element);
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const band = CONTENT_BOTTOM - PAGE_TOP;
  const used = (maxBottom - PAGE_TOP) / band;
  return Math.min(1, Math.max(0, used));
}

/**
 * Diagnose whether the document is too long and, if so, which remedy the modal
 * should lead with.
 *
 * @param {{ pageCount: number, elements: object[] }} args
 * @returns {{ tooLong: boolean, mode: "spacing"|"content", pageCount: number, targetPages: number, utilization: number }}
 */
export function diagnoseDocumentLength({ pageCount, elements }) {
  const pages = Math.max(1, Math.trunc(Number(pageCount) || 1));
  const utilization = measureLastPageUtilization(elements, pages);
  const tooLong = pages >= TOO_LONG_MIN_PAGES;
  // Sparse last page → whitespace is the likely culprit, try spacing first.
  // Full pages → the content itself is too long, go straight to AI shortening.
  const mode = utilization < SPARSE_LAST_PAGE_RATIO ? "spacing" : "content";
  return {
    tooLong,
    mode,
    pageCount: pages,
    // Realistic goal is one page fewer at a time, never below one page.
    targetPages: Math.max(1, pages - 1),
    utilization,
  };
}
