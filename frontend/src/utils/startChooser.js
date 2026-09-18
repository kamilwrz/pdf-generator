/**
 * Shared visibility rule for a fresh, unsaved and empty editor. Both guests
 * and accounts enter onboarding; loading, saved documents, demos and a
 * deliberately dismissed flow keep their current editor surface.
 * Undefined element counts represent an empty canvas before hydration.
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
