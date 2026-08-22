import Gallery from '../components/gallery/Gallery/Gallery';
import Sidebar from '../components/editor/Sidebar/Sidebar';
import Topbar from '../components/editor/Topbar/Topbar';
import DemoBanner from '../components/editor/DemoBanner/DemoBanner';
import StartChooser from '../components/editor/StartChooser/StartChooser';
import A4 from "../components/canvas/A4/A4";
import CanvasPageStage from "../components/canvas/CanvasPageStage/CanvasPageStage";
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
import AiCorrectionOverlay from "../components/canvas/AiCorrectionOverlay/AiCorrectionOverlay";
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  clearAccessToken,
  getAccessToken,
  getEditorPath,
  getSessionUsername,
  GUEST_WORKSPACE,
} from '../utils/authSession';
import ModalPdfs from '../components/modals/ModalPdfs/ModalPdfs';
import { ApiClient } from '../services/api';
import { ENDPOINTS } from '../services/api';
import Spinner from '../components/common/Spinner/Spinner';
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
import SaveGateModal from '../components/editor/SaveGateModal/SaveGateModal';
import ClaimGuestDocumentModal from '../components/editor/ClaimGuestDocumentModal/ClaimGuestDocumentModal';
import SectionsPanel from '../components/editor/SectionsPanel/SectionsPanel';
import AddSectionModal from '../components/editor/AddSectionModal/AddSectionModal';
import FlatSectionLayoutModal from '../components/editor/FlatSectionLayoutModal/FlatSectionLayoutModal';
import SkillsLayoutModal from '../components/editor/SkillsLayoutModal/SkillsLayoutModal';
import LongCvModal from '../components/editor/LongCvModal/LongCvModal';
import AiAssistant from '../components/ai/AiAssistant/AiAssistant';
import { logEvent } from '../services/eventLog';
import { saveGuestDocument, loadGuestDocument, clearGuestDocument } from '../utils/guestDocument';
import { queueGuestEvent, loadGuestEvents, clearGuestEvents } from '../utils/guestEvents';
import { hasGuestWizardDraft } from '../utils/guestWizardDraft';
import { adoptGuestWizardDraftForAccount } from '../utils/claimGuestWizardDraft';
import { resolveActiveCvData } from '../utils/resolveActiveCvData';
import { shouldShowStartChooser } from '../utils/startChooser';
import { previewStructureOperation, reconcileDocumentPages } from '../utils/structureOperation';
import { visiblePageNumbers } from '../utils/pageSpread';
import { planErrorMessage } from '../utils/entitlements';
import { triggerBlobDownload } from '../utils/download';
import { useCanvasPageWheel } from '../hooks/useCanvasPageWheel';
import {
  EDITOR_MODE_FREEFORM,
  EDITOR_MODE_TEMPLATE,
  inferEditorMode,
  normalizeEditorMode,
} from '../utils/editorMode';
import {
  COMPACT_FLOW_SPACING,
  DEFAULT_FLOW_SPACING,
  MIN_FLOW_SPACING,
  flowSpacingEquals,
} from '../utils/flowSpacing';
import {
  findFitForTarget,
  resolveFitAction,
  formatFitTargetLabel,
} from '../utils/fitToPages';
import { listSectionIconOptions } from '../utils/sectionIcons';
import { convertFlatListContent } from '../utils/flatSectionLayout';
import {
  shouldResetLongCvOffer,
  TOO_LONG_MIN_PAGES,
  SIDEBAR_TOO_LONG_MIN_PAGES,
} from '../utils/documentLength';
import { collapseSpilledMainIntoSidebar } from '../utils/collapseMainIntoSidebar';
import { regentTemplate } from '../templates/regent';
import { TEMPLATES } from '../templates';
import { templateHasLayout } from '../utils/templateLayouts';
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
  const { workspace } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const startIntent = searchParams.get("start");

  // Keep the path slug aligned with auth: guests → /cvstudio/guest,
  // authenticated users → /cvstudio/{username}. The slug is cosmetic; JWT
  // ownership still decides which documents the API returns.
  useEffect(() => {
    const token = getAccessToken();
    const expectedSlug = token
      ? (getSessionUsername() || GUEST_WORKSPACE)
      : GUEST_WORKSPACE;
    let currentSlug = GUEST_WORKSPACE;
    try {
      currentSlug = decodeURIComponent(workspace || GUEST_WORKSPACE);
    } catch {
      currentSlug = workspace || GUEST_WORKSPACE;
    }
    if (currentSlug === expectedSlug) return;
    const nextPath = getEditorPath({ start: startIntent });
    navigate(nextPath, { replace: true });
  }, [workspace, startIntent, navigate]);
  // Read the landing intent only while this editor instance is created. It
  // becomes the initial dialog state, which avoids a visual flash of the
  // default template picker before the requested flow is visible.
  const initialStartIntentRef = useRef(
    startIntent === "import"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
      || startIntent === "demo"
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
  const isModalPdfs = dialog === 'docs' && Boolean(localStorage.getItem("token"));
  const isTemplates = dialog === 'templates';
  const isAiPanel = dialog === 'ai';
  const isBioCvModal = dialog === 'bioCv';
  const isPlanModal = dialog === 'plan';
  const isChangeTemplateModal = dialog === 'changeTemplate';
  const isUnlockFreeformModal = dialog === 'unlockFreeform';
  const isSaveGateModal = dialog === 'saveGate';
  const isClaimGuestModal = dialog === 'claimGuest';
  // Structured cv_data behind the CV currently on the canvas. Set by
  // AiCvPanel/BioCvModal when a fill succeeds; cleared whenever the canvas
  // starts showing something else (fresh document, or a reopened saved PDF
  // in ModalPdfs, which has no persisted cv_data to reuse).
  const [activeCvData, setActiveCvData] = useState(null);
  const isGallery = panel === 'gallery';
  const isDropzone = panel === 'upload';
  const isSectionsPanel = panel === 'sections';
  // "Dodaj sekcję" lives on PdfCanvas so the canvas heading "+" can open it
  // even when the Sections panel is closed. `afterHeadingId` inserts under
  // that section; null appends at the end (panel button).
  const [addSectionModal, setAddSectionModal] = useState({
    open: false,
    afterHeadingId: null,
    lane: null,
  });
  // Accept a heading id string (canvas "+") or `{ afterHeadingId, lane }`
  // (Sections panel "Dodaj w sidebarze").
  const openAddSectionModal = useCallback((afterHeadingIdOrOptions = null) => {
    if (
      afterHeadingIdOrOptions
      && typeof afterHeadingIdOrOptions === "object"
    ) {
      setAddSectionModal({
        open: true,
        afterHeadingId: afterHeadingIdOrOptions.afterHeadingId || null,
        lane: afterHeadingIdOrOptions.lane || null,
      });
      return;
    }
    setAddSectionModal({
      open: true,
      afterHeadingId: afterHeadingIdOrOptions || null,
      lane: null,
    });
  }, []);
  const closeAddSectionModal = useCallback(() => {
    setAddSectionModal({ open: false, afterHeadingId: null, lane: null });
  }, []);
  // Layout toggle (inline mid-dot row / bullet list) for flat-list sections
  // (Skills, Languages, flat custom sections). Owned by PdfCanvas for the
  // same reason as "Dodaj sekcję": the canvas hover icon must be able to open
  // it regardless of which sidebar panel is open. Derived values/handlers
  // that need `A4_Elements` / `handleEditElementValues` are defined further
  // down, after the `useA4Elements()` destructuring.
  const [flatSectionLayoutModal, setFlatSectionLayoutModal] = useState({
    open: false,
    elementId: null,
  });
  const openFlatSectionLayoutModal = useCallback((elementId) => {
    setFlatSectionLayoutModal({ open: true, elementId });
  }, []);
  const closeFlatSectionLayoutModal = useCallback(() => {
    setFlatSectionLayoutModal({ open: false, elementId: null });
  }, []);
  // Layout picker (mid-dot row / bullet list / chip pills) for main-column
  // Skills sections — same "owned by PdfCanvas" reasoning as the flat-list
  // toggle above (the canvas hover icon must open it regardless of which
  // sidebar panel is open; the "Uklad CV" panel opens it too).
  const [skillsLayoutModal, setSkillsLayoutModal] = useState({
    open: false,
    headingId: null,
  });
  const openSkillsLayoutModal = useCallback((headingId) => {
    setSkillsLayoutModal({ open: true, headingId });
  }, []);
  const closeSkillsLayoutModal = useCallback(() => {
    setSkillsLayoutModal({ open: false, headingId: null });
  }, []);
  // "CV too long" assistant: auto-detects 3+ page documents once per document
  // and offers a free compact-spacing pass, then (if needed) AI shortening.
  const [longCvModal, setLongCvModal] = useState({ open: false, variant: null, fit: null });
  // Mirror of longCvModal.open for the auto-open effect — reading state from
  // the effect deps re-ran detection on every open and raced the identity reset.
  const longCvOpenRef = useRef(false);
  const closeLongCvModal = useCallback(() => {
    longCvOpenRef.current = false;
    setLongCvModal({ open: false, variant: null, fit: null });
  }, []);
  // Once-per logical document+template: stores the identity we already offered
  // for. Cleared only on a real document/template change (see shouldResetLongCvOffer).
  const longCvOfferedForRef = useRef(null);
  // Previous pdfId/templateId pair so we can distinguish first-save promotion
  // (null → id) from loading a different document.
  const longCvIdentityRef = useRef({ pdfId: null, templateId: null });
  // Bridge to open the AI assistant with a preset action (e.g. "shorten").
  const [assistantAction, setAssistantAction] = useState(null);
  const assistantNonceRef = useRef(0);
  const requestAssistantAction = useCallback((action) => {
    assistantNonceRef.current += 1;
    setAssistantAction({ action, nonce: assistantNonceRef.current });
  }, []);
  // Page count captured when an AI-shorten flow starts, so a later drop shows
  // the "skrócono z X do Y stron" success toast.
  const shortenBaselinePagesRef = useRef(null);
  // Compatibility setter: ModalPdfs.jsx and Sidebar.jsx both call this as
  // `setIsModalPdfs(bool => !bool)` / `setIsModalPdfs(false)`, matching
  // React's setState contract, so neither needed to change.
  const setIsModalPdfs = useCallback((valueOrUpdater) => {
    const prevBool = dialog === 'docs';
    const nextBool = typeof valueOrUpdater === 'function' ? valueOrUpdater(prevBool) : valueOrUpdater;
    if (nextBool && !localStorage.getItem("token")) return;
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

  // Layout suggestions are rendered here before acceptance, so previewing a
  // correction never mutates the saved document state.
  const [layoutPreviewPatches, setLayoutPreviewPatches] = useState([]);
  const [structurePreviewGroup, setStructurePreviewGroup] = useState(null);
  const [deletionPreviewIds, setDeletionPreviewIds] = useState([]);
  // Soft marks for elements with pending AI corrections (set by AiAssistant).
  const [aiCorrectionHighlights, setAiCorrectionHighlights] = useState([]);
  // Text/textarea long-press (2s) — show spacing distance guides without isMove.
  const [spacingHoldId, setSpacingHoldId] = useState(null);


  const {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    groupMoveDelta,
    setPageCanvasRef,
    A4ref,
    canvasAreaRef,
    handleMoveElement,
    handleMoveSelectedElements,
    handleSelectMoveElement,
    handleAddImage,
    handleAddLine,
    handleAddRectangle,
    handleAddCircle,
    handleAddEllipse,
    handleAddPolygon,
    handleAddPath,
    handleAddText,
    handleAddTextarea,
    handleAddSection,
    handleAddSectionRecord,
    handleAddRecordBlock,
    handleRemoveSection,
    handleRemoveRecordBlock,
    handleReorderRecordBlock,
    handleReorderSection,
    handleTransferSectionLane,
    handleChangeSkillsDisplayMode,
    connectMode,
    connectSourceId,
    startConnecting,
    cancelConnecting,
    pickConnectorAt,
    markSelected,
    handleCanvasBackgroundClick,
    handleSetTextareaEditing,
    requestEditZoomRestore,
    editZoomSpreadTransitionRef,
    handleSelectElement,
    handleDeleteElement,
    handleDeleteSelectedElements,
    handleDuplicateElement,
    handleDuplicateSelectedElements,
    handleAlignElements,
    handleEditElementValues,
    handleCollapseSpilledMainIntoSidebar,
    handleEditSelectedElementValues,
    fitTextareaToContent: handleFitTextareaToContent,
    applyLayoutPatches,
    applyStructureOperation,
    applyCloneOperation,
    applyDeleteOperation,
    removeContactChannel,
    addContactChannel,
    toggleNameCase,
    toggleTitle,
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
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    adoptDocumentFlowSpacing,
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

  // Wheel on the canvas scrolls the overflow first; at the edge it changes
  // currentPage so PageControls ("Strona N / M") stays in sync. canvasAreaRef
  // comes from useA4Elements so the edit-zoom effect there can also scroll it.
  useCanvasPageWheel(canvasAreaRef, { currentPage, pageCount, goToPage });

  // Direction for CanvasPageStage slide (next = +1, previous = -1).
  // Adjusted during render so enter/exit share the same step direction.
  const [pageNav, setPageNav] = useState({ page: currentPage, direction: 1 });
  if (currentPage !== pageNav.page) {
    setPageNav({
      page: currentPage,
      direction: currentPage > pageNav.page ? 1 : -1,
    });
  }

  const handleConfirmAddSection = useCallback(({ name, layout, iconName }) => {
    handleAddSection({
      name,
      layout,
      iconName,
      afterHeadingId: addSectionModal.afterHeadingId,
      lane: addSectionModal.lane,
    });
    setAddSectionModal({ open: false, afterHeadingId: null, lane: null });
  }, [addSectionModal.afterHeadingId, addSectionModal.lane, handleAddSection]);

  // Icon gallery for iconic templates; computed here because AddSectionModal
  // is owned by PdfCanvas (not only SectionsPanel).
  const addSectionIconOptions = useMemo(
    () => listSectionIconOptions({
      templateId: activeTemplateId,
      elements: A4_Elements,
    }),
    [activeTemplateId, A4_Elements],
  );

  // The flat-list section element currently open in FlatSectionLayoutModal
  // (looked up live so the preview always reflects the latest saved content).
  const flatSectionLayoutElement = useMemo(
    () => A4_Elements.find((element) => element.element_id === flatSectionLayoutModal.elementId) || null,
    [A4_Elements, flatSectionLayoutModal.elementId],
  );
  const handleApplyFlatSectionLayout = useCallback((style) => {
    if (!flatSectionLayoutElement) return;
    const { content, bulletList } = convertFlatListContent(
      flatSectionLayoutElement.content,
      flatSectionLayoutElement.bulletList,
      style,
    );
    // Same commit path as any manual edit, so undo/redo, autosave, and the
    // normal auto-height reflow (which shifts later content when a
    // textarea's measured height changes) all apply with no extra plumbing.
    handleEditElementValues({ content, bulletList }, flatSectionLayoutElement.element_id);
    setFlatSectionLayoutModal({ open: false, elementId: null });
  }, [flatSectionLayoutElement, handleEditElementValues]);

  const handleApplySkillsLayout = useCallback((mode) => {
    const headingId = skillsLayoutModal.headingId;
    if (!headingId) return;
    // Same commit path as reorder/transfer — full structural re-pack, not a
    // single-element edit, so undo/redo and autosave apply with no extra
    // plumbing (see `handleChangeSkillsDisplayMode` in `useA4Elements`).
    handleChangeSkillsDisplayMode(headingId, mode);
    setSkillsLayoutModal({ open: false, headingId: null });
  }, [skillsLayoutModal.headingId, handleChangeSkillsDisplayMode]);

  // usePdfExport's callback param only ever signals "the min-spinner delay
  // has elapsed, react now" — the actual toast trigger lives in the
  // isPdfLoading-transition effect below instead, since reading responsePDF
  // synchronously inside this callback would close over a stale value (this
  // callback is captured by createPdf/updatePdf's useCallback well before
  // responsePDF is ever set for the request in flight).
  function noopShowModal() {}

  const { createPdf, updatePdf, downloadPdf, responsePDF, isPdfLoading } = usePdfExport(handlePdfId, noopShowModal, titleRef, A4_Elements_deleted, setA4_Elements_deleted);
  const wasPdfLoadingRef = useRef(false);
  // Set false by any canvas mutation (edit, load, reflow); flipped true only by
  // a successful "Zapisz". Combined with `canUndo` (edited-since-load), this is
  // the "unsaved changes not yet in Moje dokumenty" signal used to guard
  // canvas-replacing actions now that background autosave is gone.
  const savedCleanRef = useRef(false);

  // Stable callback ref for the post-spinner effect so a `pushToast` identity
  // change does not re-run the effect for an already-handled response.
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;
  const refreshEntitlementsRef = useRef(refreshEntitlements);
  refreshEntitlementsRef.current = refreshEntitlements;

  // Fires exactly when the create/update spinner finishes. Save (create or
  // update) is the only path through here now — Download renders on demand via
  // `handleDownloadClick` and never touches `responsePDF`. On success the
  // document is committed to "Moje dokumenty", so the in-memory state is clean.
  useEffect(() => {
    if (!(wasPdfLoadingRef.current && !isPdfLoading)) {
      wasPdfLoadingRef.current = isPdfLoading;
      return undefined;
    }
    wasPdfLoadingRef.current = isPdfLoading;

    if (responsePDF?.message) {
      pushToastRef.current({
        title: responsePDF?.code?.startsWith?.("plan_") ? "Limit planu" : "Coś poszło nie tak",
        msg: planErrorMessage(responsePDF, responsePDF.message),
        variant: "error",
      });
      return undefined;
    }
    if (!responsePDF?.success) return undefined;

    // The current canvas now matches what is stored in "Moje dokumenty", so a
    // subsequent document switch must not warn about unsaved changes.
    savedCleanRef.current = true;
    const fileLabel = titleRef.current?.value ? `${titleRef.current.value}.pdf` : "CV";
    pushToastRef.current({
      title: "Zapisano w Moich dokumentach",
      msg: `CV zostało zapisane pomyślnie${titleRef.current?.value ? `: ${fileLabel}` : "."}`,
      variant: "success",
    });
    // A create consumes a project entitlement; refresh so plan counters stay
    // current without waiting for the next natural fetch.
    refreshEntitlementsRef.current?.();
    return undefined;
  }, [isPdfLoading, responsePDF, titleRef]);

  function handleLogout() {
    clearAccessToken();
    navigate("/");
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

  // Guests (no token) are the default state here now, not an expired
  // session — skip verification entirely so a guest visit never triggers
  // a needless network call. When a leftover JWT is expired, clear it and
  // stay on /cvstudio/guest instead of bouncing to "/" (that redirect was
  // from the pre-guest-mode era when the editor required auth).
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const api = new ApiClient();
    api.httpRequest(ENDPOINTS.AUTH.TOKEN + token, "GET", null, "Weryfikacja tokenu nie powiodła się!").
      catch((error) => {
        console.log(error);
        if (error.status === 401 || error.status === 403) {
          clearAccessToken();
          navigate(getEditorPath(), { replace: true });
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

  // Background autosave to the backend was intentionally removed: "Moje
  // dokumenty" is updated ONLY on an explicit "Zapisz". Edits therefore live in
  // memory (backing undo/redo) until saved. Any canvas mutation clears the
  // clean flag; a successful save re-sets it (see the post-spinner effect).
  useEffect(() => {
    savedCleanRef.current = false;
  }, [
    A4_Elements,
    A4_Elements_deleted,
    activeTemplateId,
    editorMode,
    flowSpacing,
    pageCount,
    pageSize,
  ]);

  // Guard for actions that replace the current canvas (load template / AI doc /
  // clear / open another saved document). With no background autosave, such a
  // switch would silently drop unsaved edits, so warn first. Returns true when
  // it is safe to proceed. `canUndo` means "edited since this document loaded"
  // (history resets on every load); `savedCleanRef` means "already committed via
  // Zapisz" — only a document that is edited AND uncommitted is worth warning
  // about, so a pristine or just-saved document switches without a prompt.
  const confirmDiscardActiveEdits = useCallback(() => {
    if (!canUndo || savedCleanRef.current) return true;
    return window.confirm(
      "Masz niezapisane zmiany, które nie zostały jeszcze zapisane w Moich dokumentach.\n\n"
        + "Kontynuować i je odrzucić?",
    );
  }, [canUndo]);

  // Guest-mode autosave: guests have no account to save into, so their
  // in-progress work is persisted to localStorage (a backend write would 401).
  // This local draft is intentionally kept even though authenticated background
  // autosave was removed — it is the only way a guest's edits survive a reload
  // before they register. A 2s settle debounce mirrors the editing cadence.
  // Skipped once a real pdfId exists: from that point the document is a saved
  // account document, updated only by an explicit "Zapisz".
  const [isDemoContent, setIsDemoContent] = useState(startIntent === "demo");
  const isDemoContentRef = useRef(isDemoContent);
  isDemoContentRef.current = isDemoContent;
  // Set once the user dismisses the empty-state onboarding via "start from a
  // blank page"; keeps the chooser hidden for the rest of the session even
  // though the canvas is still empty. Session-local only — a fresh document
  // load starts with the chooser available again.
  const [startChooserDismissed, setStartChooserDismissed] = useState(false);
  const activeCvDataRef = useRef(activeCvData);
  activeCvDataRef.current = activeCvData;
  const guestFirstEditLoggedRef = useRef(false);
  const guestEditorOpenedLoggedRef = useRef(false);
  useEffect(() => {
    if (localStorage.getItem("token") || pdfId != null) return undefined;

    if (!guestEditorOpenedLoggedRef.current) {
      guestEditorOpenedLoggedRef.current = true;
      queueGuestEvent("guest_editor_opened");
    }

    const hasContent = A4_Elements.some(
      (el) => !(el.category === "text" || el.category === "textarea") || (el.content || "").trim() !== ""
    );
    if (!hasContent) return undefined;

    const timer = setTimeout(() => {
      saveGuestDocument({
        elements: A4_Elements,
        deletedIds: A4_Elements_deleted.map((el) => el.element_id),
        title: titleRef.current?.value || "",
        pageCount,
        editorMode,
        templateId: activeTemplateId,
        spacingPx: flowSpacing,
        isDemoContent: isDemoContentRef.current,
        // Keep wizard/import profile next to the canvas JSON so "Zmień szablon"
        // can be re-enabled after register/login (React state does not survive).
        cvData: activeCvDataRef.current,
        updatedAt: Date.now(),
      });
      if (!guestFirstEditLoggedRef.current) {
        guestFirstEditLoggedRef.current = true;
        queueGuestEvent("guest_first_edit");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    A4_Elements,
    A4_Elements_deleted,
    activeCvData,
    activeTemplateId,
    editorMode,
    flowSpacing,
    pageCount,
    pdfId,
    titleRef,
  ]);

  // Upload lives inside the gallery panel (lower third dropzone), so the
  // sidebar "Prześlij zdjęcia" control opens the same sliding gallery.
  const handleShowDropzone = useCallback(() => {
    const next = panel !== 'gallery';
    setPanel(next ? 'gallery' : null);
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
      || startIntent === "demo"
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

  // Demo path: load the Regent starter with the fuller executive persona
  // once, no dialog, so the visitor lands on an editable document instead
  // of a template picker.
  const demoStartAppliedRef = useRef(false);
  useEffect(() => {
    if (initialStartIntentRef.current !== "demo" || demoStartAppliedRef.current) return;
    demoStartAppliedRef.current = true;
    handleLoadTemplate(regentTemplate, "DEMO_CV", "regent");
    setIsDemoContent(true);
    // The shared zoom step is 10%, so five increments land exactly on 150%
    // without introducing a separate demo-only zoom setter.
    for (let i = 0; i < 5; i += 1) zoomIn();
    queueGuestEvent("guest_demo_loaded");
    markTemplatesModalSeen();
  }, [handleLoadTemplate, markTemplatesModalSeen, zoomIn]);

  const handleShowAiPanel = useCallback(() => {
    const next = dialog !== 'ai';
    setDialog(next ? 'ai' : null);
    if (next) setPanel(null);
  }, [dialog])

  // Plain open/close toggle — used to OPEN the wizard (Topbar, AiCvPanel) and
  // to CLOSE it after a successful fill (BioCvModal.handleFill). The success
  // path must never redirect to landing, so the wizard-entry redirect below
  // deliberately lives in a separate function that only the user's own
  // Cancel/X action calls — see `handleCancelBioCvModal`.
  const handleShowBioCvModal = useCallback(() => {
    const next = dialog !== 'bioCv';
    setDialog(next ? 'bioCv' : null);
    if (next) setPanel(null);
  }, [dialog])

  // A guest who arrives via the landing page's "Stwórz CV od początku"
  // (`?start=wizard`) never sees the editor first — the wizard is the very
  // first thing that opens. Cancelling it without filling anything used to
  // just clear the dialog, stranding them on an empty freeform canvas with no
  // explanation of what happened or how to get back.
  //
  // This is a dedicated action (not folded into `handleShowBioCvModal` above)
  // because that toggle is also how `BioCvModal.handleFill` closes the dialog
  // on a SUCCESSFUL fill — and `handleFill`'s closure over `showBioCvModal`
  // is captured at wizard-open time, before any canvas content exists, so an
  // `A4_Elements`-based check inside the shared toggle cannot tell a
  // just-succeeded fill apart from a genuine cancel: it always sees the
  // stale, still-empty snapshot from when the wizard opened. Routing only the
  // real Cancel/X button (`BioCvModal.handleClose`) through this separate,
  // synchronously-invoked handler avoids that stale-closure trap entirely.
  // Only the very first cancel of this specific entry wizard redirects;
  // reopening the wizard later from the Topbar, or cancelling after content
  // already exists, just closes the dialog as it always has.
  const wizardEntryNavigatedRef = useRef(false);
  const handleCancelBioCvModal = useCallback(() => {
    if (
      initialStartIntentRef.current === 'wizard'
      && !wizardEntryNavigatedRef.current
      && A4_Elements.length === 0
    ) {
      wizardEntryNavigatedRef.current = true;
      navigate('/');
      return;
    }
    setDialog(null);
  }, [A4_Elements, navigate])

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

  // ── "CV too long" flow ────────────────────────────────────────────────────
  // Commit a fit result as ONE undoable entry: set the winning rhythm, reconcile
  // fixed page chrome, and (unless silent) toast. Matches every other layout
  // mutation's history footprint.
  const commitFit = useCallback((fit, { silent = false } = {}) => {
    if (!fit) return;
    setFlowSpacing(fit.spacing);
    setA4_Elements(
      reconcileDocumentPages(fit.elements, nanoid, { collapseEmpty: true }).elements,
    );
    if (!silent) {
      pushToast({ title: 'Układ dopasowany.', variant: 'success' });
    }
  }, [setFlowSpacing, setA4_Elements, pushToast]);

  // AI shortening step: Pro only (assistant is Pro-gated). Free users get the
  // plan upsell; Pro users open the assistant with the `shorten` action and we
  // record the current page count so a later drop can toast the result.
  const canUseAiAssistant = Boolean(entitlements?.ai_assistant);
  const handleRequestAiShorten = useCallback(() => {
    closeLongCvModal();
    if (!canUseAiAssistant) {
      // Free plan: the assistant is Pro-gated, so route to the upsell instead.
      handleShowPlanModal();
      return;
    }
    shortenBaselinePagesRef.current = pageCount;
    requestAssistantAction('shorten');
  }, [canUseAiAssistant, handleShowPlanModal, pageCount, requestAssistantAction, closeLongCvModal]);

  // Sidebar templates (Tessera, Slate, Harbor, Sterling, …) only
  // ever author the rail on page 1 — a continuation page repeats the rail
  // background/divider with no sidebar content — so the same "too long"
  // assistant applies one page sooner and always targets exactly one page
  // (see SIDEBAR_TOO_LONG_MIN_PAGES / documentLength.js).
  const isSidebarTemplate = useMemo(
    () => templateHasLayout(
      TEMPLATES.find((template) => template.id === activeTemplateId),
      'sidebar',
    ),
    [activeTemplateId],
  );

  // Target page count: sidebar rails only ever render on page 1, so exactly 1;
  // single-column shrinks one page at a time. Mirrors diagnoseDocumentLength.
  const fitTargetPages = useMemo(
    () => (isSidebarTemplate ? 1 : Math.max(1, (pageCount ?? 1) - 1)),
    [isSidebarTemplate, pageCount],
  );

  // Flagship action: find the loosest rhythm that fits the target, then route.
  const onFitToPages = useCallback(() => {
    const pageHeight = pageSize?.height ?? 842;
    const fit = findFitForTarget({
      elements: A4_Elements,
      loosest: baselineFlowSpacing,
      tightest: MIN_FLOW_SPACING,
      targetPages: fitTargetPages,
      pageHeight,
    });
    const { action } = resolveFitAction(fit);
    if (action === "commit") {
      commitFit(fit);
    } else if (action === "emergency") {
      longCvOpenRef.current = true;
      setLongCvModal({ open: true, variant: "emergency", fit });
    } else {
      longCvOpenRef.current = true;
      setLongCvModal({ open: true, variant: "impossible", fit: null });
    }
  }, [A4_Elements, baselineFlowSpacing, fitTargetPages, pageSize, commitFit]);

  // Emergency modal's "Maksymalnie zacieśnij": apply the hard-floor fit.
  const onForceTighten = useCallback(() => {
    const fit = longCvModal.fit;
    closeLongCvModal();
    commitFit(fit);
  }, [longCvModal.fit, closeLongCvModal, commitFit]);

  // `fitTooLong` is a cheap badge flag (no packing) driving the sidebar/section
  // panel indicator; `fitStatus` runs the ~10-candidate packing probe, but only
  // while the "Sekcje" (sections) panel is open, so we never pack on every edit.
  const fitTooLong = useMemo(
    () => editorMode === EDITOR_MODE_TEMPLATE && (pageCount ?? 1) > fitTargetPages,
    [editorMode, pageCount, fitTargetPages],
  );

  const fitStatus = useMemo(() => {
    if (!isSectionsPanel || !fitTooLong) return null;
    const pageHeight = pageSize?.height ?? 842;
    const fit = findFitForTarget({
      elements: A4_Elements,
      loosest: baselineFlowSpacing,
      tightest: MIN_FLOW_SPACING,
      targetPages: fitTargetPages,
      pageHeight,
    });
    return {
      reducible: true,
      tier: fit.tier,
      targetLabel: formatFitTargetLabel(fitTargetPages),
    };
  }, [isSectionsPanel, fitTooLong, A4_Elements, baselineFlowSpacing, fitTargetPages, pageSize]);

  // Auto-detect a too-long CV once per logical document+template. Identity
  // reset and detection share one effect so a trailing reset cannot clear the
  // "already offered" guard after detection in the same commit (that race was
  // stacking a second LongCv DialogShell when the first autosave assigned a
  // pdfId or activeTemplateId settled after the modal had already opened).
  useEffect(() => {
    const identity = { pdfId, templateId: activeTemplateId };
    if (shouldResetLongCvOffer(longCvIdentityRef.current, identity)) {
      longCvOfferedForRef.current = null;
      shortenBaselinePagesRef.current = null;
      if (longCvOpenRef.current) {
        longCvOpenRef.current = false;
        setLongCvModal({ open: false, variant: null, fit: null });
      }
    }
    longCvIdentityRef.current = identity;

    if (editorMode !== EDITOR_MODE_TEMPLATE) return;
    if (longCvOfferedForRef.current) return;
    const minTooLongPages = isSidebarTemplate ? SIDEBAR_TOO_LONG_MIN_PAGES : TOO_LONG_MIN_PAGES;
    if (pageCount < minTooLongPages) return;
    // One gentle, non-blocking nudge per document — the badge (fitTooLong) stays
    // visible; the panel owns the actual fit affordance.
    longCvOfferedForRef.current = identity;
    pushToast({
      title: 'Twoje CV jest dość długie',
      msg: `Zajmuje ${pageCount} stron — w panelu „Układ CV” zobaczysz, jak zmieścić je na mniej.`,
      variant: 'info',
    });
  }, [
    activeTemplateId,
    editorMode,
    isSidebarTemplate,
    pageCount,
    pdfId,
    pushToast,
  ]);

  // Success toast after AI shortening reduces the page count below the value
  // captured when the shorten flow began (see handleRequestAiShorten).
  useEffect(() => {
    const baseline = shortenBaselinePagesRef.current;
    if (baseline == null) return;
    if (pageCount < baseline) {
      // AI reclaimed a page — now recover whitespace: loosest rhythm (down to
      // COMPACT) that still fits the achieved page count. Silent, undoable.
      const pageHeight = pageSize?.height ?? 842;
      const relaxed = findFitForTarget({
        elements: A4_Elements,
        loosest: baselineFlowSpacing,
        tightest: COMPACT_FLOW_SPACING,
        targetPages: pageCount,
        pageHeight,
      });
      if (relaxed.fits && !flowSpacingEquals(relaxed.spacing, flowSpacing)) {
        commitFit(relaxed, { silent: true });
      }
      pushToast({
        title: 'Gotowe',
        msg: `CV skrócone z ${baseline} do ${pageCount} stron.`,
        variant: 'success',
      });
      shortenBaselinePagesRef.current = null;
    }
  }, [pageCount, pushToast, A4_Elements, baselineFlowSpacing, flowSpacing, pageSize, commitFit]);

  const handleShowSections = useCallback(() => {
    const next = panel !== 'sections';
    setPanel(next ? 'sections' : null);
    if (next) setDialog(null);
  }, [panel])


  const createPdfWithElements = useCallback(() => {
    createPdf(A4_Elements, titleRef, pageCount, pageSize, {
      editorMode,
      templateId: activeTemplateId,
      flowSpacing,
    });
  }, [A4_Elements, activeTemplateId, createPdf, editorMode, flowSpacing, titleRef, pageCount, pageSize]);

  // Update the already-saved document in place. `intent: "save"` marks this as a
  // persistence write (not a download), so the post-spinner effect shows the
  // "Zapisano" toast rather than any download handling.
  const updatePdfWithElements = useCallback(() => {
    updatePdf(A4_Elements, pdfId, titleRef, A4_Elements_deleted, pageCount, pageSize, {
      editorMode,
      templateId: activeTemplateId,
      flowSpacing,
      intent: "save",
    });
  }, [
    A4_Elements,
    activeTemplateId,
    editorMode,
    flowSpacing,
    pdfId,
    updatePdf,
    titleRef,
    A4_Elements_deleted,
    pageCount,
    pageSize,
  ]);

  // Render the current canvas to a PDF and download it — independent of
  // "Zapisz". Works even for a never-saved document because the backend renders
  // on demand without persisting. Guests cannot export (no account for the
  // metered quota), so they see the same save-gate as "Zapisz".
  const handleDownloadClick = useCallback(async () => {
    if (!localStorage.getItem("token")) {
      queueGuestEvent("save_gate_shown");
      setDialog('saveGate');
      return;
    }
    try {
      const { blob, title } = await downloadPdf(A4_Elements, titleRef, pageCount, pageSize, {
        editorMode,
        templateId: activeTemplateId,
        flowSpacing,
      });
      triggerBlobDownload(blob, title);
      pushToast({
        title: "CV gotowe do pobrania",
        msg: `Pobrano plik ${title}.`,
        variant: "success",
        action: { label: "Pobierz PDF", href: blob, download: title },
      });
      // A download consumes an export entitlement; refresh so the plan counter
      // reflects it without waiting for the next natural fetch.
      refreshEntitlements?.();
    } catch (error) {
      console.error("Nie udało się pobrać PDF.", error);
      pushToast({
        title: error?.code?.startsWith?.("plan_") ? "Limit planu" : "Pobieranie nie powiodło się",
        msg: planErrorMessage(error, "Nie udało się przygotować pobierania PDF."),
        variant: "error",
      });
    }
  }, [
    A4_Elements,
    activeTemplateId,
    downloadPdf,
    editorMode,
    flowSpacing,
    pageCount,
    pageSize,
    pushToast,
    refreshEntitlements,
    titleRef,
  ]);

  // "Zapisz" is the ONLY path that writes to "Moje dokumenty". The first save
  // creates the document (and its pdfId); every later save updates that same
  // document in place instead of spawning a new copy. Guests have no backend
  // document yet, so they see the save-gate instead of a 401.
  const handleSaveClick = useCallback(() => {
    if (!localStorage.getItem("token")) {
      queueGuestEvent("save_gate_shown");
      setDialog('saveGate');
      return;
    }
    if (pdfId == null) {
      createPdfWithElements();
    } else {
      updatePdfWithElements();
    }
  }, [createPdfWithElements, updatePdfWithElements, pdfId]);

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

  function handlePdfId(pdfId) {
    setPdfId(pdfId)
  }

  // Loading a template / AI doc / clearing starts a fresh, unsaved document,
  // replacing the current canvas. Confirm first so unsaved edits are not lost
  // (background autosave no longer persists them). Callers that already ran
  // their own discard prompt pass `skipDiscardGuard` to avoid a double dialog.
  const startFreshDocument = useCallback((loadDocument, { skipDiscardGuard = false } = {}) => {
    if (!skipDiscardGuard && !confirmDiscardActiveEdits()) return;
    setPdfId(null);
    // A brand-new document has no known cv_data yet. AiCvPanel/BioCvModal
    // set it again right after a successful fill; every other fresh-start
    // path (blank template, cleared canvas) correctly leaves it cleared.
    setActiveCvData(null);
    // The canvas is about to hold something other than the demo CV — clear
    // the flag here, once content is actually replacing it, rather than at
    // the moment the user merely clicks "Użyj własnych danych". Clearing it
    // on click (before the wizard runs) left the demo content on screen
    // with no banner if the wizard was then cancelled, since this is the
    // only path that actually swaps canvas content.
    setIsDemoContent(false);
    loadDocument();
  }, [confirmDiscardActiveEdits]);

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
        // This template-specific prompt already asks the user to confirm
        // discarding the current document, so skip the generic discard guard
        // inside startFreshDocument to avoid stacking two dialogs.
        const leaveTemplate = window.confirm(
          "Wyczyścić dokument?\n\nOK — zacznij pusty projekt własny.\nAnuluj — pozostaw bieżący szablon.",
        );
        if (!leaveTemplate) return;
        startFreshDocument(handleClearA4, { skipDiscardGuard: true });
        return;
      }
      startFreshDocument(handleClearA4);
    },
    [editorMode, handleClearA4, startFreshDocument],
  );

  // Unlocking freeform CLONES the current canvas into a new, unsaved freeform
  // copy (fresh element ids, cleared pdfId). No edits are discarded — the
  // in-memory content is carried into the copy — so no discard guard is needed.
  const confirmUnlockFreeform = useCallback(() => {
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
  }, [
    A4_Elements,
    handleUnlockFreeform,
    pushToast,
    resetHistory,
    setA4_Elements,
    setA4_Elements_deleted,
  ]);

  const hydrateDocumentMode = useCallback((elements, pdfMeta = {}) => {
    const savedMode = pdfMeta.editor_mode ?? pdfMeta.editorMode;
    const savedTemplate = pdfMeta.template_id ?? pdfMeta.templateId ?? null;
    const savedSpacing = pdfMeta.spacing_px ?? pdfMeta.spacingPx ?? pdfMeta.flowSpacing;
    // Pin Reset to the loaded document's rhythm (or generator defaults).
    adoptDocumentFlowSpacing(savedSpacing || DEFAULT_FLOW_SPACING);
    if (savedTemplate) setActiveTemplateId(savedTemplate);
    else setActiveTemplateId(null);
    if (savedMode) {
      setEditorMode(normalizeEditorMode(savedMode));
      return;
    }
    setEditorMode(inferEditorMode(elements, savedTemplate));
  }, [adoptDocumentFlowSpacing, setActiveTemplateId, setEditorMode]);

  // Offer to claim a buffered guest document once a JWT exists — covers both
  // the save-gate's register/login round trip and simply reloading the page
  // with a token already present and a leftover guest doc (e.g. the browser
  // was closed mid-edit before registering). Runs once per mount; guarded so
  // a stray second render cannot re-offer.
  //
  // A guest document is scoped to the BROWSER, not to any identity — it has
  // no relationship to whoever happens to authenticate next. Auto-claiming it
  // silently used to hand one person's draft CV (potentially containing real
  // personal data) to a completely unrelated account the moment they logged
  // into the same browser. Requiring an explicit "yes, that's mine" via
  // ClaimGuestDocumentModal below closes that leak while still supporting the
  // legitimate case: the same visitor who edited as a guest and later signs
  // in themselves.
  //
  // Deliberately placed after `hydrateDocumentMode` (rather than immediately
  // next to the Task 7 guest-autosave effect above) because the confirm
  // handler references `hydrateDocumentMode`, which is declared via
  // `useCallback` just above this line — referencing it earlier in the
  // component body would hit the temporal-dead-zone for that `const` binding.
  const claimOfferedRef = useRef(false);
  const pendingGuestDocRef = useRef(null);
  const wizardDraftAdoptedRef = useRef(false);
  useEffect(() => {
    if (claimOfferedRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    const guestDoc = loadGuestDocument();
    if (!guestDoc || !Array.isArray(guestDoc.elements) || guestDoc.elements.length === 0) return;

    claimOfferedRef.current = true;
    pendingGuestDocRef.current = guestDoc;
    setDialog('claimGuest');
  }, []);

  // Promote Demo/guest wizard answers into `/ai/bio_cv_draft` as soon as a
  // JWT exists — independent of which plan the account is on (Free today;
  // additional plans at registration later). Runs once per mount; BioCvModal
  // also adopts on open as a safety net if this effect has not finished yet.
  useEffect(() => {
    if (wizardDraftAdoptedRef.current) return;
    const token = localStorage.getItem("token");
    if (!token || !hasGuestWizardDraft()) return;
    wizardDraftAdoptedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await adoptGuestWizardDraftForAccount(
          new ApiClient({ Authorization: `Bearer ${token}` }),
        );
      } catch (error) {
        if (!cancelled) {
          // Allow BioCvModal to retry on open; do not clear the guest draft
          // here on transport/auth failure.
          wizardDraftAdoptedRef.current = false;
          console.warn("Nie udało się przenieść szkicu kreatora gościa na konto.", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the browser-buffered guest JSON onto the A4 canvas only.
  // Do not call `createPdf` / `POST /pdf/create_pdf` here — that would render
  // and persist a server document (and count toward Free export limits)
  // before the user asked to save. They keep an unsaved canvas (`pdfId`
  // null) and use “Zapisz PDF” when ready.
  //
  // Elements are applied directly via `hydrateDocumentMode` instead of
  // `handleLoadTemplate` / `handleLoadAiElements`. Those call
  // `materializeElementSpecs`, which mints fresh `element_id`s and remaps
  // connectors through a symbolic `spec.id` that raw guest-canvas elements
  // do not carry — re-materializing would silently break connectors.
  // `hydrateDocumentMode` is the same primitive `ModalPdfs.showPDF` uses.
  const handleClaimGuestDocumentConfirm = useCallback(() => {
    const guestDoc = pendingGuestDocRef.current;
    pendingGuestDocRef.current = null;
    setDialog(null);
    if (!guestDoc) return;

    // Flush anything queued while anonymous — including this claim, queued
    // just below — through the normal authenticated event log.
    queueGuestEvent("guest_doc_claimed");
    const buffered = loadGuestEvents();
    buffered.forEach((event) => logEvent(event.eventType));
    clearGuestEvents();

    // Unsaved editor document: authenticated autosave waits for a real pdfId.
    setPdfId(null);
    setA4_Elements(guestDoc.elements);
    setA4_Elements_deleted([]);
    resetHistory();
    hydrateDocumentMode(guestDoc.elements, {
      editorMode: guestDoc.editorMode,
      templateId: guestDoc.templateId,
      spacingPx: guestDoc.spacingPx,
    });
    setPageCount(guestDoc.pageCount || 1);
    setCurrentPage(1);
    if (titleRef.current && guestDoc.title) {
      titleRef.current.value = guestDoc.title;
    }
    setIsDemoContent(Boolean(guestDoc.isDemoContent));
    clearGuestDocument();

    // Re-enable Topbar "Zmień szablon": fill set `activeCvData` in the guest
    // session, but register/login remounts PdfCanvas and drops that state.
    // Rebuild from guest snapshot → wizard draft → account bio draft.
    const token = localStorage.getItem("token");
    resolveActiveCvData({
      guestCvData: guestDoc.cvData,
      api: token
        ? new ApiClient({ Authorization: `Bearer ${token}` })
        : null,
    }).then((cvData) => {
      setActiveCvData(cvData);
    }).catch(() => {
      setActiveCvData(null);
    });

    pushToast({
      title: "Szkic wczytany",
      msg: "Dokument jest na płótnie. Zapisz go, gdy będziesz gotowy.",
      variant: "success",
    });
  }, [
    hydrateDocumentMode,
    pushToast,
    resetHistory,
    setA4_Elements,
    setA4_Elements_deleted,
    setActiveCvData,
    setCurrentPage,
    setIsDemoContent,
    setPageCount,
    titleRef,
  ]);

  // Declining discards the buffered draft outright rather than leaving it to
  // be re-offered to the next person who logs in on this browser — the same
  // ownership ambiguity that makes auto-claiming unsafe would make a silent
  // "keep asking" retry just as unsafe.
  const handleClaimGuestDocumentDecline = useCallback(() => {
    pendingGuestDocRef.current = null;
    clearGuestDocument();
    clearGuestEvents();
    setDialog(null);
  }, []);

  // A successful delete clears the local canvas for the row that was just
  // removed from the server. Background autosave is gone, so there is no pending
  // timer to cancel — dropping the pdfId is enough to detach the canvas.
  const discardActiveDocument = useCallback(() => {
    setPdfId(null);
    setActiveCvData(null);
    handleClearA4();
  }, [handleClearA4]);

  // Demo-banner actions: both leave demo mode. "Use own data" keeps the
  // demo content AND banner on screen and opens the bio-CV wizard so the
  // visitor can replace it in place; the demo flag itself is only cleared in
  // `startFreshDocument`, once the wizard actually fills a real document —
  // if the visitor cancels the wizard, the demo CV and its banner are still
  // there, exactly as before the click. "Start blank" discards the demo
  // content immediately since it is not a two-step flow that can be
  // cancelled, mirroring the blank-start effect above.
  const handleDemoUseOwnData = useCallback(() => {
    setDialog('bioCv');
  }, []);

  const handleDemoStartBlank = useCallback(() => {
    setIsDemoContent(false);
    setEditorMode(EDITOR_MODE_FREEFORM);
    setActiveTemplateId(null);
    handleClearA4();
  }, [handleClearA4, setActiveTemplateId, setEditorMode]);

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
    addPolygon: handleAddPolygon,
    addPath: handleAddPath,
    addConnector: () => {},
    addTextarea: handleAddTextarea,
    addSection: handleAddSection,
    openAddSectionModal,
    openFlatSectionLayoutModal,
    openSkillsLayoutModal,
    addSectionRecord: handleAddSectionRecord,
    addRecordBlock: handleAddRecordBlock,
    removeSection: handleRemoveSection,
    removeRecordBlock: handleRemoveRecordBlock,
    reorderRecordBlock: handleReorderRecordBlock,
    reorderSection: handleReorderSection,
    transferSectionLane: handleTransferSectionLane,
    changeSkillsDisplayMode: handleChangeSkillsDisplayMode,
    markSelected,
    setTextareaEditing: handleSetTextareaEditing,
    requestEditZoomRestore,
    selectElement: handleSelectElement,
    moveElement: handleMoveElement,
    moveSelectedElements: handleMoveSelectedElements,
    selectMoveElement: handleSelectMoveElement,
    spacingHoldId,
    setSpacingHoldId,
    editElementValues: handleEditElementValues,
    collapseSpilledMainIntoSidebar: handleCollapseSpilledMainIntoSidebar,
    editSelectedElementValues: handleEditSelectedElementValues,
    fitTextareaToContent: handleFitTextareaToContent,
    applyStructureOperation,
    applyCloneOperation,
    applyDeleteOperation,
    removeContactChannel,
    addContactChannel,
    toggleNameCase,
    toggleTitle,
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
    confirmDiscardActiveEdits,
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
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    adoptDocumentFlowSpacing,
    hydrateDocumentMode,
    fitTooLong,
    fitStatus,
    onFitToPages,
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
    downloadPdf: handleDownloadClick,
    createPdf: handleSaveClick,
    isPdfLoading,
    layoutPreviewPatches,
    setLayoutPreviewPatches,
    structurePreviewGroup,
    setStructurePreviewGroup,
    deletionPreviewIds,
    setDeletionPreviewIds,
    aiCorrectionHighlights,
    setAiCorrectionHighlights,
  }), [
    A4_Elements, groupMoveDelta, setPageCanvasRef, isPdfLoading, pdfId, setA4_Elements_deleted,
    handleAddImage, handleAddText, handleAddLine, handleAddRectangle, handleAddCircle, handleAddEllipse,
    handleAddPolygon, handleAddPath,
    handleSelectElement, handleMoveElement, handleMoveSelectedElements, handleSelectMoveElement,
    handleSaveClick, applyStructureOperation, applyCloneOperation, applyDeleteOperation,
    removeContactChannel, addContactChannel, toggleNameCase, toggleTitle,
    handleEditElementValues, handleEditSelectedElementValues, handleFitTextareaToContent, applyLayoutPatches,
    handleAlignElements, handleDeleteElement, handleDeleteSelectedElements, handleDuplicateSelectedElements,
    setA4_Elements, handleResizeElement, handleDownloadClick,
    clearA4Fresh, discardActiveDocument, confirmDiscardActiveEdits, loadTemplateFresh, loadTemplateWithFillFresh,
    loadAiElementsFresh, handleLoadAiElements, activeTemplateId, setActiveTemplateId,
    editorMode, setEditorMode, flowSpacing, setFlowSpacing, baselineFlowSpacing, adoptDocumentFlowSpacing, hydrateDocumentMode, fitTooLong, fitStatus, onFitToPages, handleShowUnlockFreeform, handleUnlockFreeform,
    activeCvData, setActiveCvData,
    pageCount, currentPage, addPage, removePage, goToPage, clonePage, movePage, setPageCount, setCurrentPage,
    isTwoPageView, toggleTwoPageView, handleAddTextarea, handleAddSection, openAddSectionModal, openFlatSectionLayoutModal, openSkillsLayoutModal, handleAddSectionRecord, handleAddRecordBlock, handleRemoveSection, handleRemoveRecordBlock, handleReorderRecordBlock, handleReorderSection, handleTransferSectionLane, handleChangeSkillsDisplayMode, markSelected, handleSetTextareaEditing, requestEditZoomRestore, editZoomSpreadTransitionRef,
    handleDuplicateElement, pageSize, zoom, zoomIn, zoomOut, undo, redo, canUndo, canRedo, resetHistory,
    deletionPreviewIds, layoutPreviewPatches, structurePreviewGroup, spacingHoldId,
    aiCorrectionHighlights,
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
    cancelBioCvModal: handleCancelBioCvModal,
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
    // Bridge for the "CV too long" modal to open the AI assistant with a
    // preset action (shorten). AiAssistant watches assistantAction.nonce.
    assistantAction,
    requestAssistantAction,
  }), [
    isTemplates, handleShowTemplates, autoOpenedTemplates, markTemplatesModalSeen,
    isAiPanel, handleShowAiPanel, isBioCvModal, handleShowBioCvModal, handleCancelBioCvModal,
    isPlanModal, handleShowPlanModal, isChangeTemplateModal, handleShowChangeTemplateModal,
    handleShowUnlockFreeform,
    isGallery, handleShowGallery, isSectionsPanel, handleShowSections,
    isDropzone, handleShowDropzone,
    valueImageUpload, setValueImageUpload, isModalPdfs, setIsModalPdfs,
    assistantAction, requestAssistantAction,
  ]);

  // Guest visits never carry a token, and every transition into an
  // authenticated session (login/register redirect, or a fresh reload with
  // an existing token) remounts PdfCanvas — so a plain read here is already
  // correct for the whole mount; it does not need to be state.
  const isGuest = !localStorage.getItem("token");

  const sessionValue = useMemo(() => ({
    handlePdfId,
    pushToast,
    entitlements,
    refreshEntitlements,
    logout: handleLogout,
    isGuest,
    PDFs,
    setPDFs,
    pdfsLoaded,
    setPdfsLoaded,
  }), [
    handlePdfId, pushToast, entitlements, refreshEntitlements, handleLogout, isGuest,
    PDFs, setPDFs, pdfsLoaded, setPdfsLoaded,
  ]);

  // Temporary facade — remove once all consumers use the focused hooks.
  const ctxValue = useMemo(
    () => ({ ...canvasValue, ...uiValue, ...sessionValue }),
    [canvasValue, uiValue, sessionValue],
  );

  // Empty-state onboarding: replace the blank freeform A4 a fresh user lands on
  // with the two guided paths (wizard / import). Gating lives in the pure
  // `shouldShowStartChooser` helper so it can be unit-tested without a DOM.
  const showStartChooser = shouldShowStartChooser({
    elementsCount: A4_Elements.length,
    isDemoContent,
    isPdfLoading,
    pdfId,
    dismissed: startChooserDismissed,
  });

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
              <SaveGateModal
                open={isSaveGateModal}
                onCancel={() => setDialog(null)}
              />
              <ClaimGuestDocumentModal
                open={isClaimGuestModal}
                title={pendingGuestDocRef.current?.title || null}
                onConfirm={handleClaimGuestDocumentConfirm}
                onDecline={handleClaimGuestDocumentDecline}
              />
              <AddSectionModal
                open={addSectionModal.open}
                onCancel={closeAddSectionModal}
                onConfirm={handleConfirmAddSection}
                iconOptions={addSectionIconOptions}
                insertAfterHeading={Boolean(addSectionModal.afterHeadingId)}
              />
              <FlatSectionLayoutModal
                open={flatSectionLayoutModal.open}
                onCancel={closeFlatSectionLayoutModal}
                element={flatSectionLayoutElement}
                onApply={handleApplyFlatSectionLayout}
              />
              <SkillsLayoutModal
                open={skillsLayoutModal.open}
                onCancel={closeSkillsLayoutModal}
                elements={A4_Elements}
                headingId={skillsLayoutModal.headingId}
                pageHeight={pageSize?.height ?? 842}
                onApply={handleApplySkillsLayout}
              />
              <LongCvModal
                open={longCvModal.open}
                variant={longCvModal.variant}
                targetPages={fitTargetPages}
                canUseAi={canUseAiAssistant}
                onForceTighten={onForceTighten}
                onRequestAiShorten={handleRequestAiShorten}
                onClose={closeLongCvModal}
              />
              <Sidebar>
                {isSectionsPanel ? (
                  <SectionsPanel onClose={() => setPanel(null)} />
                ) : null}
              </Sidebar>
              {/* Floating property inspector (portal); not docked to the tool rail. */}
              <Editor />
              <div className="right-pane">
                {isDemoContent ? (
                  <DemoBanner onUseOwnData={handleDemoUseOwnData} onStartBlank={handleDemoStartBlank} />
                ) : null}
                <Topbar titleRef={titleRef} />
                {/* Portal loader: card sits 100px under the live A4 top edge
                    (viewport px via A4ref), independent of canvas zoom. */}
                {isPdfLoading ? (
                  <Spinner loading={isPdfLoading} anchorRef={A4ref} />
                ) : null}
                <div className="canvas-area" ref={canvasAreaRef} onClick={handleCanvasBackgroundClick}>
                  {showStartChooser ? (
                    <StartChooser
                      onWizard={handleShowBioCvModal}
                      onImport={handleShowAiPanel}
                      onBlank={() => setStartChooserDismissed(true)}
                    />
                  ) : null}
                  <div className={isTwoPageView ? "canvas-spread" : "canvas-single"}>
                    {isTwoPageView ? (
                      visiblePages.map((page) => (
                        <A4
                          key={page}
                          page={page}
                          width={`${pageSize.width}px`}
                          height={`${pageSize.height}px`}
                          zoom={1}
                          isSpread
                          ref={(node) => setPageCanvasRef(page, node)}
                          onPointerDownCapture={(event) => handleCanvasPointerDownCapture(event, page)}
                        >
                          <div style={layoutPreviewPatches.length > 0 || structurePreviewGroup || deletionPreviewIds.length > 0 ? { pointerEvents: "none" } : undefined}>
                            <CanvasElements elements={previewedElements.filter((element) => (element.page ?? 1) === page)} />
                            <Connectors elements={previewedElements} page={page} />
                            <AiCorrectionOverlay elements={previewedElements} page={page} />
                            <SelectionOverlay elements={previewedElements} page={page} />
                            <Guides page={page} />
                          </div>
                        </A4>
                      ))
                    ) : (
                      <CanvasPageStage
                        pageKey={visiblePages[0] ?? currentPage}
                        direction={pageNav.direction}
                        animate
                      >
                        {visiblePages.map((page) => (
                          <A4
                            key={page}
                            page={page}
                            width={`${pageSize.width}px`}
                            height={`${pageSize.height}px`}
                            zoom={zoom}
                            isSpread={false}
                            ref={(node) => setPageCanvasRef(page, node)}
                            onPointerDownCapture={(event) => handleCanvasPointerDownCapture(event, page)}
                          >
                            <div style={layoutPreviewPatches.length > 0 || structurePreviewGroup || deletionPreviewIds.length > 0 ? { pointerEvents: "none" } : undefined}>
                              <CanvasElements elements={previewedElements.filter((element) => (element.page ?? 1) === page)} />
                              <Connectors elements={previewedElements} page={page} />
                              <AiCorrectionOverlay elements={previewedElements} page={page} />
                              <SelectionOverlay elements={previewedElements} page={page} />
                              <Guides page={page} />
                            </div>
                          </A4>
                        ))}
                      </CanvasPageStage>
                    )}
                  </div>
                </div>
              </div>
              <Gallery />
              {entitlements?.ai_assistant ? <AiAssistant /> : null}
              <ToastStack toasts={toasts} onDismiss={dismissToast} />
            </PdfContext.Provider>
          </SessionContext.Provider>
        </UiSurfacesContext.Provider>
      </CanvasContext.Provider>
    </main>
  )
}

export default PdfCanvas;