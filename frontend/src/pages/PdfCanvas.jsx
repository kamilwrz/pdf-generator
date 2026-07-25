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
import SelectionOverlay from "../components/canvas/SelectionOverlay/SelectionOverlay";
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
import AiArticlePanel from '../components/ai/AiArticlePanel/AiArticlePanel';
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
  //state for showing the AI article generator panel
  const [isArticlePanel, setIsArticlePanel] = useState(false);
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
  // Layout suggestions are rendered here before acceptance, so previewing a
  // correction never mutates the saved document state.
  const [layoutPreviewPatches, setLayoutPreviewPatches] = useState([]);


  const {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    handleMoveElement,
    handleMoveSelectedElements,
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
    handleDeleteSelectedElements,
    handleDuplicateElement,
    handleDuplicateSelectedElements,
    handleAlignElements,
    handleEditElementValues,
    handleEditSelectedElementValues,
    fitTextareaToContent: handleFitTextareaToContent,
    applyLayoutPatches,
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
    clonePage,
    movePage,
    pageSize,
    setPageSize,
    setPagePreset,
    zoom,
    zoomIn,
    zoomOut,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory
  } = useA4Elements(titleRef)



  const { createPdf, updatePdf, saveElements, responsePDF, isPdfLoading } = usePdfExport(handlePdfId, handleShowModalRequest, titleRef, A4_Elements_deleted, setA4_Elements_deleted);
  const autosaveTimerRef = useRef(null);
  const autosaveQueueRef = useRef(Promise.resolve());

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
    api.httpRequest(ENDPOINTS.AUTH.TOKEN + localStorage.getItem("token"), "GET", null, "Weryfikacja tokenu nie powiodła się!").
      catch((error) => {
        console.log(error);
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("token");
          navigate("/");
        }
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

  // Ctrl/Cmd+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo. Bail out when focus is in
  // an editable field so the browser's native TEXT undo wins inside a textbox.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      const editable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (editable) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo])

  // Every save captures a document-specific snapshot and runs after earlier
  // saves. This prevents a slower, older request from overwriting newer canvas
  // data or from clearing a deletion queued for another document.
  const enqueueAutosave = useCallback((snapshot) => {
    const persistSnapshot = async () => {
      await saveElements(
        snapshot.elements,
        snapshot.pdfId,
        titleRef,
        snapshot.deleted,
        snapshot.pageCount,
        snapshot.pageSize,
      );

      const savedDeletionIds = new Set(snapshot.deleted.map((element) => element.element_id));
      if (savedDeletionIds.size > 0) {
        setA4_Elements_deleted((current) => current.filter(
          (element) => !savedDeletionIds.has(element.element_id)
        ));
      }
    };

    const queuedSave = autosaveQueueRef.current.then(persistSnapshot, persistSnapshot);
    // Keep the queue usable after a failed request. The caller still receives
    // the rejection from `queuedSave`, while the next save is allowed to run.
    autosaveQueueRef.current = queuedSave.catch(() => {});
    return queuedSave;
  }, [saveElements, setA4_Elements_deleted, titleRef]);

  const flushAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (pdfId == null || isPdfLoading) return;

    await enqueueAutosave({
      elements: A4_Elements,
      pdfId,
      deleted: A4_Elements_deleted,
      pageCount,
      pageSize,
    });
  }, [
    A4_Elements,
    A4_Elements_deleted,
    enqueueAutosave,
    isPdfLoading,
    pageCount,
    pageSize,
    pdfId,
  ]);

  // Lightweight autosave: 2s after edits settle, persist canvas elements only
  // (no PDF render). Runs only once the document has been saved (has a pdfId).
  useEffect(() => {
    if (pdfId == null || isPdfLoading) return;
    const snapshot = {
      elements: A4_Elements,
      pdfId,
      deleted: A4_Elements_deleted,
      pageCount,
      pageSize,
    };
    const timer = setTimeout(() => {
      autosaveTimerRef.current = null;
      enqueueAutosave(snapshot).catch((error) => {
        console.error("Autozapis nie powiódł się.", error);
      });
    }, 2000);
    autosaveTimerRef.current = timer;

    return () => {
      clearTimeout(timer);
      if (autosaveTimerRef.current === timer) {
        autosaveTimerRef.current = null;
      }
    };
  }, [A4_Elements, A4_Elements_deleted, enqueueAutosave, isPdfLoading, pageCount, pageSize, pdfId])

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

  const handleShowArticlePanel = useCallback(() => {
    setIsArticlePanel(bool => !bool);
  }, [])

  const handleShowGallery = useCallback(() => {
    setIsGallery(boolGallery => !boolGallery);
  }, [])


  const createPdfWithElements = useCallback(() => {
    createPdf(A4_Elements, titleRef, pageCount, pageSize);
  }, [A4_Elements, createPdf, titleRef, pageCount, pageSize]);

  const previewedElements = useMemo(() => {
    if (layoutPreviewPatches.length === 0) return A4_Elements;

    const patchesById = new Map(
      layoutPreviewPatches.map(patch => [patch.element_id, patch])
    );
    return A4_Elements.map(element => {
      const patch = patchesById.get(element.element_id);
      return {
        ...element,
        isSelected: false,
        isMove: false,
        isEditing: false,
        left: Number.isFinite(patch?.left) ? patch.left : element.left,
        top: Number.isFinite(patch?.top) ? patch.top : element.top,
      };
    });
  }, [A4_Elements, layoutPreviewPatches]);

  const updatePdfWithElements = useCallback(() => {
    updatePdf(A4_Elements, pdfId, titleRef, A4_Elements_deleted, pageCount, pageSize);
  }, [A4_Elements, pdfId, updatePdf, titleRef, A4_Elements_deleted, pageCount, pageSize]);

  function handlePdfId(pdfId) {
    setPdfId(pdfId)
  }

  // Loading a template / AI doc / clearing starts a fresh, unsaved document.
  // Flush first so switching away never drops edits from the currently open PDF.
  const startFreshDocument = useCallback(async (loadDocument) => {
    try {
      await flushAutosave();
      setPdfId(null);
      loadDocument();
    } catch (error) {
      console.error("Nie można rozpocząć nowego dokumentu: autozapis nie powiódł się.", error);
    }
  }, [flushAutosave]);

  const loadTemplateFresh = useCallback(
    (...args) => startFreshDocument(() => handleLoadTemplate(...args)),
    [handleLoadTemplate, startFreshDocument],
  );
  const loadTemplateWithFillFresh = useCallback(
    (...args) => startFreshDocument(() => handleLoadTemplateWithFill(...args)),
    [handleLoadTemplateWithFill, startFreshDocument],
  );
  const loadAiElementsFresh = useCallback(
    (...args) => startFreshDocument(() => handleLoadAiElements(...args)),
    [handleLoadAiElements, startFreshDocument],
  );
  const clearA4Fresh = useCallback(
    () => startFreshDocument(handleClearA4),
    [handleClearA4, startFreshDocument],
  );
  // A successful delete must clear the local canvas without attempting to
  // autosave the PDF row that has just been removed from the server.
  const discardActiveDocument = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setPdfId(null);
    handleClearA4();
  }, [handleClearA4]);

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
    moveSelectedElements: handleMoveSelectedElements,
    selectMoveElement: handleSelectMoveElement,
    editElementValues: handleEditElementValues,
    editSelectedElementValues: handleEditSelectedElementValues,
    fitTextareaToContent: handleFitTextareaToContent,
    applyLayoutPatches: applyLayoutPatches,
    moveElementWithBelow: handleMoveElementWithBelow,
    alignElement: handleAlignElements,
    deleteElement: handleDeleteElement,
    deleteSelectedElements: handleDeleteSelectedElements,
    duplicateElement: handleDuplicateElement,
    duplicateSelectedElements: handleDuplicateSelectedElements,
    resizeElement: handleResizeElement,
    setA4_Elements: setA4_Elements,
    setA4_Elements_deleted: setA4_Elements_deleted,
    activePdfId: pdfId,
    flushAutosave,
    discardActiveDocument,
    clearA4: clearA4Fresh,
    //templates
    isTemplates: isTemplates,
    showTemplates: handleShowTemplates,
    loadTemplate: loadTemplateFresh,
    loadTemplateWithFill: loadTemplateWithFillFresh,
    loadAiElements: loadAiElementsFresh,
    //ai panel
    showAiPanel: handleShowAiPanel,
    showDeckPanel: handleShowDeckPanel,
    showArticlePanel: handleShowArticlePanel,
    //page geometry
    pageSize: pageSize,
    setPageSize: setPageSize,
    setPagePreset: setPagePreset,
    //zoom (view-only)
    zoom: zoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    //multi-page
    pageCount: pageCount,
    setPageCount: setPageCount,
    currentPage: currentPage,
    setCurrentPage: setCurrentPage,
    addPage: addPage,
    removePage: removePage,
    goToPage: goToPage,
    clonePage: clonePage,
    movePage: movePage,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    resetHistory: resetHistory,
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
    PDFdownloadData: PDFdownloadData,
    layoutPreviewPatches: layoutPreviewPatches,
    setLayoutPreviewPatches: setLayoutPreviewPatches,
  }), [
    A4_Elements,
    isGallery, isDropzone, valueImageUpload,
    isModalPdfs, handleAddImage,
    handleAddText, handleAddLine, handleAddRectangle, startConnecting, handleSelectElement,
    handleMoveElement, handleMoveSelectedElements, handleSelectMoveElement, createPdfWithElements,
    handleShowDropzone, handleShowGallery, handleEditElementValues, handleEditSelectedElementValues, handleFitTextareaToContent, applyLayoutPatches,
    handleAlignElements, handleDeleteElement, handleDeleteSelectedElements, handleDuplicateSelectedElements, setA4_Elements,
    setValueImageUpload, setIsModalPdfs, handleResizeElement, 
    updatePdfWithElements, handlePdfId, 
    clearA4Fresh, discardActiveDocument, flushAutosave, loadTemplateFresh, loadTemplateWithFillFresh, loadAiElementsFresh,
    handleShowModalRequest, handleLogout, PDFs, setPDFs,
    pageCount, currentPage, addPage, removePage, goToPage, clonePage, movePage, setPageCount, setCurrentPage,
    handleAddTextarea, markSelected, handleSetTextareaEditing, handleDuplicateElement,
    isTemplates, handleShowTemplates, handleMoveElementWithBelow, handleShowAiPanel,
    handleShowDeckPanel, handleShowArticlePanel, pageSize, setPageSize, setPagePreset,
    zoom, zoomIn, zoomOut,
    undo, redo, canUndo, canRedo, resetHistory,
    layoutPreviewPatches,
  ])

  console.log(A4_Elements);
  console.log(A4_Elements_deleted);


  return (
    <main className='main-container' onMouseMove={throttledHandleIsActive} style={connectMode ? { cursor: "crosshair" } : undefined}>

      {connectMode && (
        <div style={{ position: "fixed", top: 62, left: "50%", transform: "translateX(-50%)", zIndex: 5000,
                      background: "var(--accent)", color: "#fff", padding: "8px 16px", borderRadius: 999,
                      font: "700 13px var(--font-body)", boxShadow: "var(--shadow-pop)", pointerEvents: "none" }}>
          {connectSourceId ? "Kliknij element docelowy  ·  Esc anuluje" : "Kliknij element źródłowy  ·  Esc anuluje"}
        </div>
      )}

      <PdfContext.Provider value={ctxValue}>
        <ModalPdfs title={titleRef}/>
        <ModalPdfRequestStatus open={modalRequestStatus} message={responsePDF} />
        <TemplatesModal />
        <Sidebar>
          <AnimatePresence>{isDropzone && <DropzoneContainer />}</AnimatePresence>
          {/* Side panels anchor to the full-height sidebar, but the topbar (44px,
              z-index 1400) lives in the right pane and would cover their header —
              so they start below it and give back its height. */}
          {isAiPanel && (
            <div style={{ position: "absolute", left: "100%", top: 44, width: 320, background: "#fff", borderLeft: "1px solid var(--border-line)", borderRight: "1px solid var(--border-line)", height: "calc(100% - 44px)", overflowY: "auto", zIndex: 1100, boxShadow: "4px 0 16px rgba(30,48,78,.10)" }}>
              <AiCvPanel onClose={handleShowAiPanel} />
            </div>
          )}
          {isDeckPanel && (
            <div style={{ position: "absolute", left: "100%", top: 44, width: 340, background: "#fff", borderLeft: "1px solid var(--border-line)", borderRight: "1px solid var(--border-line)", height: "calc(100% - 44px)", overflowY: "auto", zIndex: 1100, boxShadow: "4px 0 16px rgba(30,48,78,.10)" }}>
              <AiDeckPanel onClose={handleShowDeckPanel} />
            </div>
          )}
          {isArticlePanel && (
            <div style={{ position: "absolute", left: "100%", top: 44, width: 340, background: "#fff", borderLeft: "1px solid var(--border-line)", borderRight: "1px solid var(--border-line)", height: "calc(100% - 44px)", overflowY: "auto", zIndex: 1100, boxShadow: "4px 0 16px rgba(30,48,78,.10)" }}>
              <AiArticlePanel onClose={handleShowArticlePanel} />
            </div>
          )}
          <Editor />
        </Sidebar>
        <div className="right-pane">
          <Topbar titleRef={titleRef} />
          <div className="canvas-area">
            <A4 width={`${pageSize.width}px`} height={`${pageSize.height}px`} zoom={zoom} ref={A4ref}>
              {isPdfLoading && <Spinner loading={isPdfLoading}/>}
              <div style={layoutPreviewPatches.length > 0 ? { pointerEvents: "none" } : undefined}>
                <CanvasElements elements={previewedElements.filter(element => (element.page ?? 1) === currentPage)} />
                <Connectors elements={previewedElements} />
                <SelectionOverlay elements={previewedElements} />
                <Guides />
              </div>
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