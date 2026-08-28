import { useState, useCallback } from 'react';
import { ApiClient, ENDPOINTS, wakeBackend } from "../services/api";
import { sanitizeElementsContent } from "../utils/sanitizeTextContent";
import { assertCanvasElementRoot } from "../utils/canvasElementSchema";
import { flowSpacingToPayload } from "../utils/flowSpacing";
import { resolveBrowserTextLayouts } from "../utils/browserTextLayout";

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
 * @param {Function} handlePdfId - Stores the active document id after create.
 * @param {Function} handleShowModal - Opens the save/download result UI.
 * @param {React.RefObject} titleRef - Title input; `.pdf` is appended for storage.
 * @param {Array} A4_Elements_deleted - Soft-deleted rows still sent on update.
 * @param {Function} setA4_Elements_deleted - Cleared after a successful write.
 */
export function usePdfExport(handlePdfId, handleShowModal, titleRef, A4_Elements_deleted, setA4_Elements_deleted) {

  const [responsePDF, setResponsePDF] = useState();
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  // Keep the loading state up for at least this long so a fast request still
  // shows the spinner (otherwise it can flash by before it's ever painted).
  const MIN_SPINNER_MS = 650;


  const createPdf = useCallback((A4_Elements, titleRef, pages = 1, pageSize, meta = {}) => {

    setIsPdfLoading(true);
    const startedAt = Date.now();

    // Strip NULL/NBSP junk before the request so even an older backend
    // cannot bake missing-glyph boxes into the exported PDF.
    const sorted = sanitizeElementsContent(
      [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
    );
    try {
      assertCanvasElementRoot(sorted);
    } catch (error) {
      setResponsePDF(error);
      setIsPdfLoading(false);
      handleShowModal();
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
    resolveBrowserTextLayouts(sorted)
      .then((renderRoot) => {
        const body = JSON.stringify({
          root: renderRoot,
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
        return wakeBackend().then(() => api.httpRequest(
        ENDPOINTS.PDF.CREATE,
        "POST",
        body,
        "Nie udało się utworzyć PDF!",
        { retries: 2, timeoutMs: 120_000 },
        ));
      })
      .then((data) => {
        handlePdfId(data.pdf_id);
        setResponsePDF({
          success: data.created,
          link: data.link,
          pdf_id: data.pdf_id,
          intent: "save",
        });
      })
      .catch((error) => setResponsePDF(error))
      .finally(() => {
        setTimeout(() => {
          handleShowModal();
          setIsPdfLoading(false);
          setA4_Elements_deleted([]);
        }, Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt)));
      });
  }, [handlePdfId, handleShowModal, titleRef, setA4_Elements_deleted]);

  
  const updatePdf = useCallback((A4_Elements, PDF_ID, titleRef, A4_Elements_deleted, pages = 1, pageSize, meta = {}) => {

    setIsPdfLoading(true);
    const startedAt = Date.now();

    const sorted = sanitizeElementsContent(
      [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
    );
    const elements = [...sorted, ...sanitizeElementsContent(A4_Elements_deleted)];
    try {
      assertCanvasElementRoot(elements);
    } catch (error) {
      setResponsePDF(error);
      setIsPdfLoading(false);
      handleShowModal();
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
    resolveBrowserTextLayouts(sorted)
      .then((renderRoot) => {
        const body = JSON.stringify({
          root: [...renderRoot, ...sanitizeElementsContent(A4_Elements_deleted)],
          pdf_id: PDF_ID,
          pdf_title: titleRef.current.value +".pdf",
          pages,
          page_width: pageSize?.width ?? 595,
          page_height: pageSize?.height ?? 842,
          editor_mode,
          template_id,
          spacing_px,
          cv_data,
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
        setResponsePDF({
          success: data.updated,
          link: data.link,
          pdf_id: data.pdf_id,
          intent,
        });
      })
      .catch((error) => setResponsePDF(error))
      .finally(() => {
        setTimeout(() => {
          handleShowModal();
          setIsPdfLoading(false);
          setA4_Elements_deleted([]);
        }, Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt)));
      });
  }, [handleShowModal, titleRef, setA4_Elements_deleted])


  // Render-on-demand download: render the current canvas to a PDF and return a
  // one-shot object URL, WITHOUT creating or updating a "Moje dokumenty" row.
  // This is what makes "Pobierz" independent of "Zapisz" — an unsaved document
  // can still be exported. The backend still meters every export, so a blocked
  // free-plan quota rejects here exactly like a stored-file download.
  const downloadPdf = useCallback(async (A4_Elements, titleRef, pages = 1, pageSize, meta = {}) => {
    setIsPdfLoading(true);
    const startedAt = Date.now();
    try {
      const sorted = sanitizeElementsContent(
        [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
      );
      // Reuse the same schema guard as create/update so a malformed canvas
      // fails fast with a readable error instead of a 422 from the server.
      assertCanvasElementRoot(sorted);

      const renderRoot = await resolveBrowserTextLayouts(sorted);
      const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });
      const editor_mode = meta.editorMode === "template" ? "template" : "freeform";
      const template_id = meta.templateId || null;
      const spacing_px = flowSpacingToPayload(meta.flowSpacing);
      const baseTitle = titleRef.current?.value || "cv";
      const body = JSON.stringify({
        root: renderRoot,
        pdf_title: baseTitle + ".pdf",
        pages,
        page_width: pageSize?.width ?? 595,
        page_height: pageSize?.height ?? 842,
        editor_mode,
        template_id,
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
      window.setTimeout(() => setIsPdfLoading(false), remaining);
    }
  }, []);


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
    await api.httpRequest(
      ENDPOINTS.PDF.SAVE_ELEMENTS, "PUT",
      JSON.stringify({
        root: elements, pdf_id: PDF_ID, pdf_title: (titleRef.current?.value || "") + ".pdf",
        pages, page_width: pageSize?.width ?? 595, page_height: pageSize?.height ?? 842,
        editor_mode,
        template_id,
        spacing_px,
        cv_data,
      }),
      "Autozapis nie powiódł się.");
  }, []);

  return {createPdf, updatePdf, downloadPdf, saveElements, responsePDF, isPdfLoading};
}
