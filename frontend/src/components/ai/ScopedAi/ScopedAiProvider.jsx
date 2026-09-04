import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { ScopedAiContext } from "../../../store/scoped-ai-context";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useDocumentLifecycle } from "../../../store/document-lifecycle-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { buildScopedAiSnapshot, scopedCorrectionsToPatches, SCOPED_AI_ACTIONS, scopedLengthSummary } from "../../../utils/scopedAi";
import { syncCvDataFromCanvas } from "../../../utils/syncCvDataFromCanvas";
import ReviewPanel from "../../common/ReviewPanel/ReviewPanel";
import classes from "./ScopedAiProvider.module.css";

/**
 * Own one transient scope review per document. Requests never receive the full
 * canvas/profile; accepted patches use the editor's atomic history transaction.
 * In-flight results are ignored after a document epoch change or unmount.
 */
export default function ScopedAiProvider({ enabled = true, children }) {
  const canvas = useCanvasContext();
  const { entitlements, refreshEntitlements } = useSession();
  const { captureDocumentScope, isDocumentScopeCurrent } = useDocumentLifecycle();
  const [review, setReview] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState("");
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
    if (flight.current) return;
    flight.current = true;
    setReview({ ...operation, status: "loading", error: "" });
    setNotice("");
    try {
      const api = new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` });
      const response = await api.httpRequest(ENDPOINTS.AI.ASSISTANT, "POST",
        JSON.stringify({ action: operation.action, scoped_content: operation.snapshot.payload }),
        "Nie udało się przygotować propozycji AI.", {
          headers: { "Idempotency-Key": operation.key }, timeoutMs: 180_000,
          retries: 1, retryDelayMs: 2500, retryOnTimeout: false,
        });
      if (!mounted.current || !isDocumentScopeCurrent(operation.documentScope)) return;
      const corrections = response.scoped_corrections || [];
      // Validate ids/content again at the client boundary before rendering an
      // applicable action, even if a proxy or future backend changes the shape.
      scopedCorrectionsToPatches(operation.elements, operation.snapshot, corrections);
      setReview({ ...operation, status: "ready", response, corrections, accepted: [], rejected: [] });
    } catch (error) {
      if (mounted.current && isDocumentScopeCurrent(operation.documentScope)) {
        setReview({ ...operation, status: "error", error: error.message, errorCode: error.code });
      }
    } finally {
      flight.current = false;
      if (mounted.current) Promise.resolve(refreshEntitlements?.()).catch(() => {});
    }
  }, [isDocumentScopeCurrent, refreshEntitlements]);

  const open = useCallback((target, action, trigger) => {
    if (!enabled) return;
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
        key: globalThis.crypto?.randomUUID?.() || nanoid(), documentScope: captureDocumentScope() };
      const error = !entitlements?.ai_assistant ? "AI wymaga planu z dostępem do asystenta. Sprawdź swój plan."
        : snapshot.error;
      if (error) setReview({ ...operation, status: "unavailable", error });
      else send(operation);
    });
  }, [captureDocumentScope, enabled, entitlements, send]);

  const currentSnapshot = review ? buildScopedAiSnapshot(canvas.A4_Elements, review.snapshot.target, canvas.pageSize?.height) : null;
  const stale = Boolean(review && (currentSnapshot.signature !== review.snapshot.signature
    || !isDocumentScopeCurrent(review.documentScope)));
  const pending = (review?.corrections || []).filter((correction) =>
    !review.accepted?.includes(correction.fragment_id) && !review.rejected?.includes(correction.fragment_id));

  const apply = (corrections) => {
    if (stale || !corrections.length) return;
    try {
      const patches = scopedCorrectionsToPatches(canvas.A4_Elements, review.snapshot, corrections);
      const result = canvas.applyScopedTextPatches(patches);
      if (!result) throw new Error("Treść zmieniła się od analizy. Wygeneruj propozycję ponownie.");
      canvas.setActiveCvData((profile) => syncCvDataFromCanvas(profile, result.before, result.after));
      const snapshot = buildScopedAiSnapshot(result.after, review.snapshot.target, canvas.pageSize?.height);
      setReview({ ...review, snapshot, accepted: [...review.accepted, ...corrections.map((c) => c.fragment_id)] });
      setNotice("Zastosowano propozycję. Zmianę możesz cofnąć przyciskiem Cofnij w edytorze.");
    } catch (error) { setNotice(error.message); }
  };

  const value = useMemo(() => ({ open, close, isOpen: enabled && isOpen }), [open, close, enabled, isOpen]);
  const actionLabel = SCOPED_AI_ACTIONS.find((action) => action.id === review?.action)?.label || "AI";
  return <ScopedAiContext.Provider value={value}>
    {children}
    {enabled && isOpen && review ? createPortal(
      <ReviewPanel title={`${actionLabel} z AI`} subtitle={review.snapshot.title} onClose={close}
        footer={<>
          {pending.length > 0 ? <button className={classes.primary} disabled={stale} onClick={() => apply(pending)}>Zastosuj wszystkie</button> : null}
          <button className={classes.button} onClick={close}>Zamknij</button>
        </>}>
        <p className={classes.note}>Analizujemy tylko wybrany zakres. Sprawdź znaczenie propozycji przed zastosowaniem.</p>
        <div role="status" aria-live="polite">{review.status === "loading" ? `Trwa operacja: ${actionLabel.toLocaleLowerCase()}…` : notice}</div>
        {review.error ? <p role="alert">{review.error}</p> : null}
        {review.status === "error" && !stale ? <button className={classes.button} onClick={() => send(review)}>Ponów żądanie</button> : null}
        {stale && review.status !== "loading" ? <div role="status"><p>Analizowana treść lub jej kontekst zmieniły się. Propozycja jest nieaktualna.</p>
          <button className={classes.button} onClick={() => open(review.snapshot.target, review.action, triggerRef.current)}>Wygeneruj ponownie</button></div> : null}
        {review.status === "ready" ? <>
          <p>{review.response.message}</p>
          {!review.corrections.length ? <p>Brak zmian do zastosowania. AI nie znalazło bezpiecznej poprawki.</p> : null}
          {review.corrections.map((correction) => {
            const accepted = review.accepted.includes(correction.fragment_id);
            const rejected = review.rejected.includes(correction.fragment_id);
            return <article className={classes.correction} key={correction.fragment_id}>
              <h3>{review.snapshot.sources.find((source) => source.id === correction.fragment_id)?.kind === "skill" ? "Umiejętność" : "Opis"}</h3>
              <dl><dt>Przed</dt><dd>{correction.before}</dd><dt>Po</dt><dd>{correction.content}</dd></dl>
              <p className={classes.note}>{scopedLengthSummary(correction.before, correction.content)}</p>
              {accepted || rejected ? <p>{accepted ? "Zastosowano" : "Odrzucono"}</p> : <div className={classes.actions}>
                <button className={classes.button} disabled={stale} onClick={() => apply([correction])}>Zastosuj</button>
                <button className={classes.button} onClick={() => setReview({ ...review, rejected: [...review.rejected, correction.fragment_id] })}>Odrzuć</button>
              </div>}
            </article>;
          })}
          {(review.response.achievement_templates || []).map((example, index) => <article className={classes.correction} key={`${example.fragment_id}-${index}`}>
            <h3>Wzór do uzupełnienia</h3><p>Ten wzór nie jest stosowany do CV.</p><p className={classes.example}>{example.template}</p>
            <ul>{example.questions.map((question, i) => <li key={i}>{question}</li>)}</ul>
            <button className={classes.button} onClick={async () => {
              try { await navigator.clipboard.writeText(example.template); setNotice("Skopiowano wzór do uzupełnienia."); }
              catch { setNotice("Nie udało się skopiować. Zaznacz tekst wzoru i skopiuj go ręcznie."); }
            }}>Kopiuj wzór</button>
          </article>)}
        </> : null}
      </ReviewPanel>, document.body) : null}
  </ScopedAiContext.Provider>;
}
