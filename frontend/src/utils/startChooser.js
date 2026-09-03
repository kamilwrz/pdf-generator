/**
 * Visibility rule for the post-login empty-state onboarding surface
 * (`StartChooser`), which offers the two focused paths — the one-screen A4
 * setup and CV import — instead of dropping the user onto a blank canvas.
 *
 * The rule is kept as a pure function (no React) so the exact gating can be
 * unit-tested without a DOM, matching this project's `node --test` convention
 * for editor logic.
 */

/**
 * Whether to show the start chooser for the current canvas state.
 *
 * Shown only for a genuinely fresh, unsaved, empty document. It deliberately
 * does NOT reappear when a
 * user empties an already-saved CV mid-session (`pdfId` is set once the
 * document has been persisted), during a setup-to-editor handoff, over the
 * guest demo, or mid-load.
 *
 * @param {object} state
 * @param {number} state.elementsCount - number of elements on the canvas
 * @param {boolean} state.isDemoContent - true while the guest demo CV is loaded
 * @param {boolean} state.isPdfLoading - true while a document is loading/saving
 * @param {number|string|null|undefined} state.pdfId - persisted document id, null/undefined until first save
 * @param {boolean} state.dismissed - true once the user has started or opened a document
 * @returns {boolean}
 */
export function shouldShowStartChooser({
  elementsCount,
  isDemoContent,
  isPdfLoading,
  pdfId,
  dismissed,
} = {}) {
  if (dismissed) return false;
  if (isDemoContent) return false;
  if (isPdfLoading) return false;
  // A persisted document (has an id) is never "brand new"; emptying it while
  // editing must not re-trigger onboarding.
  if (pdfId != null) return false;
  return (Number(elementsCount) || 0) === 0;
}
