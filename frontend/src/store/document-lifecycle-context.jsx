/**
 * Document-session identity for guarding asynchronous editor work.
 *
 * `epoch` changes whenever the complete canvas is replaced. It is deliberately
 * independent from pdf/template ids: two saved documents may use the same
 * template, and a newly created document receives its database id only after a
 * request finishes. `revision` changes only when the persisted snapshot changes.
 */
import { createContext, use, useCallback, useMemo, useRef, useState } from "react";
import { createDocumentLifecycleScopeTracker } from "../utils/documentLifecycleScope";

export const DocumentLifecycleContext = createContext(null);

/**
 * Own the synchronous refs used by async callbacks plus their render-visible
 * counterparts. The ref is updated before React schedules a render, so a late
 * promise can never commit during the small gap before consumers re-render.
 */
export function useDocumentLifecycleController() {
  const trackerRef = useRef(null);
  if (trackerRef.current == null) {
    trackerRef.current = createDocumentLifecycleScopeTracker();
  }
  const [epoch, setEpoch] = useState(0);
  const [revision, setRevision] = useState(0);
  const [conversationKey, setConversationKey] = useState(0);

  const observeDocumentSignature = useCallback((signature) => {
    if (!trackerRef.current.observeSignature(signature)) return;
    setRevision(trackerRef.current.getRevision());
  }, []);

  const captureDocumentScope = useCallback(() => trackerRef.current.capture(), []);

  const isDocumentScopeCurrent = useCallback((scope, options = {}) => {
    return trackerRef.current.isCurrent(scope, options.requireSameRevision);
  }, []);

  // Product-facing names from the lifecycle contract. The older descriptive
  // aliases stay available while existing editor callbacks migrate without a
  // flag day; both pairs use the same synchronous tracker.
  const beginOperation = captureDocumentScope;
  const canCommit = isDocumentScopeCurrent;

  const advanceDocumentSession = useCallback(({ preserveConversation = false } = {}) => {
    const scope = trackerRef.current.advance();
    // Template replacement invalidates element references while retaining the
    // conversation. Opening or creating another document starts a fresh chat.
    if (!preserveConversation) setConversationKey((key) => key + 1);
    setEpoch(scope.epoch);
    setRevision(scope.revision);
    return scope;
  }, []);

  return useMemo(() => ({
    epoch,
    revision,
    sessionKey: String(epoch),
    conversationKey: String(conversationKey),
    beginOperation,
    canCommit,
    observeDocumentSignature,
    captureDocumentScope,
    isDocumentScopeCurrent,
    advanceDocumentSession,
  }), [
    advanceDocumentSession,
    beginOperation,
    canCommit,
    captureDocumentScope,
    conversationKey,
    epoch,
    isDocumentScopeCurrent,
    observeDocumentSignature,
    revision,
  ]);
}

/** @returns {ReturnType<typeof useDocumentLifecycleController>} */
export function useDocumentLifecycle() {
  const value = use(DocumentLifecycleContext);
  if (!value) {
    throw new Error("useDocumentLifecycle must be used within DocumentLifecycleContext.Provider");
  }
  return value;
}
