import { useState, useCallback } from 'react';
import { ApiClient } from "../services/api";
import { ENDPOINTS } from "../services/api";

export function usePdfExport(handlePdfId, handleShowModal, titleRef, A4_Elements_deleted) {

  const [responsePDF, setResponsePDF] = useState();
  const [isPdfLoading, setIsPdfLoading] = useState(false);


  const createPdf = useCallback((A4_Elements, titleRef) => {

    setIsPdfLoading(true);

    const sorted = [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex);

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

    api.httpRequest(ENDPOINTS.PDF.CREATE, "POST", JSON.stringify({root: sorted, pdf_title: titleRef.current.value + ".pdf"}), "Failed to create the PDF!").
    then((data) => {handlePdfId(data.pdf_id); setResponsePDF({success: data.message, link:data.link})}).
    catch((error) => setResponsePDF(error)).finally(() => { 
      handleShowModal();
      setIsPdfLoading(false);
    })

  }, [handlePdfId, handleShowModal, titleRef]);

  
  const updatePdf = useCallback((A4_Elements, PDF_ID, titleRef, A4_Elements_deleted) => {
    
    setIsPdfLoading(true);

    const sorted = [...A4_Elements].sort((a, b) => a.zIndex - b.zIndex);

    const elements = [...sorted, ...A4_Elements_deleted];
    console.log(elements);

    const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

    api.httpRequest(ENDPOINTS.PDF.UPDATE, "PUT", JSON.stringify({root: elements, pdf_id: PDF_ID, pdf_title: titleRef.current.value +".pdf"}), "Failed to update the PDF!").
    then((data) => {setResponsePDF({success: data.message})}).
    catch((error) => setResponsePDF(error)).finally(() => { 
      handleShowModal();
      setIsPdfLoading(false);
    })
  }, [handleShowModal, titleRef, A4_Elements_deleted])


  return {createPdf, updatePdf, responsePDF, isPdfLoading};
}