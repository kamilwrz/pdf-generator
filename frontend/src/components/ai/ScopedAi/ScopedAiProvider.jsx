import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { nanoid } from "nanoid";
import { ScopedAiContext } from "../../../store/scoped-ai-context";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useDocumentLifecycle } from "../../../store/document-lifecycle-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { buildScopedAiSnapshot, scopedCorrectionsToPatches } from "../../../utils/scopedAi";

/**
 * Own scoped review history for the current document conversation. Requests never receive the full
 * canvas/profile; accepted patches use the editor's atomic history transaction.
 * In-flight results are ignored after a document epoch change or unmount.
 */
export default function ScopedAiProvider({ enabled = true, children }) {
  const canvas = useCanvasContext();
  const { entitlements, refreshEntitlements } = useSession();
  // Fail closed until the server resolves an active Pro/Premium subscription.
  const isAvailable = Boolean(entitlements?.scoped_ai);
  const { captureDocumentScope, isDocumentScopeCurrent } = useDocumentLifecycle();
  const [reviews, setReviews] = useState([]);
  // Functional replacement keeps responses and accept/reject state attached to
  // their original request, including when the assistant is closed and reopened.
  const setReview = useCallback((review) => setReviews((items) => {
    const exists = items.some((item) => item.key === review.key);
    return exists ? items.map((item) => item.key === review.key ? review : item) : [...items, review];
  }), []);
  const [isOpen, setIsOpen] = useState(false);
    const latest = useRef(canvas);
  const flight = useRef(false);
  const mounted = useRef(true);
  const triggerRef = useRef(null);
  const restoreTargetRef = useRef(null);
  useEffect(() => { latest.current = canvas; }, [canvas]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    const trigger = triggerRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else {
        const target = restoreTargetRef.current;
        document.getElementById(target?.elementId)?.focus({ preventScroll: true });
        // The toolbar is hidden during review. Focusing its authored anchor
        // mounts it again, after which the recreated AI trigger can take focus.
        requestAnimationFrame(() => document.querySelector(
          `[data-canvas-toolbar-key="${CSS.escape(target?.toolbarKey || "")}"] button[aria-label="AI dla wybranego zakresu"]`,
        )?.focus({ preventScroll: true }));
      }
    });
  }, []);

  const send = useCallback(async (operation) => {
    if (!isAvailable || flight.current) return;
    flight.current = true;
    setReview({ ...operation, status: "loading", error: "" });
    try {
      const api = new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` });
      const response = await api.httpRequest(ENDPOINTS.AI.ASSISTANT, "POST",
        JSON.stringify({ action: operation.action, scoped_content: operation.snapshot.payload }),
        "Nie udało się przygotować propozycji AI.", {
          headers: { "Idempotency-Key": operation.key }, timeoutMs: 180_000,
          retries: 1, retryDelayMs: 2500, retryOnTimeout: false,
        });
      if (!mounted.current) return;
      if (!isDocumentScopeCurrent(operation.documentScope)) {
        setReview({ ...operation, status: "unavailable", error: "Szablon zmienił się podczas analizy. Wybierz zakres w aktualnym CV." });
        return;
      }
      const corrections = response.scoped_corrections || [];
      // Validate ids/content again at the client boundary before rendering an
      // applicable action, even if a proxy or future backend changes the shape.
      scopedCorrectionsToPatches(operation.elements, operation.snapshot, corrections);
      setReview({ ...operation, status: "ready", response, corrections, accepted: [], rejected: [] });
    } catch (error) {
      if (mounted.current) {
        setReview({ ...operation, status: "error", error: error.message, errorCode: error.code });
      }
    } finally {
      flight.current = false;
      if (mounted.current) Promise.resolve(refreshEntitlements?.()).catch(() => {});
    }
  }, [isAvailable, isDocumentScopeCurrent, refreshEntitlements, setReview]);

  const open = useCallback((target, action, trigger) => {
    if (!enabled || !isAvailable) return;
    triggerRef.current = trigger;
    restoreTargetRef.current = { elementId: target.elementId || target.headingId,
      toolbarKey: trigger?.closest?.("[data-canvas-toolbar-key]")?.getAttribute("data-canvas-toolbar-key") };
    setIsOpen(true);
    if (flight.current) return;
    // Contenteditable blur commits pending text/runs before the snapshot. The
    // next frame reads the provider's fresh canvas instead of the event closure.
    flushSync(() => { document.activeElement?.blur?.(); });
    requestAnimationFrame(() => {
      if (!mounted.current) return;
      const current = latest.current;
      document.getElementById(target.elementId || target.headingId)?.scrollIntoView?.({ block: "start", inline: "start", behavior: "instant" });
      const snapshot = buildScopedAiSnapshot(current.A4_Elements, target, current.pageSize?.height);
      const operation = { action, snapshot, elements: current.A4_Elements,
        createdAt: Date.now(), key: globalThis.crypto?.randomUUID?.() || nanoid(), documentScope: captureDocumentScope() };
      const error = snapshot.error;
      if (error) setReview({ ...operation, status: "unavailable", error });
      else send(operation);
    });
  }, [captureDocumentScope, enabled, isAvailable, send, setReview]);

  const value = { open, close, reviews, setReview, send,
    isAvailable: enabled && isAvailable, isOpen: enabled && isAvailable && isOpen };
  return <ScopedAiContext.Provider value={value}>{children}</ScopedAiContext.Provider>;
}
