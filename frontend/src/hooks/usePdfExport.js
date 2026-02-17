import { useState, useCallback } from 'react';
import { ApiClient } from "../services/api";
import { ENDPOINTS } from "../services/api";

export function usePdfExport(handlePdfId, handleShowModal) {

  const [responsePDF, setResponsePDF] = useState();

  const createPdf = useCallback((A4_ELEMENTS, title) => {

    const sorted = [...A4_ELEMENTS].sort((a, b) => a.zIndex - b.zIndex);

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

    api.httpRequest(ENDPOINTS.PDF.CREATE, "POST", JSON.stringify({root: sorted, pdf_title: title + ".pdf"}), "Failed to create the PDF!").
    then((data) => {handlePdfId(data.pdf_id); setResponsePDF({success: data.message, link:data.link})}).
    catch((error) => setResponsePDF(error)).finally(() => { 
      handleShowModal();
    })

  }, [handlePdfId, handleShowModal]);

  
  const updatePdf = useCallback((A4_ELEMENTS, PDF_ID, title) => {
    
    const sorted = [...A4_ELEMENTS].sort((a, b) => a.zIndex - b.zIndex);

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

    api.httpRequest(ENDPOINTS.PDF.UPDATE, "PUT", JSON.stringify({root: sorted, pdf_id: PDF_ID, pdf_title: title +".pdf"}), "Failed to update the PDF!").
    then((data) => {setResponsePDF({success: data.message})}).
    catch((error) => setResponsePDF(error)).finally(() => { 
      handleShowModal();
    })
  }, [handleShowModal])


  return {createPdf, updatePdf, responsePDF};
}