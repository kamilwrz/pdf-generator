import DropzoneContainer from '../components/gallery/Dropzone/DropzoneContainer';
import Gallery from '../components/gallery/Gallery/Gallery';
import Sidebar from '../components/editor/Sidebar/Sidebar';
import Topbar from '../components/editor/Topbar/Topbar';
import A4 from "../components/canvas/A4/A4";
import Editor from '../components/editor/Editor/Editor';
import { PdfContext } from '../store/pdfgenerator-context';
import { CanvasContext } from '../store/canvas-context';
import { UiSurfacesContext } from '../store/ui-surfaces-context';
import { SessionContext } from '../store/session-context';
import { useState, useEffect, useMemo, useCallback, useRef} from 'react';
import { useA4Elements } from "../hooks/useA4Elements";
import { usePdfExport } from '../hooks/usePdfExport';
import CanvasElements from "../components/canvas/CanvasElements/CanvasElements";
import SelectionOverlay from "../components/canvas/SelectionOverlay/SelectionOverlay";
import { useNavigate, useSearchParams } from 'react-router-dom';
import ModalPdfs from '../components/modals/ModalPdfs/ModalPdfs';
import { ApiClient } from '../services/api';
import { ENDPOINTS } from '../services/api';
import Spinner from '../components/common/Spinner/Spinner';
import PageControls from '../components/editor/PageControls/PageControls';
import ToastStack from '../components/common/ToastStack/ToastStack';
import { useToasts } from '../hooks/useToasts';
import { useEntitlements } from '../hooks/useEntitlements';
import Guides from '../components/canvas/Guides/Guides';
import Connectors from '../components/canvas/Connectors/Connectors';
import TemplatesModal from '../components/modals/TemplatesModal/TemplatesModal';
import PlanSelectModal from '../components/modals/PlanSelectModal/PlanSelectModal';
import AiCvPanel from '../components/ai/AiCvPanel/AiCvPanel';
import BioCvModal from '../components/ai/BioCvModal/BioCvModal';
import ChangeTemplateModal from '../components/editor/Topbar/ChangeTemplateModal';
import UnlockFreeformModal from '../components/editor/UnlockFreeformModal/UnlockFreeformModal';
import SectionsPanel from '../components/editor/SectionsPanel/SectionsPanel';
import AiAssistant from '../components/ai/AiAssistant/AiAssistant';
import { logEvent } from '../services/eventLog';
import { previewStructureOperation } from '../utils/structureOperation';
import { visiblePageNumbers } from '../utils/pageSpread';
import { planErrorMessage } from '../utils/entitlements';
import {
  EDITOR_MODE_FREEFORM,
  EDITOR_MODE_TEMPLATE,
  inferEditorMode,
  normalizeEditorMode,
} from '../utils/editorMode';
import { nanoid } from 'nanoid';

/**
 * Authenticated CV editor page: canvas, toolbars, dialogs, and autosave.
 *
 * Composes `useA4Elements` + `usePdfExport` into focused contexts
 * (Canvas / UiSurfaces / Session) plus a temporary merged `PdfContext` facade
 * so existing `use(PdfContext)` consumers keep working during migration.
 * Dialog (`docs` / `templates` / AI / plan) and panel (`upload` / `gallery`)
 * surfaces are mutually exclusive so only one overlay owns focus at a time.
 */

// Session-scoped flag so the template-first onboarding modal (see
// markTemplatesModalSeen below) never re-triggers after being resolved once.
const TEMPLATES_MODAL_SEEN_KEY = "cv-studio:templatesModalSeen";

