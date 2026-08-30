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
 * Page count at/above which a SIDEBAR-layout CV is considered too long.
 *
 * Sidebar templates (Tessera, Slate, Harbor, Sterling, …) only ever
 * author the rail — summary/education/skills/languages — on page 1; a
 * continuation page repeats just the rail background/divider chrome with no
 * sidebar content. A 2nd page is therefore never "a little more CV" the way
 * it is for a single-column template — it means the rail's own promise (the
 * reader sees the whole profile at a glance) is already broken. The detection
 * threshold therefore stays one page lower than for a single-column layout.
 * The remedy remains incremental, however: a long CV is reduced by one page
 * per action instead of promising an implausible jump straight to page 1.
 */
export const SIDEBAR_TOO_LONG_MIN_PAGES = 2;

/**
 * Last-page fill ratio (0..1). Below this the document has enough wasted
 * whitespace that tightening spacing alone is likely to reclaim a page, so the
 * modal leads with the free spacing pass. At or above it the pages are
 * genuinely full and the modal leads with AI content shortening instead.
 */
export const SPARSE_LAST_PAGE_RATIO = 0.45;

/**
 * Return the next realistic page-count goal for the deterministic fit action.
 *
 * Page fitting is intentionally progressive for every template family: a
 * three-page CV targets two pages, while a two-page CV targets one. This keeps
 * the CTA honest and lets the spacing probe report a successful one-page
 * reduction instead of misclassifying it as an impossible one-page document.
 *
 * @param {number} pageCount current document page count
 * @returns {number} one page fewer, clamped to one
 */
export function getNextPageFitTarget(pageCount) {
  const pages = Math.max(1, Math.trunc(Number(pageCount) || 1));
  return Math.max(1, pages - 1);
}

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
 * The `mode` heuristic (sparse last page → try spacing first; full pages → go
 * straight to AI shortening) is unchanged for sidebar layouts: the rail never
 * contributes content past page 1 (see `SIDEBAR_TOO_LONG_MIN_PAGES`), so
 * `measureLastPageUtilization` on an overflow page already reads pure
 * main-column spillover — exactly the signal this heuristic wants.
 *
 * @param {{ pageCount: number, elements: object[], isSidebarLayout?: boolean }} args
 * @returns {{ tooLong: boolean, mode: "spacing"|"content", pageCount: number, targetPages: number, utilization: number }}
 */
export function diagnoseDocumentLength({ pageCount, elements, isSidebarLayout = false }) {
  const pages = Math.max(1, Math.trunc(Number(pageCount) || 1));
  const utilization = measureLastPageUtilization(elements, pages);
  const minTooLongPages = isSidebarLayout ? SIDEBAR_TOO_LONG_MIN_PAGES : TOO_LONG_MIN_PAGES;
  const tooLong = pages >= minTooLongPages;
  // Sparse last page → whitespace is the likely culprit, try spacing first.
  // Full pages → the content itself is too long, go straight to AI shortening.
  const mode = utilization < SPARSE_LAST_PAGE_RATIO ? "spacing" : "content";
  return {
    tooLong,
    mode,
    pageCount: pages,
    // Keep every reduction achievable and explicit: 3 → 2, then 2 → 1 if the
    // user chooses to tighten again. Sidebar layout affects when we warn, not
    // the size of the promised reduction.
    targetPages: getNextPageFitTarget(pages),
    utilization,
  };
}

/**
 * Whether the long-CV auto-open offer should reset for a new editing session.
 *
 * A first autosave promotes `pdfId` from null → a real id without changing the
 * document the user is editing — that must NOT re-arm the modal (doing so was
 * stacking a second DialogShell on top of the still-open first one). Re-arm
 * only when the saved document id changes, the canvas is cleared, or the
 * template slug changes ("Zmień szablon" keeps the same pdfId).
 *
 * @param {{ pdfId: string|number|null|undefined, templateId: string|null|undefined }|null} previous
 * @param {{ pdfId: string|number|null|undefined, templateId: string|null|undefined }} next
 * @returns {boolean}
 */
export function shouldResetLongCvOffer(previous, next) {
  if (!previous) return false;
  const prevTemplate = previous.templateId ?? null;
  const nextTemplate = next.templateId ?? null;
  if (prevTemplate !== nextTemplate) return true;

  const prevPdf = previous.pdfId ?? null;
  const nextPdf = next.pdfId ?? null;
  // Draft → first save of the same canvas: keep the offer consumed.
  if (prevPdf == null && nextPdf != null) return false;
  if (prevPdf != null && nextPdf == null) return true;
  if (prevPdf != null && nextPdf != null && String(prevPdf) !== String(nextPdf)) {
    return true;
  }
  return false;
}
