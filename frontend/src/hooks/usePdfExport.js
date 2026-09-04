import { useState, useCallback, useRef } from 'react';
import { ApiClient, ENDPOINTS, wakeBackend } from "../services/api";
import { sanitizeElementsContent } from "../utils/sanitizeTextContent";
import { assertCanvasElementRoot } from "../utils/canvasElementSchema";
import { flowSpacingToPayload } from "../utils/flowSpacing";
import { resolveBrowserTextLayouts } from "../utils/browserTextLayout";
import { prepareStarterElementsForRender } from "../utils/starterElementStructure.js";
import {
  localizePdfPersistenceError,
  requirePdfRevision,
  resolveCreateAttempt,
} from "../utils/pdfPersistenceContract";
import {
  nextSaveProgressStageAt,
  saveProgressDismissAt,
} from "../utils/saveProgressTiming";

/**
 * PDF create / update / download against the backend.
 *
 * Create and update persist the document to "Moje dokumenty" and trigger a
 * full ReportLab render on the server — they run only on an explicit "Zapisz".
 * `downloadPdf` renders the current canvas to a file WITHOUT persisting it
 * (render-on-demand), so "Pobierz" is independent of "Zapisz".
 * `saveElements` persists canvas rows only (no render); it is a low-level
 * primitive and is no longer used for background autosave.
 *
 * @param {Function} handlePdfId - Stores the active document id and authoritative
 *   server revision after successful create/update/save-elements responses.
 * @param {Function} handleShowModal - Opens the save/download result UI.
 * @param {React.RefObject} titleRef - Title input; `.pdf` is appended for storage.
 * @param {Array} A4_Elements_deleted - Soft-deleted rows still sent on update.
 * @param {Function} setA4_Elements_deleted - Cleared after a successful write.
 * @returns {object} Save/download commands, the latest response, loading state,
 *   operation kind, and real save phase used by operation-specific feedback.
 */
