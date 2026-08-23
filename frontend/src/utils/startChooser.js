/**
 * Visibility rule for the post-login empty-state onboarding surface
 * (`StartChooser`), which offers the two guided paths — the step-by-step
 * wizard (`BioCvModal`) and CV import (`AiCvPanel`) — instead of dropping the
 * user onto a blank freeform A4.
 *
 * The rule is kept as a pure function (no React) so the exact gating can be
 * unit-tested without a DOM, matching this project's `node --test` convention
 * for editor logic.
 */

/**
 * Whether to show the start chooser for the current canvas state.
 *
 * Shown only for a genuinely fresh, unsaved, empty document — right after
 * login or on a brand-new project. It deliberately does NOT reappear when a
 * user empties an already-saved CV mid-session (`pdfId` is set once the
 * document has been persisted), during a wizard-to-editor handoff, over the
 * guest demo, or mid-load.
 *
 * @param {object} state
 * @param {number} state.elementsCount - number of elements on the canvas
 * @param {boolean} state.isDemoContent - true while the guest demo CV is loaded
 * @param {boolean} state.conversionPending - true while wizard data is becoming a CV
 * @param {boolean} state.isPdfLoading - true while a document is loading/saving
 * @param {number|string|null|undefined} state.pdfId - persisted document id, null/undefined until first save
 * @param {boolean} state.dismissed - true once the user chose "start from a blank page"
 * @returns {boolean}
 */
export function shouldShowStartChooser({
  elementsCount,
  isDemoContent,
  conversionPending,
  isPdfLoading,
  pdfId,
  dismissed,
} = {}) {
  if (dismissed) return false;
  if (isDemoContent) return false;
  if (conversionPending) return false;
  if (isPdfLoading) return false;
  // A persisted document (has an id) is never "brand new"; emptying it while
  // editing must not re-trigger onboarding.
  if (pdfId != null) return false;
  return (Number(elementsCount) || 0) === 0;
}
