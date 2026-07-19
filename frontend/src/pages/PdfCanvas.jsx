import DropzoneContainer from '../components/gallery/Dropzone/DropzoneContainer';
import Gallery from '../components/gallery/Gallery/Gallery';
import Sidebar from '../components/editor/Sidebar/Sidebar';
import Topbar from '../components/editor/Topbar/Topbar';
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
import PageControls from '../components/editor/PageControls/PageControls';
import Guides from '../components/canvas/Guides/Guides';
import Connectors from '../components/canvas/Connectors/Connectors';
import TemplatesModal from '../components/modals/TemplatesModal/TemplatesModal';
import AiCvPanel from '../components/ai/AiCvPanel/AiCvPanel';
import AiDeckPanel from '../components/ai/AiDeckPanel/AiDeckPanel';
import AiAssistant from '../components/ai/AiAssistant/AiAssistant';

function PdfCanvas() {

  const navigate = useNavigate();

  //state for rendering Dropzone // changed in Sidebar (upload images), passed via ctx
  const [isDropzone, setIsDropzone] = useState(false);
  //state for rendering the Gallery // changed in Sidebar (upload images), passed via ctx
  const [isGallery, setIsGallery] = useState(false);
  //state for checking user activity via MouseEven // not really a good idea
  const [checkActivity, setIsActive] = useState(false);
  //state for showing the modal with generated PDF's
  const [isModalPdfs, setIsModalPdfs] = useState(false);
  //state for showing the CV templates picker
  const [isTemplates, setIsTemplates] = useState(false);
  //state for showing the AI CV fill panel
  const [isAiPanel, setIsAiPanel] = useState(false);
  //state for showing the AI deck generator panel
  const [isDeckPanel, setIsDeckPanel] = useState(false);
  // state for showing the progress var in Dropzone when IMG is uploaded
  const [valueImageUpload, setValueImageUpload] = useState(0);
  //state for seting the PDF id, used in ModalPdf.jsx
  const [pdfId, setPdfId] = useState(null);
  //FETCHED PDF's
  const [PDFs, setPDFs] = useState([]);
  //the title of the PDF, loadded when pdf loaded
  const titleRef = useRef();

  const [isLoadingState, setIsLoadingState] =useState(false)

  const [modalRequestStatus, setModalRequestStatus] = useState(false);

  const [PDFdownloadData, setPDFdownloadData] = useState([])


  const {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    handleMoveElement,
    handleSelectMoveElement,
    handleAddImage,
    handleAddLine,
    handleAddRectangle,
    handleAddText,
    handleAddTextarea,
    connectMode,
    connectSourceId,
    startConnecting,
    cancelConnecting,
    pickConnectorAt,
    markSelected,
    handleSetTextareaEditing,
    handleSelectElement,
    handleDeleteElement,
    handleDuplicateElement,
    handleAlignElements,
    handleEditElementValues,
    handleMoveElementWithBelow,
    A4ref,
    handleResizeElement,
    handleClearA4,
    handleLoadTemplate,
    handleLoadTemplateWithFill,
    handleLoadAiElements,
    pageCount,
    setPageCount,
    currentPage,
    setCurrentPage,
    addPage,
    removePage,
    goToPage,
    pageSize,
    setPageSize,
    setPagePreset
  } = useA4Elements(titleRef)

 

  const { createPdf, updatePdf, responsePDF, isPdfLoading } = usePdfExport(handlePdfId, handleShowModalRequest, titleRef, A4_Elements_deleted, setA4_Elements_deleted);

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


  // While in connector mode, intercept clicks on the A4 in the capture phase
  // (before any element's own pointerdown) so picking source/target never
  // starts a drag or selection. Geometry-based hit-testing happens in the hook.
  useEffect(() => {
    if (!connectMode) return;
    const node = A4ref.current;
    if (!node) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickConnectorAt(e.clientX, e.clientY);
    };
    node.addEventListener("pointerdown", handler, true);
    return () => node.removeEventListener("pointerdown", handler, true);
  }, [connectMode, pickConnectorAt, A4ref])

  useEffect(() => {
    if (!connectMode) return;
    const onKey = (e) => { if (e.key === "Escape") cancelConnecting(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectMode, cancelConnecting])

  const handleShowDropzone = useCallback(() => {
    setIsDropzone(boolDropzone => !boolDropzone);
  }, [])

  const handleShowTemplates = useCallback(() => {
    setIsTemplates(bool => !bool);
  }, [])

  const handleShowAiPanel = useCallback(() => {
    setIsAiPanel(bool => !bool);
  }, [])

  const handleShowDeckPanel = useCallback(() => {
    setIsDeckPanel(bool => !bool);
  }, [])

  const handleShowGallery = useCallback(() => {
    setIsGallery(boolGallery => !boolGallery);
  }, [])


  const createPdfWithElements = useCallback(() => {
    createPdf(A4_Elements, titleRef, pageCount, pageSize);
  }, [A4_Elements, createPdf, titleRef, pageCount, pageSize]);

  const updatePdfWithElements = useCallback(() => {
    updatePdf(A4_Elements, pdfId, titleRef, A4_Elements_deleted, pageCount, pageSize);
  }, [A4_Elements, pdfId, updatePdf, titleRef, A4_Elements_deleted, pageCount, pageSize]);

  function handlePdfId(pdfId) {
    setPdfId(pdfId)
  }

  const ctxValue = useMemo(() => ({
    //useA4Elements hook
    A4_Elements: A4_Elements,
    addImage: handleAddImage,
    addText: handleAddText,
    addLine: handleAddLine,
    addRectangle: handleAddRectangle,
    addConnector: startConnecting,
    addTextarea: handleAddTextarea,
    markSelected: markSelected,
    setTextareaEditing: handleSetTextareaEditing,
    selectElement: handleSelectElement,
    moveElement: handleMoveElement,
    selectMoveElement: handleSelectMoveElement,
    editElementValues: handleEditElementValues,
    moveElementWithBelow: handleMoveElementWithBelow,
    alignElement: handleAlignElements,
    deleteElement: handleDeleteElement,
    duplicateElement: handleDuplicateElement,
    resizeElement: handleResizeElement,
    setA4_Elements: setA4_Elements,
    setA4_Elements_deleted: setA4_Elements_deleted,
    clearA4: handleClearA4,
    //templates
    isTemplates: isTemplates,
    showTemplates: handleShowTemplates,
    loadTemplate: handleLoadTemplate,
    loadTemplateWithFill: handleLoadTemplateWithFill,
    loadAiElements: handleLoadAiElements,
    //ai panel
    showAiPanel: handleShowAiPanel,
    showDeckPanel: handleShowDeckPanel,
    //page geometry
    pageSize: pageSize,
    setPageSize: setPageSize,
    setPagePreset: setPagePreset,
    //multi-page
    pageCount: pageCount,
    setPageCount: setPageCount,
    currentPage: currentPage,
    setCurrentPage: setCurrentPage,
    addPage: addPage,
    removePage: removePage,
    goToPage: goToPage,
    //usePdfExport hook
    updatePdf: updatePdfWithElements,
    createPdf: createPdfWithElements,
    isPdfLoading: isPdfLoading,
    //state values defined in PdfCanvas.jsx
    isGallery: isGallery,
    showGallery: handleShowGallery,
    isDropzone: isDropzone,
    showDropzone: handleShowDropzone,
    valueImageUpload: valueImageUpload,
    setValueImageUpload: setValueImageUpload,
    isModalPdfs: isModalPdfs,
    setIsModalPdfs: setIsModalPdfs,
    handlePdfId: handlePdfId,
    //ELSE
    showModalRequest: handleShowModalRequest,
    logout: handleLogout,
    PDFs: PDFs,
    setPDFs: setPDFs,
    setPDFdownloadData: setPDFdownloadData,
    PDFdownloadData: PDFdownloadData
  }), [
    A4_Elements,
    isGallery, isDropzone, valueImageUpload,
    isModalPdfs, handleAddImage,
    handleAddText, handleAddLine, handleAddRectangle, startConnecting, handleSelectElement,
    handleMoveElement, handleSelectMoveElement, createPdfWithElements,
    handleShowDropzone, handleShowGallery, handleEditElementValues,
    handleAlignElements, handleDeleteElement, setA4_Elements,
    setValueImageUpload, setIsModalPdfs, handleResizeElement, 
    updatePdfWithElements, handlePdfId, 
    handleClearA4, handleShowModalRequest, handleLogout, PDFs, setPDFs,
    pageCount, currentPage, addPage, removePage, goToPage, setPageCount, setCurrentPage,
    handleAddTextarea, markSelected, handleSetTextareaEditing, handleDuplicateElement,
    isTemplates, handleShowTemplates, handleLoadTemplate, handleLoadTemplateWithFill, handleLoadAiElements, handleMoveElementWithBelow, handleShowAiPanel,
    handleShowDeckPanel, pageSize, setPageSize, setPagePreset,
  ])

  console.log(A4_Elements);
  console.log(A4_Elements_deleted);


  return (
    <main className='main-container' onMouseMove={throttledHandleIsActive} style={connectMode ? { cursor: "crosshair" } : undefined}>

      {connectMode && (
        <div style={{ position: "fixed", top: 62, left: "50%", transform: "translateX(-50%)", zIndex: 5000,
                      background: "var(--accent)", color: "#fff", padding: "8px 16px", borderRadius: 999,
                      font: "700 13px var(--font-body)", boxShadow: "var(--shadow-pop)", pointerEvents: "none" }}>
          {connectSourceId ? "Click the target element  ·  Esc to cancel" : "Click the source element  ·  Esc to cancel"}
        </div>
      )}

      <PdfContext.Provider value={ctxValue}>
        <ModalPdfs title={titleRef}/>
        <ModalPdfRequestStatus open={modalRequestStatus} message={responsePDF} />
        <TemplatesModal />
        <Sidebar>
          <AnimatePresence>{isDropzone && <DropzoneContainer />}</AnimatePresence>
          {isAiPanel && (
            <div style={{ position: "absolute", left: "100%", top: 0, width: 320, background: "#fff", borderLeft: "1px solid var(--border-line)", borderRight: "1px solid var(--border-line)", height: "100%", overflowY: "auto", zIndex: 1100, boxShadow: "4px 0 16px rgba(30,48,78,.10)" }}>
              <AiCvPanel onClose={handleShowAiPanel} />
            </div>
          )}
          {isDeckPanel && (
            <div style={{ position: "absolute", left: "100%", top: 0, width: 340, background: "#fff", borderLeft: "1px solid var(--border-line)", borderRight: "1px solid var(--border-line)", height: "100%", overflowY: "auto", zIndex: 1100, boxShadow: "4px 0 16px rgba(30,48,78,.10)" }}>
              <AiDeckPanel onClose={handleShowDeckPanel} />
            </div>
          )}
          <Editor />
        </Sidebar>
        <div className="right-pane">
          <Topbar titleRef={titleRef} />
          <div className="canvas-area">
            <A4 width={`${pageSize.width}px`} height={`${pageSize.height}px`} ref={A4ref}>
              {isPdfLoading && <Spinner loading={isPdfLoading}/>}
              <CanvasElements elements={A4_Elements.filter(element => (element.page ?? 1) === currentPage)} />
              <Connectors />
              <Guides />
            </A4>
          </div>
        </div>
       <PageControls />
       <Gallery />
       <AiAssistant />
      </PdfContext.Provider>
    </main>
  )
}

export default PdfCanvas;