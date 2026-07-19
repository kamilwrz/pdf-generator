import { useState, useCallback } from 'react';
import { ApiClient } from "../services/api";
import { ENDPOINTS } from "../services/api";

export function usePdfExport(handlePdfId, handleShowModal, titleRef, A4_Elements_deleted, setA4_Elements_deleted) {

  const [responsePDF, setResponsePDF] = useState();
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  // Keep the loading state up for at least this long so a fast request still
  // shows the spinner (otherwise it can flash by before it's ever painted).
  const MIN_SPINNER_MS = 650;


  const createPdf = useCallback((A4_Elements, titleRef, pages = 1, pageSize) => {

    setIsPdfLoading(true);
    const startedAt = Date.now();

    const sorted = [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex);

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

    api.httpRequest(ENDPOINTS.PDF.CREATE, "POST", JSON.stringify({root: sorted, pdf_title: titleRef.current.value + ".pdf", pages, page_width: pageSize?.width ?? 595, page_height: pageSize?.height ?? 842}), "Failed to create the PDF!").
    then((data) => {handlePdfId(data.pdf_id); setResponsePDF({success: data.created, link:data.link, pdf_id:data.pdf_id})}).
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

    const sorted = [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex);

    const elements = [...sorted, ...A4_Elements_deleted];

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

    api.httpRequest(ENDPOINTS.PDF.UPDATE, "PUT", JSON.stringify({root: elements, pdf_id: PDF_ID, pdf_title: titleRef.current.value +".pdf", pages, page_width: pageSize?.width ?? 595, page_height: pageSize?.height ?? 842}), "Failed to update the PDF!").
    then((data) => {setResponsePDF({success: data.updated, link: data.link, pdf_id: data.pdf_id})}).
    catch((error) => setResponsePDF(error)).finally(() => {
      setTimeout(() => {
        handleShowModal();
        setIsPdfLoading(false);
        setA4_Elements_deleted([]);
      }, Math.max(0, MIN_SPINNER_MS - (Date.now() - startedAt)));
    });
  }, [handleShowModal, titleRef, A4_Elements_deleted])


  return {createPdf, updatePdf, responsePDF, isPdfLoading};
}