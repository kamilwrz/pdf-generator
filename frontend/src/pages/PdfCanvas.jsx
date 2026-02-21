import DropzoneContainer from '../components/gallery/Dropzone/DropzoneContainer';
import Gallery from '../components/gallery/Gallery/Gallery';
import Sidebar from '../components/editor/Sidebar/Sidebar';
import A4 from "../components/canvas/A4/A4";
import Editor from '../components/editor/Editor/Editor';
import { PdfContext } from '../store/pdfgenerator-context';
import { useState, useEffect, useMemo, useCallback, useRef} from 'react';
import { useA4Elements } from "../hooks/useA4Elements";
import { usePdfExport } from '../hooks/usePdfExport';
import CanvasElements from "../components/canvas/CanvasElements/CanvasElements";
import { useNavigate } from 'react-router-dom';
import ModalPdfs from '../components/modals/ModalPdfs/ModalPdfs';
import ModalPdfRequestStatus from '../components/modals/ModalPdfRequestStatus/ModalPdfRequestStatus';
import { ApiClient } from '../services/api';
import { ENDPOINTS } from '../services/api';
import Spinner from '../components/common/Spinner/Spinner';
import { AnimatePresence } from "framer-motion";

function PdfCanvas() {

  const navigate = useNavigate();

  //state for rendering Dropzone // changed in Sidebar (upload images), passed via ctx
  const [isDropzone, setIsDropzone] = useState(false);
  //state for rendering the Gallery
  const [isGallery, setIsGallery] = useState(false);
  //state for checking user activity via MouseEven
  const [checkActivity, setIsActive] = useState(false);
  //state for showing the modal with generated PDF's
  const [isVisible, setIsVisible] = useState(false);
  // state for showing the progress var in Dropzone when IMG is uploaded
  const [value, setValue] = useState(0);
  //state for seting the PDF id, used in ModalPdf.jsx
  const [pdfId, setPdfId] = useState(null);

  const titleRef = useRef();

  const [isLoadingState, setIsLoadingState] =useState(false)

  const [modalRequestStatus, setModalRequestStatus] = useState(false);


  const {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    handleMoveElement,
    handleSelectMoveElement,
    handleAddImage,
    handleAddLine,
    handleAddText,
    handleSelectElement,
    handleDeleteElement,
    handleAlignElements,
    handleEditElementValues,
    A4ref,
    handleResizeElement,
    handleClearA4
  } = useA4Elements(titleRef)

 

  const { createPdf, updatePdf, responsePDF, isPdfLoading } = usePdfExport(handlePdfId, handleShowModalRequest, titleRef);

  function handleShowModalRequest() {
    setModalRequestStatus(bool => !bool);
    setIsLoadingState(bool => !bool);
  }

  function handleLogout() {
    localStorage.removeItem("token")
    navigate("/")
  }


  //TOKEN EXPIRATION SINGLE PAGE APP PROBLEM (NO ROUTES)
  function handleIsActive() {
    setIsActive(active => !active)
  }
  const throttledHandleIsActive = useMemo(() => {
    let lastCall = 0;
    const throttleMs = 30000; // 30 seconds

    return () => {
      const now = Date.now();
      if (now - lastCall >= throttleMs) {
        lastCall = now;
        handleIsActive();
      }
    };
  }, []);

  useEffect(() => {

    const api = new ApiClient();
    api.httpRequest(ENDPOINTS.AUTH.TOKEN + localStorage.getItem("token"), "GET", null, "Token not successfull verified!").
      catch((error) => {
        console.log(error);
        localStorage.removeItem("token");
        navigate("/");
      })

  }, [checkActivity])


  const handleShowDropzone = useCallback(() => {
    setIsDropzone(boolDropzone => !boolDropzone);
  }, [])

  const handleShowGallery = useCallback(() => {
    setIsGallery(boolGallery => !boolGallery);
  }, [])


  const createPdfWithElements = useCallback(() => {
    createPdf(A4_Elements, titleRef);
  }, [A4_Elements, createPdf, titleRef, setA4_Elements_deleted]);

  const updatePdfWithElements = useCallback(() => {
    updatePdf(A4_Elements, pdfId, titleRef, A4_Elements_deleted, setA4_Elements_deleted);
  }, [A4_Elements, pdfId, updatePdf, titleRef, A4_Elements_deleted, setA4_Elements_deleted]);

  function handlePdfId(pdfId) {
    setPdfId(pdfId)
  }

  const ctxValue = useMemo(() => ({
    A4_Elements: A4_Elements,
    addImage: handleAddImage,
    addText: handleAddText,
    addLine: handleAddLine,
    selectElement: handleSelectElement,
    moveElement: handleMoveElement,
    selectMoveElement: handleSelectMoveElement,
    isGallery: isGallery,
    isDropzone: isDropzone,
    createPdf: createPdfWithElements,
    showDropzone: handleShowDropzone,
    showGallery: handleShowGallery,
    editElementValues: handleEditElementValues,
    alignElement: handleAlignElements,
    deleteElement: handleDeleteElement,
    setA4_Elements: setA4_Elements,
    setA4_Elements_deleted: setA4_Elements_deleted,
    progressValue: value,
    setValue: setValue,
    isVisibleModal: isVisible,
    setIsVisibleModal: setIsVisible,
    resizeElement: handleResizeElement,
    updatePdf: updatePdfWithElements,
    handlePdfId: handlePdfId,
    clearA4: handleClearA4,
    showModalRequest: handleShowModalRequest,
    logout: handleLogout,
    isPdfLoading: isPdfLoading,
  }), [
    A4_Elements,
    isGallery, isDropzone, value,
    isVisible, handleAddImage,
    handleAddText, handleAddLine, handleSelectElement,
    handleMoveElement, handleSelectMoveElement, createPdfWithElements,
    handleShowDropzone, handleShowGallery, handleEditElementValues,
    handleAlignElements, handleDeleteElement, setA4_Elements,
    setValue, , setIsVisible, handleResizeElement, 
    updatePdfWithElements, handlePdfId, 
    handleClearA4, handleShowModalRequest, handleLogout
  ])

  console.log(A4_Elements);
  console.log(A4_Elements_deleted);


  return (
    <main className='main-container' onMouseMove={throttledHandleIsActive}>
    
      <PdfContext.Provider value={ctxValue}>
        <ModalPdfs title={titleRef}/>
        <ModalPdfRequestStatus open={modalRequestStatus} message={responsePDF} />
        <Sidebar ref={titleRef}>
          <AnimatePresence>{isDropzone && <DropzoneContainer />}</AnimatePresence>
          
          <Editor />
        </Sidebar>
        <A4 width="595px" height="842px" ref={A4ref}>
          {isPdfLoading && <Spinner loading={isPdfLoading}/>}
          <CanvasElements elements={A4_Elements} />
        </A4>
        <AnimatePresence> {isGallery && <Gallery />} </AnimatePresence>
      </PdfContext.Provider>
    </main>
  )
}

export default PdfCanvas;