export function usePdfExport(handlePdfId, handleShowModal, titleRef, A4_Elements_deleted, setA4_Elements_deleted) {

  const [responsePDF, setResponsePDF] = useState();
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfOperation, setPdfOperation] = useState(null);
  const [pdfOperationPhase, setPdfOperationPhase] = useState(null);
  const createAttemptRef = useRef(null);
  const operationSequenceRef = useRef(0);

  // Keep the loading state up for at least this long so a fast request still
  // shows the spinner (otherwise it can flash by before it's ever painted).
  const MIN_SPINNER_MS = 650;

  const scheduleOperationPhase = useCallback((operationSequence, phase, visibleAt) => {
    window.setTimeout(() => {
      // A completed or superseded request must never advance the next
      // operation's presentation with one of its stale timers.
      if (operationSequenceRef.current !== operationSequence) return;
      setPdfOperationPhase(phase);
    }, Math.max(0, visibleAt - Date.now()));
  }, []);

  const clearOperation = useCallback((operationSequence) => {
    if (operationSequenceRef.current !== operationSequence) return false;
    operationSequenceRef.current += 1;
    setIsPdfLoading(false);
    setPdfOperation(null);
    setPdfOperationPhase(null);
    return true;
  }, []);


  const createPdf = useCallback((A4_Elements, titleRef, pages = 1, pageSize, meta = {}) => {

    const operationSequence = ++operationSequenceRef.current;
    setIsPdfLoading(true);
    setPdfOperation("save");
    setPdfOperationPhase("prepare");
    setResponsePDF(undefined);
    const startedAt = Date.now();
    let didPersist = false;
    let persistVisibleAt = startedAt;
    let confirmVisibleAt = null;

    // Strip NULL/NBSP junk before the request so even an older backend
    // cannot bake missing-glyph boxes into the exported PDF.
    const sorted = sanitizeElementsContent(
      [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
    );
    try {
      assertCanvasElementRoot(sorted);
    } catch (error) {
      setResponsePDF(error);
      setTimeout(() => {
        if (!clearOperation(operationSequence)) return;
        handleShowModal();
      }, MIN_SPINNER_MS);
      return;
    }

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})
    const editor_mode = meta.editorMode === "template" ? "template" : "freeform";
    const template_id = meta.templateId || null;
    const spacing_px = flowSpacingToPayload(meta.flowSpacing);
    const source_import_id = Number.isInteger(meta.sourceImportId) ? meta.sourceImportId : null;
    const cv_data = meta.cvData || null;
    // Wake a sleeping Render dyno before the heavy create; then retry transient
    // "Failed to fetch" blips that otherwise surface as a cold-start toast.
    // Chromium resolves soft wraps first so ReportLab draws the exact lines
    // visible on the canvas instead of estimating them with another shaper.
    Promise.all([
      resolveBrowserTextLayouts(sorted),
      resolveBrowserTextLayouts(prepareStarterElementsForRender(
        sorted,
        pageSize?.height ?? 842,
        template_id,
      )),
    ])
      .then(([persistedRoot, renderRoot]) => {
        // Layout resolution is complete. The remaining work is the actual
        // authenticated persistence/render transaction on the backend. Keep
        // the preparation step readable before exposing this real boundary.
        persistVisibleAt = nextSaveProgressStageAt(startedAt, Date.now());
        scheduleOperationPhase(operationSequence, "persist", persistVisibleAt);
        const body = JSON.stringify({
          root: persistedRoot,
          render_root: renderRoot,
          pdf_title: titleRef.current.value + ".pdf",
          pages,
          page_width: pageSize?.width ?? 595,
          page_height: pageSize?.height ?? 842,
          editor_mode,
          template_id,
          spacing_px,
          cv_data,
          source_import_id,
        });
        // The serialized, browser-resolved canvas is the exact payload sent to
        // the backend. Include the monotonic document epoch in the fingerprint
        // so a new editor session never reuses an earlier document's key.
        const fingerprint = `${meta.documentSessionKey ?? "unknown"}\u0000${body}`;
        const createAttempt = resolveCreateAttempt(createAttemptRef.current, fingerprint);
        createAttemptRef.current = createAttempt;
        return wakeBackend().then(() => api.httpRequest(
        ENDPOINTS.PDF.CREATE,
        "POST",
        body,
        "Nie udało się utworzyć PDF!",
        {
          retries: 2,
          timeoutMs: 120_000,
          headers: { "Idempotency-Key": createAttempt.idempotencyKey },
        },
        ));
      })
      .then((data) => {
        const revision = requirePdfRevision(data.revision);
        didPersist = true;
        // Confirmation becomes visible only after the server response and a
        // readable persistence stage; neither condition can overtake the other.
        confirmVisibleAt = nextSaveProgressStageAt(persistVisibleAt, Date.now());
        scheduleOperationPhase(operationSequence, "confirm", confirmVisibleAt);
        createAttemptRef.current = null;
        handlePdfId(data.pdf_id, { revision });
        setResponsePDF({
          success: data.created,
          pdf_id: data.pdf_id,
          revision,
          replayed: data.replayed === true,
          intent: "save",
        });
      })
      .catch((error) => {
        // A status-bearing response proves the server handled the request; a
        // later click is a new logical attempt. Network/timeout failures remain
        // uncertain, so the same snapshot keeps its key for a safe replay.
        if (error?.status) createAttemptRef.current = null;
        setResponsePDF(localizePdfPersistenceError(error));
      })
      .finally(() => {
        const finishAt = didPersist && confirmVisibleAt != null
          ? saveProgressDismissAt(confirmVisibleAt)
          : Math.max(Date.now(), startedAt + MIN_SPINNER_MS);
        setTimeout(() => {
          if (!clearOperation(operationSequence)) return;
          handleShowModal();
          if (didPersist) setA4_Elements_deleted([]);
        }, Math.max(0, finishAt - Date.now()));
      });
  }, [clearOperation, handlePdfId, handleShowModal, scheduleOperationPhase, setA4_Elements_deleted]);

  
  const updatePdf = useCallback((A4_Elements, PDF_ID, titleRef, A4_Elements_deleted, pages = 1, pageSize, meta = {}) => {

    const operationSequence = ++operationSequenceRef.current;
    setIsPdfLoading(true);
    setPdfOperation("save");
    setPdfOperationPhase("prepare");
    setResponsePDF(undefined);
    const startedAt = Date.now();
    let didPersist = false;
    let persistVisibleAt = startedAt;
    let confirmVisibleAt = null;

    const sorted = sanitizeElementsContent(
      [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
    );
    const elements = [...sorted, ...sanitizeElementsContent(A4_Elements_deleted)];
    let expected_revision;
    try {
      assertCanvasElementRoot(elements);
      expected_revision = requirePdfRevision(meta.expectedRevision);
    } catch (error) {
      setResponsePDF(error);
      setTimeout(() => {
        if (!clearOperation(operationSequence)) return;
        handleShowModal();
      }, MIN_SPINNER_MS);
      return;
    }

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})
    const editor_mode = meta.editorMode === "template" ? "template" : "freeform";
    const template_id = meta.templateId || null;
    const spacing_px = flowSpacingToPayload(meta.flowSpacing);
    const cv_data = meta.cvData || null;
    // Topbar "Pobierz" uses update; optional meta.intent lets save-style updates
    // skip the auto-download branch in PdfCanvas.
    const intent = meta.intent === "save" ? "save" : "download";
    Promise.all([
      resolveBrowserTextLayouts(sorted),
      resolveBrowserTextLayouts(prepareStarterElementsForRender(
        sorted,
        pageSize?.height ?? 842,
        template_id,
      )),
    ])
      .then(([persistedRoot, renderRoot]) => {
        persistVisibleAt = nextSaveProgressStageAt(startedAt, Date.now());
        scheduleOperationPhase(operationSequence, "persist", persistVisibleAt);
        const body = JSON.stringify({
          root: [...persistedRoot, ...sanitizeElementsContent(A4_Elements_deleted)],
          render_root: renderRoot,
          pdf_id: PDF_ID,
          pdf_title: titleRef.current.value +".pdf",
          pages,
          page_width: pageSize?.width ?? 595,
          page_height: pageSize?.height ?? 842,
          editor_mode,
          template_id,
          spacing_px,
          cv_data,
          expected_revision,
        });
        return wakeBackend().then(() => api.httpRequest(
        ENDPOINTS.PDF.UPDATE,
        "PUT",
        body,
        "Nie udało się zaktualizować PDF!",
        { retries: 2, timeoutMs: 120_000 },
        ));
      })
      .then((data) => {
        const revision = requirePdfRevision(data.revision);
        didPersist = true;
        confirmVisibleAt = nextSaveProgressStageAt(persistVisibleAt, Date.now());
        scheduleOperationPhase(operationSequence, "confirm", confirmVisibleAt);
        handlePdfId(data.pdf_id ?? PDF_ID, { revision });
        setResponsePDF({
          success: data.updated,
          pdf_id: data.pdf_id,
          revision,
          intent,
        });
      })
      .catch((error) => setResponsePDF(localizePdfPersistenceError(error)))
      .finally(() => {
        const finishAt = didPersist && confirmVisibleAt != null
          ? saveProgressDismissAt(confirmVisibleAt)
          : Math.max(Date.now(), startedAt + MIN_SPINNER_MS);
        setTimeout(() => {
          if (!clearOperation(operationSequence)) return;
          handleShowModal();
          if (didPersist) setA4_Elements_deleted([]);
        }, Math.max(0, finishAt - Date.now()));
      });
  }, [clearOperation, handlePdfId, handleShowModal, scheduleOperationPhase, setA4_Elements_deleted])


  // Render-on-demand download: render the current canvas to a PDF and return a
  // one-shot object URL, WITHOUT creating or updating a "Moje dokumenty" row.
  // This is what makes "Pobierz" independent of "Zapisz" — an unsaved document
  // can still be exported. The backend still meters every export, so a blocked
  // free-plan quota rejects here exactly like a stored-file download.
  const downloadPdf = useCallback(async (A4_Elements, titleRef, pages = 1, pageSize, meta = {}) => {
    const operationSequence = ++operationSequenceRef.current;
    setIsPdfLoading(true);
    setPdfOperation("download");
    setPdfOperationPhase("render");
    const startedAt = Date.now();
    try {
      const sorted = sanitizeElementsContent(
        [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
      );
      // Reuse the same schema guard as create/update so a malformed canvas
      // fails fast with a readable error instead of a 422 from the server.
      assertCanvasElementRoot(sorted);

      const renderRoot = await resolveBrowserTextLayouts(
        prepareStarterElementsForRender(
          sorted,
          pageSize?.height ?? 842,
          meta.templateId || null,
        ),
      );
      const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });
      const editor_mode = meta.editorMode === "template" ? "template" : "freeform";
      const template_id = meta.templateId || null;
      const pdf_id = Number.isInteger(meta.pdfId) ? meta.pdfId : null;
      const spacing_px = flowSpacingToPayload(meta.flowSpacing);
      const baseTitle = titleRef.current?.value || "cv";
      const body = JSON.stringify({
        root: sorted,
        render_root: renderRoot,
        pdf_title: baseTitle + ".pdf",
        pages,
        page_width: pageSize?.width ?? 595,
        page_height: pageSize?.height ?? 842,
        editor_mode,
        template_id,
        pdf_id,
        spacing_px,
      });

      // Wake a sleeping Render dyno first, then retry transient cold-start blips
      // — mirrors the create/update path so the first download after idle works.
      const { blob, filename } = await wakeBackend().then(() => api.httpRequestBlob(
        ENDPOINTS.PDF.RENDER,
        "POST",
        body,
        "Nie udało się pobrać PDF!",
        { retries: 2, timeoutMs: 120_000 },
      ));
      const urlBlob = URL.createObjectURL(blob);
      // Keep the object URL alive long enough for the toast "Pobierz PDF" action.
      window.setTimeout(() => URL.revokeObjectURL(urlBlob), 60_000);
      return { blob: urlBlob, title: filename || `${baseTitle}.pdf` };
    } finally {
      // Honour the minimum spinner window so a fast render still paints once.
      const remaining = Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt));
      window.setTimeout(() => {
        clearOperation(operationSequence);
      }, remaining);
    }
  }, [clearOperation]);


  // Lightweight elements-only persistence (no PDF render, no S3). Retained as a
  // low-level primitive; background autosave was removed, so nothing calls this
  // by default. Kept for callers that need to persist rows without a re-render.
  const saveElements = useCallback(async (A4_Elements, PDF_ID, titleRef, deleted, pages = 1, pageSize, meta = {}) => {
    const sorted = sanitizeElementsContent(
      [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
    );
    const elements = [...sorted, ...sanitizeElementsContent(deleted || [])];
    assertCanvasElementRoot(elements);
    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });
    const editor_mode = meta.editorMode === "template" ? "template" : "freeform";
    const template_id = meta.templateId || null;
    const spacing_px = flowSpacingToPayload(meta.flowSpacing);
    const cv_data = meta.cvData || null;
    const expected_revision = requirePdfRevision(meta.expectedRevision);
    try {
      const data = await api.httpRequest(
      ENDPOINTS.PDF.SAVE_ELEMENTS, "PUT",
      JSON.stringify({
        root: elements, pdf_id: PDF_ID, pdf_title: (titleRef.current?.value || "") + ".pdf",
        pages, page_width: pageSize?.width ?? 595, page_height: pageSize?.height ?? 842,
        editor_mode,
        template_id,
        spacing_px,
        cv_data,
        expected_revision,
      }),
      "Autozapis nie powiódł się.");
      const revision = requirePdfRevision(data.revision);
      handlePdfId(data.pdf_id ?? PDF_ID, { revision });
      return data;
    } catch (error) {
      throw localizePdfPersistenceError(error);
    }
  }, [handlePdfId]);

  return {
    createPdf,
    updatePdf,
    downloadPdf,
    saveElements,
    responsePDF,
    isPdfLoading,
    pdfOperation,
    pdfOperationPhase,
  };
}
