/**
 * Create a monotonic document-scope tracker for asynchronous editor work.
 *
 * The tracker intentionally does not use a PDF id or template id as identity.
 * Returning from document B to document A must still invalidate work captured
 * during the earlier A session, so every complete replacement advances an
 * epoch that is never reused. Revisions invalidate work after an in-session
 * persisted-content change when callers request that stricter guarantee.
 *
 * @returns {{
 *   getEpoch: () => number,
 *   getRevision: () => number,
 *   observeSignature: (signature: string) => boolean,
 *   capture: () => { epoch: number, revision: number },
 *   isCurrent: (scope: { epoch: number, revision: number } | null | undefined, requireSameRevision?: boolean) => boolean,
 *   advance: () => { epoch: number, revision: number },
 * }} A synchronous tracker whose captured scopes can be checked after awaits.
 */
export function createDocumentLifecycleScopeTracker() {
  let epoch = 0;
  let revision = 0;
  let lastSignature = null;

  return {
    getEpoch: () => epoch,
    getRevision: () => revision,
    observeSignature(signature) {
      if (lastSignature == null) {
        lastSignature = signature;
        return false;
      }
      if (lastSignature === signature) return false;
      lastSignature = signature;
      revision += 1;
      return true;
    },
    capture: () => ({ epoch, revision }),
    isCurrent(scope, requireSameRevision = false) {
      if (!scope || scope.epoch !== epoch) return false;
      return !requireSameRevision || scope.revision === revision;
    },
    advance() {
      epoch += 1;
      revision = 0;
      return { epoch, revision };
    },
  };
}
