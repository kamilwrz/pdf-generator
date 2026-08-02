import { useState, useCallback } from 'react';
import { ApiClient } from "../services/api";
import { ENDPOINTS } from "../services/api";
import { sanitizeElementsContent } from "../utils/sanitizeTextContent";
import { assertCanvasElementRoot } from "../utils/canvasElementSchema";

/**
 * PDF create / update / autosave against the backend.
 *
 * Create and update trigger a full ReportLab render on the server.
 * `saveElements` persists canvas rows only (debounced autosave) without
 * regenerating the downloadable file.
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


  const createPdf = useCallback((A4_Elements, titleRef, pages = 1, pageSize) => {

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

    api.httpRequest(ENDPOINTS.PDF.CREATE, "POST", JSON.stringify({root: sorted, pdf_title: titleRef.current.value + ".pdf", pages, page_width: pageSize?.width ?? 595, page_height: pageSize?.height ?? 842}), "Nie udało się utworzyć PDF!").
    then((data) => {handlePdfId(data.pdf_id); setResponsePDF({success: data.created, link:data.link, pdf_id:data.pdf_id, intent: "save"})}).
    catch((error) => setResponsePDF(error)).finally(() => {
      setTimeout(() => {
        handleShowModal();
        setIsPdfLoading(false);
        setA4_Elements_deleted([]);
      }, Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt)));
    });
  }, [handlePdfId, handleShowModal, titleRef]);

  
  const updatePdf = useCallback((A4_Elements, PDF_ID, titleRef, A4_Elements_deleted, pages = 1, pageSize) => {

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

    api.httpRequest(ENDPOINTS.PDF.UPDATE, "PUT", JSON.stringify({root: elements, pdf_id: PDF_ID, pdf_title: titleRef.current.value +".pdf", pages, page_width: pageSize?.width ?? 595, page_height: pageSize?.height ?? 842}), "Nie udało się zaktualizować PDF!").
    then((data) => {setResponsePDF({success: data.updated, link: data.link, pdf_id: data.pdf_id, intent: "download"})}).
    catch((error) => setResponsePDF(error)).finally(() => {
      setTimeout(() => {
        handleShowModal();
        setIsPdfLoading(false);
        setA4_Elements_deleted([]);
      }, Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt)));
    });
  }, [handleShowModal, titleRef, A4_Elements_deleted])


  // Lightweight autosave: persist canvas elements + geometry only (no PDF
  // render, no S3). Fire-and-report; caller debounces and gates on a saved id.
  const saveElements = useCallback(async (A4_Elements, PDF_ID, titleRef, deleted, pages = 1, pageSize) => {
    const sorted = sanitizeElementsContent(
      [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex),
    );
    const elements = [...sorted, ...sanitizeElementsContent(deleted || [])];
    assertCanvasElementRoot(elements);
    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });
    await api.httpRequest(
      ENDPOINTS.PDF.SAVE_ELEMENTS, "PUT",
      JSON.stringify({
        root: elements, pdf_id: PDF_ID, pdf_title: (titleRef.current?.value || "") + ".pdf",
        pages, page_width: pageSize?.width ?? 595, page_height: pageSize?.height ?? 842,
      }),
      "Autozapis nie powiódł się.");
  }, []);

  return {createPdf, updatePdf, saveElements, responsePDF, isPdfLoading};
}