function PdfCanvas() {

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const startIntent = searchParams.get("start");
  // Read the landing intent only while this editor instance is created. It
  // becomes the initial dialog state, which avoids a visual flash of the
  // default template picker before the requested flow is visible.
  const initialStartIntentRef = useRef(
    startIntent === "import"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
      ? startIntent
      : null,
  );

  // Toggle this signal after a period of pointer activity so the session check
  // below can detect an expired JWT without issuing a request for every move.
  const [checkActivity, setIsActive] = useState(false);
  // Unified surface state: `dialog` (centered, backdrop+Esc) and `panel`
  // (docked to sidebar) are each mutually exclusive within themselves AND
  // with each other — opening one always closes whatever else was open.
  // Replaces 5 independent booleans that previously had no exclusivity at
  // all (e.g. Moje dokumenty + Szablony + Gallery could all be open together).
  const [dialog, setDialog] = useState(() => {
    if (initialStartIntentRef.current === "import") return "ai";
    if (initialStartIntentRef.current === "wizard") return "bioCv";
    if (initialStartIntentRef.current === "templates") return "templates";
    return null;
  }); // 'docs' | 'templates' | 'ai' | 'bioCv' | 'plan' | 'changeTemplate' | 'unlockFreeform' | null
  const [panel, setPanel] = useState(null);   // 'upload' | 'gallery' | 'sections' | null
  const isModalPdfs = dialog === 'docs';
  const isTemplates = dialog === 'templates';
  const isAiPanel = dialog === 'ai';
  const isBioCvModal = dialog === 'bioCv';
  const isPlanModal = dialog === 'plan';
  const isChangeTemplateModal = dialog === 'changeTemplate';
  const isUnlockFreeformModal = dialog === 'unlockFreeform';
  // Structured cv_data behind the CV currently on the canvas. Set by
  // AiCvPanel/BioCvModal when a fill succeeds; cleared whenever the canvas
  // starts showing something else (fresh document, or a reopened saved PDF
  // in ModalPdfs, which has no persisted cv_data to reuse).
  const [activeCvData, setActiveCvData] = useState(null);
  const isGallery = panel === 'gallery';
  const isDropzone = panel === 'upload';
  const isSectionsPanel = panel === 'sections';
  // Compatibility setter: ModalPdfs.jsx and Sidebar.jsx both call this as
  // `setIsModalPdfs(bool => !bool)` / `setIsModalPdfs(false)`, matching
  // React's setState contract, so neither needed to change.
  const setIsModalPdfs = useCallback((valueOrUpdater) => {
    const prevBool = dialog === 'docs';
    const nextBool = typeof valueOrUpdater === 'function' ? valueOrUpdater(prevBool) : valueOrUpdater;
    setDialog(nextBool ? 'docs' : null);
    if (nextBool) setPanel(null);
  }, [dialog]);
  // state for showing the progress var in Dropzone when IMG is uploaded
  const [valueImageUpload, setValueImageUpload] = useState(0);
  //state for seting the PDF id, used in ModalPdf.jsx
  const [pdfId, setPdfId] = useState(null);
  //FETCHED PDF's
  const [PDFs, setPDFs] = useState([]);
  // true once ModalPdfs' fetch-on-mount has resolved (success or failure) —
  // distinguishes "no saved PDFs" from "still fetching" for T4's onboarding gate
  const [pdfsLoaded, setPdfsLoaded] = useState(false);
  // true only while the CURRENT open TemplatesModal instance is the one that
  // auto-opened for first-time onboarding (not a manual "Szablony" click) —
  // used to scope the pick/dismiss metric to onboarding completion specifically.
  // Mirrored into a ref (kept in lockstep by setAutoOpenedTemplates below) so
  // handleShowTemplates can read the up-to-date value synchronously when it's
  // invoked immediately after markTemplatesModalSeen() within the same click
  // handler (TemplatesModal's handlePick/handleClose both do this) — the
  // state value itself wouldn't have re-rendered yet at that point.
  const [autoOpenedTemplates, setAutoOpenedTemplatesState] = useState(false);
  const autoOpenedTemplatesRef = useRef(false);
  const setAutoOpenedTemplates = useCallback((value) => {
    autoOpenedTemplatesRef.current = value;
    setAutoOpenedTemplatesState(value);
  }, []);
  //the title of the PDF, loadded when pdf loaded
  const titleRef = useRef();

  const { toasts, pushToast, dismissToast } = useToasts();
  const { entitlements, refresh: refreshEntitlements } = useEntitlements(true);

  const [PDFdownloadData, setPDFdownloadData] = useState([])
  // Layout suggestions are rendered here before acceptance, so previewing a
  // correction never mutates the saved document state.
  const [layoutPreviewPatches, setLayoutPreviewPatches] = useState([]);
  const [structurePreviewGroup, setStructurePreviewGroup] = useState(null);
  const [deletionPreviewIds, setDeletionPreviewIds] = useState([]);
  // Text/textarea long-press (2s) — show spacing distance guides without isMove.
  const [spacingHoldId, setSpacingHoldId] = useState(null);


  const {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    groupMoveDelta,
    setPageCanvasRef,
    handleMoveElement,
    handleMoveSelectedElements,
    handleSelectMoveElement,
    handleAddImage,
    handleAddLine,
    handleAddRectangle,
    handleAddCircle,
    handleAddEllipse,
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
    applyStructureOperation,
    applyCloneOperation,
    applyDeleteOperation,
    handleResizeElement,
    handleClearA4,
    handleLoadTemplate,
    handleLoadTemplateWithFill,
    handleLoadAiElements,
    handleUnlockFreeform,
    activeTemplateId,
    setActiveTemplateId,
    editorMode,
    setEditorMode,
    pageCount,
    setPageCount,
    currentPage,
    setCurrentPage,
    isTwoPageView,
    toggleTwoPageView,
    addPage,
    removePage,
    goToPage,
    clonePage,
    movePage,
    pageSize,
    zoom,
    zoomIn,
    zoomOut,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory
  } = useA4Elements(titleRef)



  // usePdfExport's callback param only ever signals "the min-spinner delay
  // has elapsed, react now" — the actual toast trigger lives in the
  // isPdfLoading-transition effect below instead, since reading responsePDF
  // synchronously inside this callback would close over a stale value (this
  // callback is captured by createPdf/updatePdf's useCallback well before
  // responsePDF is ever set for the request in flight).
  function noopShowModal() {}

  const { createPdf, updatePdf, saveElements, responsePDF, isPdfLoading } = usePdfExport(handlePdfId, noopShowModal, titleRef, A4_Elements_deleted, setA4_Elements_deleted);
  const autosaveTimerRef = useRef(null);
  const autosaveQueueRef = useRef(Promise.resolve());
  const wasPdfLoadingRef = useRef(false);

  const prepareDownload = useCallback(async (pdfId) => {
    try {
      const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });
      const response = await api.httpRequest(ENDPOINTS.PDF.DOWNLOAD, "POST", pdfId, "Błąd pobierania");
      const blob = await (await fetch(response.url)).blob();
      const urlBlob = URL.createObjectURL(blob);
      setPDFdownloadData({ blob: urlBlob, title: response.title });
      setTimeout(() => URL.revokeObjectURL(urlBlob), 6000);
      refreshEntitlements();
    } catch (error) {
      console.error("Nie udało się przygotować pobierania PDF.", error);
      pushToast({
        title: error?.code?.startsWith?.("plan_") ? "Limit planu" : "Pobieranie nie powiodło się",
        msg: planErrorMessage(error, "Nie udało się przygotować pobierania PDF."),
        variant: "error",
      });
    }
  }, [pushToast, refreshEntitlements]);

  // Fires exactly when the create/update spinner finishes (same timing the
  // old ModalPdfRequestStatus used), reading responsePDF fresh from this
  // render rather than a captured closure.
  useEffect(() => {
    if (wasPdfLoadingRef.current && !isPdfLoading) {
      if (responsePDF?.message) {
        pushToast({
          title: responsePDF?.code?.startsWith?.("plan_") ? "Limit planu" : "Coś poszło nie tak",
          msg: planErrorMessage(responsePDF, responsePDF.message),
          variant: "error",
        });
      } else if (responsePDF?.success) {
        const fileLabel = titleRef.current?.value ? `${titleRef.current.value}.pdf` : "CV";
        const isDownload = responsePDF.intent === "download";
        pushToast({
          title: isDownload ? "CV gotowe do pobrania" : "Twój PDF jest gotowy",
          msg: isDownload
            ? `Możesz pobrać plik ${fileLabel}.`
            : `CV zostało zapisane pomyślnie${titleRef.current?.value ? `: ${fileLabel}` : "."}`,
          variant: "success",
          pdfDownload: true,
        });
        prepareDownload(responsePDF.pdf_id);
      }
    }
    wasPdfLoadingRef.current = isPdfLoading;
  }, [isPdfLoading, responsePDF, pushToast, prepareDownload, titleRef]);

  function handleLogout() {
    localStorage.removeItem("token")
    navigate("/")
  }


  // A single-page app does not naturally revisit a protected route while a
  // user edits a document. Revalidate the token at most once per 30 seconds
  // of pointer activity and return to the landing page if it has expired.
  const lastActivityCheckRef = useRef(0);
  const throttledHandleIsActive = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityCheckRef.current >= 30000) {
      lastActivityCheckRef.current = now;
      setIsActive(active => !active);
    }
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

  }, [checkActivity, navigate])


  // Each visible page receives this capture handler, allowing connector source
  // and target elements to be chosen from either side of a two-page spread.
  const handleCanvasPointerDownCapture = useCallback((event, page) => {
    if (!connectMode) return;
    event.preventDefault();
    event.stopPropagation();
    pickConnectorAt(event.clientX, event.clientY, page);
  }, [connectMode, pickConnectorAt]);

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
        {
          editorMode: snapshot.editorMode,
          templateId: snapshot.templateId,
        },
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
      editorMode,
      templateId: activeTemplateId,
    });
  }, [
    A4_Elements,
    A4_Elements_deleted,
    activeTemplateId,
    editorMode,
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
      editorMode,
      templateId: activeTemplateId,
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
  }, [
    A4_Elements,
    A4_Elements_deleted,
    activeTemplateId,
    editorMode,
    enqueueAutosave,
    isPdfLoading,
    pageCount,
    pageSize,
    pdfId,
  ])

  const handleShowDropzone = useCallback(() => {
    const next = panel !== 'upload';
    setPanel(next ? 'upload' : null);
    if (next) setDialog(null);
  }, [panel])

  // Called once the auto-opened templates modal is resolved (template
  // picked or dismissed) so it never re-triggers again this session.
  const markTemplatesModalSeen = useCallback(() => {
    sessionStorage.setItem(TEMPLATES_MODAL_SEEN_KEY, "1");
    setAutoOpenedTemplates(false);
  }, [setAutoOpenedTemplates])

  const handleShowTemplates = useCallback(() => {
    const next = dialog !== 'templates';
    // Closing an auto-opened modal via the Topbar "Szablony" toggle
    // bypasses TemplatesModal's own handleClose (backdrop/X button) — log
    // the dismiss and clear the seen-flag here too, so onboarding tracking
    // stays consistent no matter which UI path closed the modal. Reads
    // autoOpenedTemplatesRef (not the autoOpenedTemplates state value)
    // because TemplatesModal's own handlePick/handleClose call
    // markTemplatesModalSeen() then this function in the same synchronous
    // handler — the state wouldn't have re-rendered yet, so reading state
    // here double-logs (and mislogs a dismiss on every pick). The ref is
    // updated synchronously by setAutoOpenedTemplates, so it's already
    // correct by the time this runs.
    if (!next && autoOpenedTemplatesRef.current) {
      logEvent("template_dismissed");
      markTemplatesModalSeen();
    }
    setDialog(next ? 'templates' : null);
    if (next) setPanel(null);
  }, [dialog, markTemplatesModalSeen])

  // Template-first onboarding: auto-open the templates picker for a
  // first-time user (no saved PDFs yet), once pdfsLoaded resolves so a
  // returning user with saved PDFs never sees a false-positive flash while
  // the fetch is still in flight. Guards on every open dialog so it never
  // hijacks a manual action or an intent-aware landing flow. Fires at most
  // once per browser session — see markTemplatesModalSeen.
  useEffect(() => {
    if (!pdfsLoaded || PDFs.length !== 0) return;
    // A landing-page CTA has already chosen a concrete first action. Do not
    // obscure it with the default template picker before the intent is handled.
    if (
      startIntent === "import"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
    ) {
      return;
    }
    if (autoOpenedTemplates || dialog !== null) return;
    if (sessionStorage.getItem(TEMPLATES_MODAL_SEEN_KEY) === "1") return;
    setAutoOpenedTemplates(true);
    setDialog('templates');
    setPanel(null);
  }, [pdfsLoaded, PDFs.length, autoOpenedTemplates, dialog, setAutoOpenedTemplates, startIntent])

  // Blank freeform path: clear canvas once and skip the template picker.
  const blankStartAppliedRef = useRef(false);
  useEffect(() => {
    if (initialStartIntentRef.current !== "blank" || blankStartAppliedRef.current) return;
    blankStartAppliedRef.current = true;
    setEditorMode(EDITOR_MODE_FREEFORM);
    setActiveTemplateId(null);
    handleClearA4();
    markTemplatesModalSeen();
  }, [handleClearA4, markTemplatesModalSeen, setActiveTemplateId, setEditorMode])

  const handleShowAiPanel = useCallback(() => {
    const next = dialog !== 'ai';
    setDialog(next ? 'ai' : null);
    if (next) setPanel(null);
  }, [dialog])

  const handleShowBioCvModal = useCallback(() => {
    const next = dialog !== 'bioCv';
    setDialog(next ? 'bioCv' : null);
    if (next) setPanel(null);
  }, [dialog])

  useEffect(() => {
    if (!initialStartIntentRef.current || !searchParams.has("start")) return;
    // The initial state already opened the requested surface. Removing the
    // parameter keeps a refresh from re-opening a dialog the user dismissed.
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("start");
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleShowPlanModal = useCallback(() => {
    const next = dialog !== 'plan';
    setDialog(next ? 'plan' : null);
    if (next) setPanel(null);
  }, [dialog])

  const handleShowChangeTemplateModal = useCallback(() => {
    const next = dialog !== 'changeTemplate';
    setDialog(next ? 'changeTemplate' : null);
    if (next) setPanel(null);
  }, [dialog])

  const handleShowUnlockFreeform = useCallback(() => {
    setDialog('unlockFreeform');
    setPanel(null);
  }, [])

  const handleShowGallery = useCallback(() => {
    const next = panel !== 'gallery';
    setPanel(next ? 'gallery' : null);
    if (next) setDialog(null);
  }, [panel])

  const handleShowSections = useCallback(() => {
    const next = panel !== 'sections';
    setPanel(next ? 'sections' : null);
    if (next) setDialog(null);
  }, [panel])


  const createPdfWithElements = useCallback(() => {
    createPdf(A4_Elements, titleRef, pageCount, pageSize, {
      editorMode,
      templateId: activeTemplateId,
    });
  }, [A4_Elements, activeTemplateId, createPdf, editorMode, titleRef, pageCount, pageSize]);

  const previewedElements = useMemo(() => {
    const structurallyPreviewed = structurePreviewGroup
      ? previewStructureOperation(A4_Elements, structurePreviewGroup)
      : A4_Elements;
    const deletionPreview = deletionPreviewIds.length > 0
      ? structurallyPreviewed.filter((element) => !deletionPreviewIds.includes(element.element_id))
      : structurallyPreviewed;
    if (layoutPreviewPatches.length === 0) return deletionPreview;

    const patchesById = new Map(
      layoutPreviewPatches.map(patch => [patch.element_id, patch])
    );
    const patchedElements = deletionPreview.map(element => {
      const patch = patchesById.get(element.element_id);
      return {
        ...element,
        isSelected: false,
        isMove: false,
        isEditing: false,
        left: Number.isFinite(patch?.left) ? patch.left : element.left,
        top: Number.isFinite(patch?.top) ? patch.top : element.top,
        width: Number.isFinite(patch?.width) ? patch.width : element.width,
        height: Number.isFinite(patch?.height) ? patch.height : element.height,
        page: Number.isInteger(patch?.page) ? patch.page : element.page,
      };
    });
    const patchedById = new Map(patchedElements.map(element => [element.element_id, element]));
    return patchedElements.map(element => {
      if (element.category !== "connector") return element;
      const source = patchedById.get(element.source_id);
      const target = patchedById.get(element.target_id);
      if (!source || !target || (source.page ?? 1) !== (target.page ?? 1)) return element;
      return { ...element, page: source.page ?? 1 };
    });
  }, [A4_Elements, deletionPreviewIds, layoutPreviewPatches, structurePreviewGroup]);

  const visiblePages = useMemo(
    () => visiblePageNumbers(currentPage, pageCount, isTwoPageView),
    [currentPage, isTwoPageView, pageCount],
  );

  const updatePdfWithElements = useCallback(() => {
    updatePdf(A4_Elements, pdfId, titleRef, A4_Elements_deleted, pageCount, pageSize, {
      editorMode,
      templateId: activeTemplateId,
    });
  }, [
    A4_Elements,
    activeTemplateId,
    editorMode,
    pdfId,
    updatePdf,
    titleRef,
    A4_Elements_deleted,
    pageCount,
    pageSize,
  ]);

  function handlePdfId(pdfId) {
    setPdfId(pdfId)
  }

  // Loading a template / AI doc / clearing starts a fresh, unsaved document.
  // Flush first so switching away never drops edits from the currently open PDF.
  const startFreshDocument = useCallback(async (loadDocument) => {
    try {
      await flushAutosave();
      setPdfId(null);
      // A brand-new document has no known cv_data yet. AiCvPanel/BioCvModal
      // set it again right after a successful fill; every other fresh-start
      // path (blank template, cleared canvas) correctly leaves it cleared.
      setActiveCvData(null);
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
    () => {
      if (editorMode === EDITOR_MODE_TEMPLATE) {
        const leaveTemplate = window.confirm(
          "Wyczyścić dokument?\n\nOK — zacznij pusty projekt własny.\nAnuluj — pozostaw bieżący szablon.",
        );
        if (!leaveTemplate) return;
      }
      startFreshDocument(handleClearA4);
    },
    [editorMode, handleClearA4, startFreshDocument],
  );

  const confirmUnlockFreeform = useCallback(async () => {
    try {
      await flushAutosave();
      const baseTitle = (titleRef.current?.value || "Projekt").trim() || "Projekt";
      const copyTitle = `${baseTitle} (swobodny)`;
      const cloned = A4_Elements.map((element) => ({
        ...element,
        element_id: nanoid(),
        isSelected: false,
        isMove: false,
        isEditing: false,
        preserveInitialLayout: false,
      }));
      setPdfId(null);
      setActiveCvData(null);
      resetHistory();
      setA4_Elements(cloned);
      setA4_Elements_deleted([]);
      if (titleRef.current) titleRef.current.value = copyTitle;
      handleUnlockFreeform();
      setDialog(null);
      pushToast?.({
        title: "Projekt własny",
        msg: "Utworzono kopię ze swobodną edycją.",
        variant: "success",
      });
    } catch (error) {
      console.error("Nie udało się odblokować swobodnej edycji.", error);
      pushToast?.({
        title: "Odblokowanie nie powiodło się",
        msg: "Autozapis nie powiódł się — spróbuj ponownie.",
        variant: "error",
      });
    }
  }, [
    A4_Elements,
    flushAutosave,
    handleUnlockFreeform,
    pushToast,
    resetHistory,
    setA4_Elements,
    setA4_Elements_deleted,
  ]);

  const hydrateDocumentMode = useCallback((elements, pdfMeta = {}) => {
    const savedMode = pdfMeta.editor_mode ?? pdfMeta.editorMode;
    const savedTemplate = pdfMeta.template_id ?? pdfMeta.templateId ?? null;
    if (savedTemplate) setActiveTemplateId(savedTemplate);
    else setActiveTemplateId(null);
    if (savedMode) {
      setEditorMode(normalizeEditorMode(savedMode));
      return;
    }
    setEditorMode(inferEditorMode(elements, savedTemplate));
  }, [setActiveTemplateId, setEditorMode]);
  // A successful delete must clear the local canvas without attempting to
  // autosave the PDF row that has just been removed from the server.
  const discardActiveDocument = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setPdfId(null);
    setActiveCvData(null);
    handleClearA4();
  }, [handleClearA4]);

  const canvasValue = useMemo(() => ({
    A4_Elements,
    groupMoveDelta,
    setPageCanvasRef,
    addImage: handleAddImage,
    addText: handleAddText,
    addLine: handleAddLine,
    addRectangle: handleAddRectangle,
    addCircle: handleAddCircle,
    addEllipse: handleAddEllipse,
    addConnector: () => {},
    addTextarea: handleAddTextarea,
    markSelected,
    setTextareaEditing: handleSetTextareaEditing,
    selectElement: handleSelectElement,
    moveElement: handleMoveElement,
    moveSelectedElements: handleMoveSelectedElements,
    selectMoveElement: handleSelectMoveElement,
    spacingHoldId,
    setSpacingHoldId,
    editElementValues: handleEditElementValues,
    editSelectedElementValues: handleEditSelectedElementValues,
    fitTextareaToContent: handleFitTextareaToContent,
    applyStructureOperation,
    applyCloneOperation,
    applyDeleteOperation,
    applyLayoutPatches,
    alignElement: handleAlignElements,
    deleteElement: handleDeleteElement,
    deleteSelectedElements: handleDeleteSelectedElements,
    duplicateElement: handleDuplicateElement,
    duplicateSelectedElements: handleDuplicateSelectedElements,
    resizeElement: handleResizeElement,
    setA4_Elements,
    setA4_Elements_deleted,
    activePdfId: pdfId,
    flushAutosave,
    discardActiveDocument,
    clearA4: clearA4Fresh,
    loadTemplate: loadTemplateFresh,
    loadTemplateWithFill: loadTemplateWithFillFresh,
    loadAiElements: loadAiElementsFresh,
    // Raw canvas replace (no pdfId/title reset) — Topbar "Zmień szablon".
    replaceActiveElements: handleLoadAiElements,
    activeTemplateId,
    setActiveTemplateId,
    editorMode,
    setEditorMode,
    hydrateDocumentMode,
    showUnlockFreeform: handleShowUnlockFreeform,
    unlockFreeform: handleUnlockFreeform,
    activeCvData,
    setActiveCvData,
    pageSize,
    zoom,
    zoomIn,
    zoomOut,
    pageCount,
    setPageCount,
    currentPage,
    setCurrentPage,
    isTwoPageView,
    toggleTwoPageView,
    addPage,
    removePage,
    goToPage,
    clonePage,
    movePage,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
    updatePdf: updatePdfWithElements,
    createPdf: createPdfWithElements,
    isPdfLoading,
    layoutPreviewPatches,
    setLayoutPreviewPatches,
    structurePreviewGroup,
    setStructurePreviewGroup,
    deletionPreviewIds,
    setDeletionPreviewIds,
  }), [
    A4_Elements, groupMoveDelta, setPageCanvasRef, isPdfLoading, pdfId, setA4_Elements_deleted,
    handleAddImage, handleAddText, handleAddLine, handleAddRectangle, handleAddCircle, handleAddEllipse,
    handleSelectElement, handleMoveElement, handleMoveSelectedElements, handleSelectMoveElement,
    createPdfWithElements, applyStructureOperation, applyCloneOperation, applyDeleteOperation,
    handleEditElementValues, handleEditSelectedElementValues, handleFitTextareaToContent, applyLayoutPatches,
    handleAlignElements, handleDeleteElement, handleDeleteSelectedElements, handleDuplicateSelectedElements,
    setA4_Elements, handleResizeElement, updatePdfWithElements,
    clearA4Fresh, discardActiveDocument, flushAutosave, loadTemplateFresh, loadTemplateWithFillFresh,
    loadAiElementsFresh, handleLoadAiElements, activeTemplateId, setActiveTemplateId,
    editorMode, setEditorMode, hydrateDocumentMode, handleShowUnlockFreeform, handleUnlockFreeform,
    activeCvData, setActiveCvData,
    pageCount, currentPage, addPage, removePage, goToPage, clonePage, movePage, setPageCount, setCurrentPage,
    isTwoPageView, toggleTwoPageView, handleAddTextarea, markSelected, handleSetTextareaEditing,
    handleDuplicateElement, pageSize, zoom, zoomIn, zoomOut, undo, redo, canUndo, canRedo, resetHistory,
    deletionPreviewIds, layoutPreviewPatches, structurePreviewGroup, spacingHoldId,
  ]);

  const uiValue = useMemo(() => ({
    isTemplates,
    showTemplates: handleShowTemplates,
    autoOpenedTemplates,
    markTemplatesModalSeen,
    isAiPanel,
    showAiPanel: handleShowAiPanel,
    isBioCvModal,
    showBioCvModal: handleShowBioCvModal,
    isPlanModal,
    showPlanModal: handleShowPlanModal,
    isChangeTemplateModal,
    showChangeTemplateModal: handleShowChangeTemplateModal,
    showUnlockFreeform: handleShowUnlockFreeform,
    isGallery,
    showGallery: handleShowGallery,
    isSectionsPanel,
    showSections: handleShowSections,
    isDropzone,
    showDropzone: handleShowDropzone,
    valueImageUpload,
    setValueImageUpload,
    isModalPdfs,
    setIsModalPdfs,
  }), [
    isTemplates, handleShowTemplates, autoOpenedTemplates, markTemplatesModalSeen,
    isAiPanel, handleShowAiPanel, isBioCvModal, handleShowBioCvModal,
    isPlanModal, handleShowPlanModal, isChangeTemplateModal, handleShowChangeTemplateModal,
    handleShowUnlockFreeform,
    isGallery, handleShowGallery, isSectionsPanel, handleShowSections,
    isDropzone, handleShowDropzone,
    valueImageUpload, setValueImageUpload, isModalPdfs, setIsModalPdfs,
  ]);

  const sessionValue = useMemo(() => ({
    handlePdfId,
    pushToast,
    entitlements,
    refreshEntitlements,
    logout: handleLogout,
    PDFs,
    setPDFs,
    pdfsLoaded,
    setPdfsLoaded,
    PDFdownloadData,
    setPDFdownloadData,
  }), [
    handlePdfId, pushToast, entitlements, refreshEntitlements, handleLogout,
    PDFs, setPDFs, pdfsLoaded, setPdfsLoaded, PDFdownloadData,
  ]);

  // Temporary facade — remove once all consumers use the focused hooks.
  const ctxValue = useMemo(
    () => ({ ...canvasValue, ...uiValue, ...sessionValue }),
    [canvasValue, uiValue, sessionValue],
  );

  // The PDF-ready toast's download link is sourced live from PDFdownloadData
  // (shared, single-slot context state — same pattern ModalPdfs already uses
  // for its own per-row download buttons) rather than baked in at push time,
  // since the blob isn't ready yet when the toast first appears.
  const displayToasts = useMemo(() => toasts.map((t) => (
    t.pdfDownload && PDFdownloadData.blob
      ? { ...t, action: { label: "Pobierz PDF", href: PDFdownloadData.blob, download: PDFdownloadData.title } }
      : t
  )), [toasts, PDFdownloadData]);

  return (
    <main className='main-container' onMouseMove={throttledHandleIsActive}>

      <CanvasContext.Provider value={canvasValue}>
        <UiSurfacesContext.Provider value={uiValue}>
          <SessionContext.Provider value={sessionValue}>
            <PdfContext.Provider value={ctxValue}>
              <ModalPdfs title={titleRef}/>
              <TemplatesModal />
              <PlanSelectModal />
              <AiCvPanel />
              <BioCvModal />
              <ChangeTemplateModal />
              <UnlockFreeformModal
                open={isUnlockFreeformModal}
                onCancel={() => setDialog(null)}
                onConfirm={confirmUnlockFreeform}
              />
              <DropzoneContainer />
              <Sidebar>
                <Editor />
                {isSectionsPanel ? (
                  <div style={{ padding: "12px" }}>
                    <SectionsPanel onClose={() => setPanel(null)} />
                  </div>
                ) : null}
              </Sidebar>
              <div className="right-pane">
                <Topbar titleRef={titleRef} />
                <div className="canvas-area">
                  <div className={isTwoPageView ? "canvas-spread" : "canvas-single"}>
                    {visiblePages.map((page) => (
                      <A4
                        key={page}
                        page={page}
                        width={`${pageSize.width}px`}
                        height={`${pageSize.height}px`}
                        zoom={isTwoPageView ? 1 : zoom}
                        isSpread={isTwoPageView}
                        ref={(node) => setPageCanvasRef(page, node)}
                        onPointerDownCapture={(event) => handleCanvasPointerDownCapture(event, page)}
                      >
                        {isPdfLoading && page === currentPage && <Spinner loading={isPdfLoading}/>}
                        <div style={layoutPreviewPatches.length > 0 || structurePreviewGroup || deletionPreviewIds.length > 0 ? { pointerEvents: "none" } : undefined}>
                          <CanvasElements elements={previewedElements.filter((element) => (element.page ?? 1) === page)} />
                          <Connectors elements={previewedElements} page={page} />
                          <SelectionOverlay elements={previewedElements} page={page} />
                          <Guides page={page} />
                        </div>
                      </A4>
                    ))}
                  </div>
                </div>
              </div>
              <PageControls />
              <Gallery />
              {entitlements?.ai_assistant ? <AiAssistant /> : null}
              <ToastStack toasts={displayToasts} onDismiss={dismissToast} offsetForGallery={isGallery} />
            </PdfContext.Provider>
          </SessionContext.Provider>
        </UiSurfacesContext.Provider>
      </CanvasContext.Provider>
    </main>
  )
}

export default PdfCanvas;