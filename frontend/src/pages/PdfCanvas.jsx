import DropzoneContainer from '../components/gallery/Dropzone/DropzoneContainer';
import Gallery from '../components/gallery/Gallery/Gallery';
import Sidebar from '../components/editor/Sidebar/Sidebar';
import A4 from "../components/canvas/A4/A4";
import Editor from '../components/editor/Editor/Editor';
import { PdfContext } from '../store/pdfgenerator-context';
import { useState, useEffect, useMemo, useCallback} from 'react';
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
  //state for giving the PDF a title
  const [title, setTitle] = useState("");

  const [isLoadingState, setIsLoadingState] =useState(false)

  const [modalRequestStatus, setModalRequestStatus] = useState(false);


  const {
    A4_ELEMENTS,
    handleMoveElement,
    handleSelectMoveElement,
    handleAddImage,
    handleAddLine,
    handleAddText,
    handleSelectElement,
    handleDeleteElement,
    handleAlignElements,
    handleEditElementValues,
    setA4_Elements,
    A4ref,
    PDFTitle,
    handleResizeElement,
    handleClearA4modalDelete,
    handleClearA4
  } = useA4Elements()

  const { createPdf, updatePdf, responsePDF, isPdfLoading } = usePdfExport(handlePdfId, handleShowModalRequest);

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
    createPdf(A4_ELEMENTS, title);
  }, [A4_ELEMENTS, createPdf, title]);

  const updatePdfWithElements = useCallback(() => {
    updatePdf(A4_ELEMENTS, pdfId, title);
  }, [A4_ELEMENTS, pdfId, updatePdf, title]);

  function handlePdfId(pdfId) {
    setPdfId(pdfId)
  }

  //linking context to state
  const ctxValue = useMemo(() => ({
    A4_Elements: A4_ELEMENTS,
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
    progressValue: value,
    setValue: setValue,
    addTitle: PDFTitle,
    isVisibleModal: isVisible,
    setIsVisibleModal: setIsVisible,
    resizeElement: handleResizeElement,
    updatePdf: updatePdfWithElements,
    handlePdfId: handlePdfId,
    handleSetTitle: setTitle,
    title: title,
    clearA4modalDelete: handleClearA4modalDelete,
    clearA4: handleClearA4,
    showModalRequest: handleShowModalRequest,
    logout: handleLogout,
    isPdfLoading: isPdfLoading,
  }), [
    A4_ELEMENTS,
    isGallery, isDropzone, value,
    isVisible, title, handleAddImage,
    handleAddText, handleAddLine, handleSelectElement,
    handleMoveElement, handleSelectMoveElement, createPdfWithElements,
    handleShowDropzone, handleShowGallery, handleEditElementValues,
    handleAlignElements, handleDeleteElement, setA4_Elements,
    setValue, PDFTitle, setIsVisible, handleResizeElement, 
    updatePdfWithElements, handlePdfId, setTitle, handleClearA4modalDelete, 
    handleClearA4, handleShowModalRequest, handleLogout
  ])


  return (
    <main className='main-container' onMouseMove={throttledHandleIsActive}>
      {/** providing the context, value prop is necessery to consume the context (use, useContext) */}
      <PdfContext.Provider value={ctxValue}>
        <ModalPdfs />
        <ModalPdfRequestStatus open={modalRequestStatus} message={responsePDF} />
        <Sidebar>
          <AnimatePresence>{isDropzone && <DropzoneContainer />}</AnimatePresence>
          
          <Editor />
        </Sidebar>
        <A4 width="595px" height="842px" ref={A4ref}>
          {isPdfLoading && <Spinner loading={isPdfLoading}/>}
          <CanvasElements elements={A4_ELEMENTS} />
        </A4>
        <AnimatePresence> {isGallery && <Gallery />} </AnimatePresence>
      </PdfContext.Provider>
    </main>
  )
}

export default PdfCanvas;