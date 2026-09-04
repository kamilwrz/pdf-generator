import Gallery from '../components/gallery/Gallery/Gallery';
import Sidebar from '../components/editor/Sidebar/Sidebar';
import Topbar from '../components/editor/Topbar/Topbar';
import DemoBanner from '../components/editor/DemoBanner/DemoBanner';
import StartChooser from '../components/editor/StartChooser/StartChooser';
import NewCvSetupModal from '../components/editor/NewCvSetupModal/NewCvSetupModal';
import A4 from "../components/canvas/A4/A4";
import CanvasPageStage from "../components/canvas/CanvasPageStage/CanvasPageStage";
import Editor from '../components/editor/Editor/Editor';
import { CanvasContext } from '../store/canvas-context';
import { UiSurfacesContext } from '../store/ui-surfaces-context';
import { SessionContext } from '../store/session-context';
import {
  DocumentLifecycleContext,
  useDocumentLifecycleController,
} from '../store/document-lifecycle-context';
import { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef} from 'react';
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
import ChangeTemplateModal from '../components/editor/Topbar/ChangeTemplateModal';
import UnlockFreeformModal from '../components/editor/UnlockFreeformModal/UnlockFreeformModal';
import SaveGateModal from '../components/editor/SaveGateModal/SaveGateModal';
import ClaimGuestDocumentModal from '../components/editor/ClaimGuestDocumentModal/ClaimGuestDocumentModal';
import SectionsPanel from '../components/editor/SectionsPanel/SectionsPanel';
import AddSectionModal from '../components/editor/AddSectionModal/AddSectionModal';
import FlatSectionLayoutModal from '../components/editor/FlatSectionLayoutModal/FlatSectionLayoutModal';
import SkillsLayoutModal from '../components/editor/SkillsLayoutModal/SkillsLayoutModal';
import LongCvModal from '../components/editor/LongCvModal/LongCvModal';
import { logEvent } from '../services/eventLog';
import { saveGuestDocument, loadGuestDocument, clearGuestDocument } from '../utils/guestDocument';
import { queueGuestEvent, loadGuestEvents, clearGuestEvents } from '../utils/guestEvents';
import { resolveActiveCvData } from '../utils/resolveActiveCvData';
import {
  clearGuestWizardDraft,
  guestWizardProfileHasContent,
  loadGuestWizardDraft,
} from '../utils/guestWizardDraft';
import { syncCvDataFromCanvas } from '../utils/syncCvDataFromCanvas';
import ScopedAiProvider from '../components/ai/ScopedAi/ScopedAiProvider';
import { fillTemplate } from '../services/fillTemplate';
import { shouldShowStartChooser } from '../utils/startChooser';
import { previewStructureOperation, reconcileDocumentPages } from '../utils/structureOperation';
import { visiblePageNumbers } from '../utils/pageSpread';
import { isTemplateAllowed, planErrorMessage } from '../utils/entitlements';
import { triggerBlobDownload } from '../utils/download';
import { useCanvasPageWheel } from '../hooks/useCanvasPageWheel';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import {
  createPersistedDocumentSnapshot,
  hasPersistedDocumentContent,
  persistedDocumentSignature,
} from '../utils/persistedDocumentSnapshot';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog/UnsavedChangesDialog';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { DialogSuspensionContext } from '../components/common/DialogShell/DialogSuspensionContext';
import {
  EDITOR_MODE_FREEFORM,
  EDITOR_MODE_TEMPLATE,
} from '../utils/editorMode';
import {
  COMPACT_FLOW_SPACING,
  DEFAULT_FLOW_SPACING,
  MIN_FLOW_SPACING,
  flowSpacingEquals,
  normalizeFlowSpacing,
} from '../utils/flowSpacing';
import {
  findFitForTarget,
  resolveFitAction,
  formatFitTargetLabel,
} from '../utils/fitToPages';
import { findTemplateFitForTarget } from '../utils/templatePageFit';
import { createCanvasTextWidthMeasurer } from '../utils/textareaHeight';
import { listSectionIconOptions } from '../utils/sectionIcons';
import { convertFlatListContent } from '../utils/flatSectionLayout';
import {
  getNextPageFitTarget,
  shouldResetLongCvOffer,
  TOO_LONG_MIN_PAGES,
  SIDEBAR_TOO_LONG_MIN_PAGES,
} from '../utils/documentLength';
import { lindenTemplate } from '../templates/linden';
import { TEMPLATES } from '../templates';
import { templateHasLayout } from '../utils/templateLayouts';
import { normalizeSterlingFamilyPersistence } from '../utils/sterlingAppearance';
import { normalizeProfilePhotoVisibilityPersistence } from '../utils/profilePhotoVisibility';
import { buildStarterDocument } from '../utils/cvStarter';
import { applyStarterElementStructure } from '../utils/starterElementStructure';
import { findRequiredCvNameElement, hasRequiredCvName } from '../utils/requiredCvName';
import { nanoid } from 'nanoid';
import { materializeElementSpecs } from '../utils/materializeElementSpecs';
import { markContentElementsEnter } from '../utils/canvasEnter';
import { normalizeCommittedDocumentSnapshot } from '../utils/documentSnapshotCommit';
/**
 * Authenticated CV editor page: canvas, toolbars, dialogs, and autosave.
 *
 * Composes `useA4Elements` + `usePdfExport` into focused Canvas, UiSurfaces,
 * and Session contexts. Consumers subscribe only to the domain they need,
 * preventing unrelated surface or session updates from invalidating canvas UI.
 * Dialog (`docs` / `templates` / AI / plan) and panel (`upload` / `gallery`)
 * surfaces are mutually exclusive so only one overlay owns focus at a time.
 */

// Session-scoped flag so the template-first onboarding modal (see
// markTemplatesModalSeen below) never re-triggers after being resolved once.
const TEMPLATES_MODAL_SEEN_KEY = "cv-studio:templatesModalSeen";
const LazyAiAssistant = lazy(() => import('../components/ai/AiAssistant/AiAssistant'));
const LazyAiCvPanel = lazy(() => import('../components/ai/AiCvPanel/AiCvPanel'));

function LazyAiFallback({ modal = false }) {
  return (
    <div
      className={modal ? "editor-lazy-status editor-lazy-status--modal" : "editor-lazy-status"}
      role="status"
      aria-live="polite"
    >
      Ładowanie narzędzia AI…
    </div>
  );
}

/**
 * Presentation/provider boundary for the editor.
 *
 * `EditorController` owns state, effects, persistence, and command callbacks.
 * This component owns only the DOM shell, error reset boundary, and context
 * topology. Keeping the boundary deliberately small avoids a risky mechanical
 * rewrite of the mature canvas view while making controller/view ownership
 * explicit and independently runtime-testable.
 */
export function EditorView({
  className,
  onMouseMove,
  dialogsSuspended = false,
  documentLifecycle,
  documentSessionKey,
  canvasValue,
  uiValue,
  sessionValue,
  children,
}) {
  return (
    <main className={className} onMouseMove={onMouseMove}>
      <DialogSuspensionContext.Provider value={dialogsSuspended}>
        <DocumentLifecycleContext.Provider value={documentLifecycle}>
          <ErrorBoundary resetKey={documentSessionKey} compact>
            <CanvasContext.Provider value={canvasValue}>
              <UiSurfacesContext.Provider value={uiValue}>
                <SessionContext.Provider value={sessionValue}>
                  {children}
                </SessionContext.Provider>
              </UiSurfacesContext.Provider>
            </CanvasContext.Provider>
          </ErrorBoundary>
        </DocumentLifecycleContext.Provider>
      </DialogSuspensionContext.Provider>
    </main>
  );
}

export function EditorController() {

  const navigate = useNavigate();
  const lifecycleController = useDocumentLifecycleController();
  const {
    sessionKey: documentSessionKey,
    observeDocumentSignature,
    captureDocumentScope,
    isDocumentScopeCurrent,
    advanceDocumentSession,
  } = lifecycleController;
  const [isGuest, setIsGuest] = useState(() => !getAccessToken());
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
      || startIntent === "new"
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
    if (initialStartIntentRef.current === "import") return getAccessToken() ? "ai" : "importGate";
    if (["new", "wizard"].includes(initialStartIntentRef.current)) return "newCv";
    if (initialStartIntentRef.current === "templates") return "templates";
    return null;
  }); // 'docs' | 'templates' | 'ai' | 'importGate' | 'saveGate' | 'newCv' | 'plan' | 'changeTemplate' | 'unlockFreeform' | null
  const [panel, setPanel] = useState(null);   // 'upload' | 'gallery' | 'sections' | null
  const isModalPdfs = dialog === 'docs' && Boolean(localStorage.getItem("token"));
  const isTemplates = dialog === 'templates';
  const isAiPanel = dialog === 'ai';
  const isNewCvSetupModal = dialog === 'newCv';
  const isPlanModal = dialog === 'plan';
  const isChangeTemplateModal = dialog === 'changeTemplate';
  const isUnlockFreeformModal = dialog === 'unlockFreeform';
  const isSaveGateModal = dialog === 'saveGate';
  const isImportGateModal = dialog === 'importGate' || (dialog === 'ai' && isGuest);
  const isClaimGuestModal = dialog === 'claimGuest';
  // Structured cv_data behind the CV currently on the canvas. It is created
  // by import or the A4 starter and restored from an owned document snapshot.
  const [activeCvData, setActiveCvData] = useState(null);
  // Set only when a canvas was materialized from an owned import snapshot.
  const [activeImportId, setActiveImportId] = useState(null);
  const [isDemoContent, setIsDemoContent] = useState(() => {
    if (startIntent === "demo") return true;
    if (getAccessToken() || initialStartIntentRef.current) return false;
    return Boolean(loadGuestDocument()?.isDemoContent);
  });
  const isDemoContentRef = useRef(isDemoContent);
  isDemoContentRef.current = isDemoContent;
  // Keep the explicitly chosen freeform path hidden for this empty workspace.
  const [startChooserDismissed, setStartChooserDismissed] = useState(false);
  const guestFirstEditLoggedRef = useRef(false);
  const guestEditorOpenedLoggedRef = useRef(false);
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
  // "CV too long" assistant: deterministic spacing + typography S runs first;
  // this modal opens only when those local changes still cannot hit the target.
  const [longCvModalOpen, setLongCvModalOpen] = useState(false);
  // Reuse one browser canvas so visible probes and the committed typography
  // transaction measure the same glyph widths and wrapping assumptions.
  const [fitTextWidthMeasurer] = useState(() => createCanvasTextWidthMeasurer());
  // Mirror of longCvModalOpen for the auto-open effect — reading state from
  // the effect deps re-ran detection on every open and raced the identity reset.
  const longCvOpenRef = useRef(false);
  const closeLongCvModal = useCallback(() => {
    longCvOpenRef.current = false;
    setLongCvModalOpen(false);
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
  // Backend revision for optimistic concurrency. This is intentionally
  // separate from DocumentLifecycleContext's local edit revision: the former
  // changes only after an authoritative persistence response.
  const [serverRevision, setServerRevision] = useState(null);
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
  // The title is controlled so typing participates in dirty-state snapshots.
  // Keep the ref for the existing PDF export boundary, which reads `.value`.
  const [documentTitle, setDocumentTitle] = useState("");
  const titleRef = useRef();

  const { toasts, pushToast, dismissToast } = useToasts();
  const { entitlements, refresh: refreshEntitlements } = useEntitlements(true);
  const [legacyDraft, setLegacyDraft] = useState(() => {
    const localDraft = loadGuestWizardDraft();
    return guestWizardProfileHasContent(localDraft?.profile)
      ? { ...localDraft, source: "browser" }
      : null;
  });

  useEffect(() => {
    const token = getAccessToken();
    if (!token || legacyDraft?.source === "browser") return undefined;
    let cancelled = false;
    new ApiClient({ Authorization: `Bearer ${token}` }).httpRequest(
      ENDPOINTS.AI.BIO_CV_DRAFT,
      "GET",
      null,
      "Nie udało się sprawdzić starego szkicu.",
    ).then((response) => {
      if (cancelled || !guestWizardProfileHasContent(response?.cv_data)) return;
      setLegacyDraft({
        profile: response.cv_data,
        selectedTemplateId: response.selected_template_id || null,
        source: "account",
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [legacyDraft?.source]);

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
    handleAddGridSectionEntry,
    handleAddSkillItem,
    handleAddRecordBlock,
    handleAddRecordDescription,
    handleRemoveSection,
    handleRemoveGridSectionEntry,
    handleRemoveRecordBlock,
    handleRemoveRecordDescription,
    handleReorderRecordBlock,
    handleReorderSection,
    handleTransferSectionLane,
    handleChangeSkillsDisplayMode,
    connectMode,
    cancelConnecting,
    pickConnectorAt,
    markSelected,
    handleCanvasBackgroundClick,
    handleSetTextareaEditing,
    requestTextEdit,
    requestEditZoomRestore,
    editZoomSpreadTransitionRef,
    handleSelectElement,
    handleDeleteElement,
    handleDeleteSelectedElements,
    handleDuplicateElement,
    handleDuplicateSelectedElements,
    handleAlignElements,
    handleEditElementValues,
    applyScopedTextPatches,
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
    hideProfilePhoto,
    showProfilePhoto,
    removeProfilePhoto,
    handleResizeElement,
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

  const persistedSnapshot = useMemo(() => createPersistedDocumentSnapshot({
    title: documentTitle,
    elements: A4_Elements,
    deletedElements: A4_Elements_deleted,
    pageCount,
    pageSize,
    editorMode,
    templateId: activeTemplateId,
    flowSpacing,
    cvData: activeCvData,
    sourceImportId: activeImportId,
  }), [
    A4_Elements,
    A4_Elements_deleted,
    activeCvData,
    activeImportId,
    activeTemplateId,
    documentTitle,
    editorMode,
    flowSpacing,
    pageCount,
    pageSize,
  ]);
  const documentSignature = useMemo(
    () => persistedDocumentSignature(persistedSnapshot),
    [persistedSnapshot],
  );
  const postSaveDocumentSignature = useMemo(
    () => persistedDocumentSignature({
      ...persistedSnapshot,
      deletedElements: [],
    }),
    [persistedSnapshot],
  );
  const persistedSnapshotRef = useRef(persistedSnapshot);
  persistedSnapshotRef.current = persistedSnapshot;

  const flushGuestDraft = useCallback(() => {
    if (!isGuest || pdfId != null) return false;
    const snapshot = persistedSnapshotRef.current;
    if (!hasPersistedDocumentContent(snapshot)) return false;
    saveGuestDocument({
      elements: snapshot.elements,
      deletedIds: snapshot.deletedElements.map((element) => (
        typeof element === "string" ? element : element.element_id
      )),
      title: snapshot.title,
      pageCount: snapshot.pageCount,
      editorMode: snapshot.editorMode,
      templateId: snapshot.templateId,
      spacingPx: snapshot.flowSpacing,
      isDemoContent: isDemoContentRef.current,
      cvData: snapshot.cvData,
      updatedAt: Date.now(),
    });
    if (!guestFirstEditLoggedRef.current) {
      guestFirstEditLoggedRef.current = true;
      queueGuestEvent("guest_first_edit");
    }
    return true;
  }, [isGuest, pdfId]);

  const dirtyGuard = useDirtyGuard({
    signature: documentSignature,
    isGuest,
    flushGuestDraft,
  });
  const confirmDiscardActiveEdits = dirtyGuard.confirmDiscard;
  const allowNextNavigation = dirtyGuard.allowNextNavigation;
  const markDocumentClean = dirtyGuard.markClean;

  /**
   * Commit a complete document replacement through one synchronous boundary.
   *
   * React batches these state writes into one render. Every field receives an
   * explicit value from the normalized snapshot, so no pdf id, revision,
   * template, CV profile, or import provenance can leak from document A to B.
   * Callers must finish dirty/stale checks before invoking this function.
   */
  const commitDocumentSnapshot = useCallback((input, options = {}) => {
    const snapshot = normalizeCommittedDocumentSnapshot(input);
    const committedFlowSpacing = normalizeFlowSpacing(
      snapshot.flowSpacing ?? DEFAULT_FLOW_SPACING,
    );
    const scope = advanceDocumentSession();

    resetHistory();
    if (options.animateContent) markContentElementsEnter(snapshot.elements);
    setA4_Elements(snapshot.elements);
    setA4_Elements_deleted(snapshot.deletedElements);
    setDocumentTitle(snapshot.title);
    if (titleRef.current) titleRef.current.value = snapshot.title;
    setPageCount(snapshot.pageCount);
    setCurrentPage(snapshot.currentPage);
    setActiveTemplateId(snapshot.templateId);
    setEditorMode(snapshot.editorMode);
    adoptDocumentFlowSpacing(committedFlowSpacing);
    setActiveCvData(snapshot.cvData);
    setActiveImportId(snapshot.sourceImportId);
    setPdfId(snapshot.pdfId);
    setServerRevision(snapshot.serverRevision);
    setIsDemoContent(snapshot.isDemoContent);

    // Preview state describes the previous element graph and must never cross
    // the same atomic boundary into a newly committed document.
    setLayoutPreviewPatches([]);
    setStructurePreviewGroup(null);
    setDeletionPreviewIds([]);
    setAiCorrectionHighlights([]);
    setSpacingHoldId(null);

    if (options.markClean) {
      markDocumentClean(persistedDocumentSignature(createPersistedDocumentSnapshot({
        title: snapshot.title,
        elements: snapshot.elements,
        deletedElements: snapshot.deletedElements,
        pageCount: snapshot.pageCount,
        pageSize,
        editorMode: snapshot.editorMode,
        templateId: snapshot.templateId,
        flowSpacing: committedFlowSpacing,
        cvData: snapshot.cvData,
        sourceImportId: snapshot.sourceImportId,
      })));
    }

    return { scope, snapshot: { ...snapshot, flowSpacing: committedFlowSpacing } };
  }, [
    adoptDocumentFlowSpacing,
    advanceDocumentSession,
    markDocumentClean,
    pageSize,
    resetHistory,
    setA4_Elements,
    setA4_Elements_deleted,
    setActiveTemplateId,
    setCurrentPage,
    setEditorMode,
    setPageCount,
  ]);

  const documentLifecycle = useMemo(() => ({
    ...lifecycleController,
    commitDocumentSnapshot,
  }), [commitDocumentSnapshot, lifecycleController]);

  useEffect(() => {
    observeDocumentSignature(documentSignature);
  }, [documentSignature, observeDocumentSignature]);

  const previousCanvasForCvDataRef = useRef(null);
  const cvDataSessionKeyRef = useRef(documentSessionKey);
  useEffect(() => {
    // Switching documents replaces both the canvas and profile in one state
    // transition. Establish a new baseline instead of treating the replacement
    // as a sequence of manual edits to the previously opened CV.
    if (cvDataSessionKeyRef.current !== documentSessionKey) {
      cvDataSessionKeyRef.current = documentSessionKey;
      previousCanvasForCvDataRef.current = A4_Elements;
      return;
    }

    const previousElements = previousCanvasForCvDataRef.current;
    previousCanvasForCvDataRef.current = A4_Elements;
    if (!previousElements || !activeCvData) return;

    const syncedCvData = syncCvDataFromCanvas(
      activeCvData,
      previousElements,
      A4_Elements,
      A4_Elements_deleted,
    );
    if (syncedCvData !== activeCvData) setActiveCvData(syncedCvData);
  }, [A4_Elements, A4_Elements_deleted, activeCvData, documentSessionKey]);

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

  const handleConfirmAddSection = useCallback(({ name, layout, sectionType, iconName }) => {
    handleAddSection({
      name,
      layout,
      sectionType,
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

  const handleApplySkillsLayout = useCallback((mode, chipVariant) => {
    const headingId = skillsLayoutModal.headingId;
    if (!headingId) return;
    // Same commit path as reorder/transfer — full structural re-pack, not a
    // single-element edit, so undo/redo and autosave apply with no extra
    // plumbing (see `handleChangeSkillsDisplayMode` in `useA4Elements`).
    handleChangeSkillsDisplayMode(headingId, mode, chipVariant);
    setSkillsLayoutModal({ open: false, headingId: null });
  }, [skillsLayoutModal.headingId, handleChangeSkillsDisplayMode]);

  // usePdfExport's callback param only ever signals "the min-spinner delay
  // has elapsed, react now" — the actual toast trigger lives in the
  // isPdfLoading-transition effect below instead, since reading responsePDF
  // synchronously inside this callback would close over a stale value (this
  // callback is captured by createPdf/updatePdf's useCallback well before
  // responsePDF is ever set for the request in flight).
  function noopShowModal() {}

  const saveScopeRef = useRef(null);
  const saveSignatureRef = useRef(null);
  const saveRequestPendingRef = useRef(false);
  const dialogSaveCompletionRef = useRef(null);
  const savedDeletedIdsRef = useRef(new Set());
  const deleteClearRequestedRef = useRef(false);
  const settleDialogSave = useCallback((saved, error = null) => {
    const completion = dialogSaveCompletionRef.current;
    dialogSaveCompletionRef.current = null;
    if (!completion) return;
    if (saved) completion.resolve(true);
    else completion.reject(error || new Error("Nie udało się zapisać dokumentu."));
  }, []);
  const handlePdfId = useCallback((nextPdfId, options = {}) => {
    const { force = false } = options;
    if (
      !force
      && saveScopeRef.current
      && !isDocumentScopeCurrent(saveScopeRef.current)
    ) return;
    setPdfId(nextPdfId);
    if (nextPdfId == null || Object.hasOwn(options, "revision")) {
      const parsedRevision = Number(options.revision);
      setServerRevision(
        Number.isInteger(parsedRevision) && parsedRevision >= 1 ? parsedRevision : null,
      );
    }
  }, [isDocumentScopeCurrent]);

  // Several fresh-document flows predate `handlePdfId` and assign null
  // directly. Keep their server concurrency token in lockstep until those
  // call sites are fully migrated to the focused session context.
  useEffect(() => {
    if (pdfId == null) setServerRevision(null);
  }, [pdfId]);

  const clearSavedDeletedElements = useCallback((nextValue) => {
    if (
      saveScopeRef.current
      && !isDocumentScopeCurrent(saveScopeRef.current)
    ) return;
    if (Array.isArray(nextValue) && nextValue.length === 0) {
      // usePdfExport requests a clear in `finally`, including failed writes.
      // Defer the mutation until responsePDF confirms success so a network
      // error never resurrects rows the user intended to delete.
      deleteClearRequestedRef.current = true;
      return;
    }
    setA4_Elements_deleted(nextValue);
  }, [isDocumentScopeCurrent, setA4_Elements_deleted]);

  const { createPdf, updatePdf, downloadPdf, responsePDF, isPdfLoading } = usePdfExport(handlePdfId, noopShowModal, titleRef, A4_Elements_deleted, clearSavedDeletedElements);
  const wasPdfLoadingRef = useRef(false);

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
    if (!saveRequestPendingRef.current) return undefined;
    saveRequestPendingRef.current = false;
    const clearSubmittedDeletes = deleteClearRequestedRef.current;
    deleteClearRequestedRef.current = false;
    if (!isDocumentScopeCurrent(saveScopeRef.current)) {
      settleDialogSave(false, new Error(
        "Dokument zmienił się podczas zapisu. Sprawdź bieżącą wersję i spróbuj ponownie.",
      ));
      return undefined;
    }

    if (responsePDF?.message) {
      const localizedMessage = planErrorMessage(responsePDF, responsePDF.message);
      pushToastRef.current({
        title: responsePDF?.code === "document_conflict"
          ? "Konflikt zapisu"
          : (responsePDF?.code?.startsWith?.("plan_") ? "Limit planu" : "Coś poszło nie tak"),
        msg: localizedMessage,
        variant: "error",
      });
      settleDialogSave(false, new Error(localizedMessage));
      return undefined;
    }
    if (!responsePDF?.success) {
      settleDialogSave(false, new Error("Serwer nie potwierdził zapisu dokumentu."));
      return undefined;
    }

    // Ignore completion from a document replaced while the request was in
    // flight. For a still-current session, mark exactly the submitted snapshot
    // clean: edits made after clicking Save remain dirty.
    markDocumentClean(saveSignatureRef.current);
    if (clearSubmittedDeletes) {
      const submittedIds = savedDeletedIdsRef.current;
      setA4_Elements_deleted((current) => current.filter((element) => {
        const elementId = typeof element === "string" ? element : element.element_id;
        return !submittedIds.has(elementId);
      }));
    }
    const fileLabel = documentTitle ? `${documentTitle}.pdf` : "CV";
    pushToastRef.current({
      title: "Zapisano w Moich dokumentach",
      msg: `CV zostało zapisane pomyślnie${documentTitle ? `: ${fileLabel}` : "."}`,
      variant: "success",
    });
    // A create consumes a project entitlement; refresh so plan counters stay
    // current without waiting for the next natural fetch.
    refreshEntitlementsRef.current?.();
    settleDialogSave(true);
    return undefined;
  }, [
    documentTitle,
    isDocumentScopeCurrent,
    isPdfLoading,
    markDocumentClean,
    responsePDF,
    setA4_Elements_deleted,
    settleDialogSave,
  ]);

  const handleLogout = useCallback(async () => {
    if (!(await confirmDiscardActiveEdits())) return;
    allowNextNavigation();
    clearAccessToken();
    navigate("/");
  }, [allowNextNavigation, confirmDiscardActiveEdits, navigate]);


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

    const api = new ApiClient({ Authorization: `Bearer ${token}` });
    api.httpRequest(ENDPOINTS.AUTH.TOKEN, "GET", null, "Weryfikacja tokenu nie powiodła się!").
      catch(async (error) => {
        console.log(error);
        if (error.status === 401 || error.status === 403) {
          if (!(await confirmDiscardActiveEdits())) return;
          allowNextNavigation();
          clearAccessToken();
          setIsGuest(true);
          navigate(getEditorPath(), { replace: true });
        }
      })

  }, [allowNextNavigation, checkActivity, confirmDiscardActiveEdits, navigate])


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

  // Guest-mode autosave: guests have no account to save into, so their
  // in-progress work is persisted to localStorage (a backend write would 401).
  // This local draft is intentionally kept even though authenticated background
  // autosave was removed — it is the only way a guest's edits survive a reload
  // before they register. A 2s settle debounce mirrors the editing cadence.
  // Skipped once a real pdfId exists: from that point the document is a saved
  // account document, updated only by an explicit "Zapisz".
  useEffect(() => {
    if (!isGuest || pdfId != null) return undefined;

    if (!guestEditorOpenedLoggedRef.current) {
      guestEditorOpenedLoggedRef.current = true;
      queueGuestEvent("guest_editor_opened");
    }

    if (!hasPersistedDocumentContent(persistedSnapshot)) return undefined;
    const timer = setTimeout(flushGuestDraft, 2000);

    return () => clearTimeout(timer);
  }, [documentSignature, flushGuestDraft, isGuest, pdfId, persistedSnapshot]);

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
    if (isGuest) return;
    if (!pdfsLoaded || PDFs.length !== 0) return;
    // A landing-page CTA has already chosen a concrete first action. Do not
    // obscure it with the default template picker before the intent is handled.
    if (
      startIntent === "import"
      || startIntent === "new"
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
  }, [isGuest, pdfsLoaded, PDFs.length, autoOpenedTemplates, dialog, setAutoOpenedTemplates, startIntent])

  // Blank freeform path: clear canvas once and skip the template picker.
  const blankStartAppliedRef = useRef(false);
  useEffect(() => {
    if (initialStartIntentRef.current !== "blank" || blankStartAppliedRef.current) return;
    blankStartAppliedRef.current = true;
    commitDocumentSnapshot({
      elements: [],
      title: "",
      pageCount: 1,
      templateId: null,
      editorMode: EDITOR_MODE_FREEFORM,
      flowSpacing: DEFAULT_FLOW_SPACING,
      cvData: null,
      sourceImportId: null,
      pdfId: null,
      revision: null,
    }, { markClean: true });
    markTemplatesModalSeen();
  }, [commitDocumentSnapshot, markTemplatesModalSeen])

  // Demo path: load the authored Linden starter once, no dialog, so the
  // visitor sees the exact Julia Bernat document used by the Linden picker
  // mockup instead of a separately maintained approximation.
  const demoStartAppliedRef = useRef(false);
  useEffect(() => {
    if (initialStartIntentRef.current !== "demo" || demoStartAppliedRef.current) return;
    demoStartAppliedRef.current = true;
    commitDocumentSnapshot({
      elements: materializeElementSpecs(lindenTemplate, nanoid),
      title: "DEMO_CV",
      templateId: "linden",
      editorMode: EDITOR_MODE_TEMPLATE,
      flowSpacing,
      cvData: null,
      sourceImportId: null,
      pdfId: null,
      revision: null,
      isDemoContent: true,
    }, { animateContent: true });
    // The shared zoom step is 10%, so five increments land exactly on 150%
    // without introducing a separate demo-only zoom setter.
    for (let i = 0; i < 5; i += 1) zoomIn();
    queueGuestEvent("guest_demo_loaded");
    markTemplatesModalSeen();
  }, [commitDocumentSnapshot, flowSpacing, markTemplatesModalSeen, zoomIn]);

  const handleShowAiPanel = useCallback(() => {
    // Import belongs to an account. Gate every entry point before mounting
    // the upload UI, including direct start links and a stale session.
    if (!getAccessToken()) {
      setDialog('importGate');
      setPanel(null);
      return;
    }
    const next = dialog !== 'ai';
    setDialog(next ? 'ai' : null);
    if (next) setPanel(null);
  }, [dialog])

  const handleShowNewCvSetup = useCallback(() => {
    const next = dialog !== 'newCv';
    setDialog(next ? 'newCv' : null);
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
      pushToast({
        title: 'Układ dopasowany.',
        msg: fit.typographyPreset === 'S'
          ? 'Zmniejszyliśmy odstępy i ustawiliśmy rozmiar tekstu S — bez użycia AI.'
          : undefined,
        variant: 'success',
      });
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

  // Sidebar templates (Tessera, Slate, Harbor, Sterling, …) only author the
  // profile rail on page 1, so the "too long" nudge applies one page sooner.
  // The fit target itself is still progressive for every layout (3 → 2, then
  // 2 → 1) so the UI never promises an implausible multi-page jump.
  const isSidebarTemplate = useMemo(
    () => templateHasLayout(
      TEMPLATES.find((template) => template.id === activeTemplateId),
      'sidebar',
    ),
    [activeTemplateId],
  );

  // One shared product rule owns the panel hint, CTA, modal copy, and probe:
  // reduce by exactly one page at a time, regardless of template layout.
  const fitTargetPages = useMemo(
    () => getNextPageFitTarget(pageCount),
    [pageCount],
  );

  const fitLoosestSpacing = useMemo(
    () => normalizeFlowSpacing(baselineFlowSpacing ?? DEFAULT_FLOW_SPACING),
    [baselineFlowSpacing],
  );

  // Flagship action: preserve the current typography when spacing fits cleanly;
  // otherwise retry with the selected template's real S typography transaction.
  // Only a failure of both deterministic paths may route to AI shortening.
  const onFitToPages = useCallback((requestedTargetPages = fitTargetPages) => {
    // React click handlers receive a SyntheticEvent as their first argument.
    // Treat only a finite numeric override as an intentional target; otherwise
    // use the live incremental goal. Without this guard, passing the handler
    // directly to a button normalized the event to the engine's fallback of 1.
    const numericTarget = Number(requestedTargetPages);
    const targetPages = Number.isFinite(numericTarget)
      ? numericTarget
      : fitTargetPages;
    const pageHeight = pageSize?.height ?? 842;
    const fit = findTemplateFitForTarget({
      elements: A4_Elements,
      templateId: activeTemplateId,
      loosest: fitLoosestSpacing,
      tightest: MIN_FLOW_SPACING,
      targetPages,
      pageHeight,
      createId: nanoid,
      measureTextWidth: fitTextWidthMeasurer,
    });
    const { action } = resolveFitAction(fit);
    if (action === "commit") {
      commitFit(fit);
    } else {
      longCvOpenRef.current = true;
      setLongCvModalOpen(true);
    }
  }, [A4_Elements, activeTemplateId, fitLoosestSpacing, fitTargetPages, fitTextWidthMeasurer, pageSize, commitFit]);

  // The Topbar offers a one-page shortcut when spacing alone or spacing plus S
  // can reach one page. The probe is pure and uses deterministic temporary IDs;
  // the click handler repeats it with browser text metrics and commit-safe IDs.
  const onePageFit = useMemo(() => {
    if (editorMode !== EDITOR_MODE_TEMPLATE || (pageCount ?? 1) <= 1) return null;
    const fit = findTemplateFitForTarget({
      elements: A4_Elements,
      templateId: activeTemplateId,
      loosest: fitLoosestSpacing,
      tightest: MIN_FLOW_SPACING,
      targetPages: 1,
      pageHeight: pageSize?.height ?? 842,
      measureTextWidth: fitTextWidthMeasurer,
    });
    const { action } = resolveFitAction(fit);
    return action === "commit" ? fit : null;
  }, [A4_Elements, activeTemplateId, editorMode, fitLoosestSpacing, fitTextWidthMeasurer, pageCount, pageSize]);

  const onFitToOnePage = useCallback(() => {
    if (onePageFit) onFitToPages(1);
  }, [onePageFit, onFitToPages]);

  // `fitTooLong` is a cheap badge flag (no packing) driving the sidebar/section
  // panel indicator; `fitStatus` runs spacing and, when needed, S typography,
  // but only while the panel is open so edits do not continuously repack.
  const fitTooLong = useMemo(
    () => editorMode === EDITOR_MODE_TEMPLATE && (pageCount ?? 1) > fitTargetPages,
    [editorMode, pageCount, fitTargetPages],
  );

  const fitStatus = useMemo(() => {
    if (!isSectionsPanel || !fitTooLong) return null;
    const pageHeight = pageSize?.height ?? 842;
    const fit = findTemplateFitForTarget({
      elements: A4_Elements,
      templateId: activeTemplateId,
      loosest: fitLoosestSpacing,
      tightest: MIN_FLOW_SPACING,
      targetPages: fitTargetPages,
      pageHeight,
      measureTextWidth: fitTextWidthMeasurer,
    });
    return {
      reducible: true,
      tier: fit.tier,
      targetLabel: formatFitTargetLabel(fitTargetPages),
      typographyPreset: fit.typographyPreset,
    };
  }, [isSectionsPanel, fitTooLong, A4_Elements, activeTemplateId, fitLoosestSpacing, fitTargetPages, fitTextWidthMeasurer, pageSize]);

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
        setLongCvModalOpen(false);
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
      msg: `Zajmuje ${pageCount} stron — w panelu „Dostosuj CV” zobaczysz, jak zmieścić je na mniej.`,
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
    saveRequestPendingRef.current = true;
    savedDeletedIdsRef.current = new Set(A4_Elements_deleted.map((element) => (
      typeof element === "string" ? element : element.element_id
    )));
    saveScopeRef.current = captureDocumentScope();
    saveSignatureRef.current = postSaveDocumentSignature;
    createPdf(A4_Elements, titleRef, pageCount, pageSize, {
      documentSessionKey,
      editorMode,
      templateId: activeTemplateId,
      flowSpacing,
      sourceImportId: activeImportId,
      cvData: activeCvData,
    });
  }, [A4_Elements, A4_Elements_deleted, activeCvData, activeImportId, activeTemplateId, captureDocumentScope, createPdf, documentSessionKey, editorMode, flowSpacing, postSaveDocumentSignature, titleRef, pageCount, pageSize]);

  const requireNameBeforeOutput = useCallback(() => {
    if (hasRequiredCvName(A4_Elements)) return true;
    const nameElement = findRequiredCvNameElement(A4_Elements);
    pushToast({
      title: "Uzupełnij imię i nazwisko",
      msg: "To jedyne pole wymagane przed zapisem lub eksportem CV.",
      variant: "error",
    });
    if (nameElement?.element_id) {
      goToPage(nameElement.page || 1);
      handleSelectElement(nameElement.element_id, false);
      requestTextEdit(nameElement.element_id);
      handleSetTextareaEditing(nameElement.element_id, true);
    }
    return false;
  }, [A4_Elements, goToPage, handleSelectElement, handleSetTextareaEditing, pushToast, requestTextEdit]);

  // Update the already-saved document in place. `intent: "save"` marks this as a
  // persistence write (not a download), so the post-spinner effect shows the
  // "Zapisano" toast rather than any download handling.
  const updatePdfWithElements = useCallback(() => {
    saveRequestPendingRef.current = true;
    savedDeletedIdsRef.current = new Set(A4_Elements_deleted.map((element) => (
      typeof element === "string" ? element : element.element_id
    )));
    saveScopeRef.current = captureDocumentScope();
    saveSignatureRef.current = postSaveDocumentSignature;
    updatePdf(A4_Elements, pdfId, titleRef, A4_Elements_deleted, pageCount, pageSize, {
      editorMode,
      templateId: activeTemplateId,
      flowSpacing,
      cvData: activeCvData,
      expectedRevision: serverRevision,
      intent: "save",
    });
  }, [
    A4_Elements,
    activeCvData,
    activeTemplateId,
    captureDocumentScope,
    editorMode,
    flowSpacing,
    pdfId,
    updatePdf,
    titleRef,
    A4_Elements_deleted,
    pageCount,
    pageSize,
    postSaveDocumentSignature,
    serverRevision,
  ]);

  /**
   * Save the snapshot currently guarded by the unsaved-changes dialog.
   *
   * Resolution is owned by the post-spinner response effect above, after a
   * successful response has updated the authoritative pdf id/revision and the
   * exact submitted signature has been marked clean. Rejections intentionally
   * leave the guard promise pending so navigation or replacement cannot run.
   */
  const saveCurrentDocumentAndWait = useCallback(() => {
    if (!requireNameBeforeOutput()) {
      return Promise.reject(new Error("Uzupełnij imię i nazwisko."));
    }
    if (!localStorage.getItem("token")) {
      return Promise.reject(new Error("Zaloguj się, aby zapisać dokument."));
    }
    if (isPdfLoading || saveRequestPendingRef.current || dialogSaveCompletionRef.current) {
      return Promise.reject(new Error("Zapis dokumentu już trwa. Poczekaj na jego zakończenie."));
    }

    return new Promise((resolve, reject) => {
      dialogSaveCompletionRef.current = { resolve, reject };
      try {
        if (pdfId == null) createPdfWithElements();
        else updatePdfWithElements();
      } catch (error) {
        dialogSaveCompletionRef.current = null;
        reject(error);
      }
    });
  }, [createPdfWithElements, isPdfLoading, pdfId, requireNameBeforeOutput, updatePdfWithElements]);

  const handleSaveAndContinue = useCallback(() => (
    dirtyGuard.confirmDialogSave(saveCurrentDocumentAndWait)
  ), [dirtyGuard, saveCurrentDocumentAndWait]);

  // Render the current canvas to a PDF and download it — independent of
  // "Zapisz". Works even for a never-saved document because the backend renders
  // on demand without persisting. Guests cannot export (no account for the
  // metered quota), so they see the same save-gate as "Zapisz".
  const handleDownloadClick = useCallback(async () => {
    if (!requireNameBeforeOutput()) return;
    if (!localStorage.getItem("token")) {
      queueGuestEvent("save_gate_shown");
      setDialog('saveGate');
      return;
    }
    try {
      const { blob, title } = await downloadPdf(A4_Elements, titleRef, pageCount, pageSize, {
        editorMode,
        templateId: activeTemplateId,
        // A saved paid-template document may remain editable after Pro expires.
        // The backend accepts its paid template only when this owned id proves
        // legacy continuity; new or unsaved paid-template payloads stay blocked.
        pdfId,
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
    pdfId,
    pushToast,
    refreshEntitlements,
    requireNameBeforeOutput,
    titleRef,
  ]);

  // "Zapisz" is the ONLY path that writes to "Moje dokumenty". The first save
  // creates the document (and its pdfId); every later save updates that same
  // document in place instead of spawning a new copy. Guests have no backend
  // document yet, so they see the save-gate instead of a 401.
  const handleSaveClick = useCallback(() => {
    if (!requireNameBeforeOutput()) return;
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
  }, [createPdfWithElements, requireNameBeforeOutput, updatePdfWithElements, pdfId]);

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

  // Loading a template / AI doc / clearing starts a fresh, unsaved document.
  // The dirty guard runs before the one complete snapshot commit; no caller is
  // allowed to partially mutate document fields before confirmation succeeds.
  const startFreshDocument = useCallback(async (snapshot, options = {}) => {
    // NewCvSetupModal owns the replacement confirmation for its complete flow.
    // Skipping the generic dirty guard here prevents two consecutive prompts,
    // while every other fresh-document entry point still uses the shared guard.
    if (!options.replacementConfirmed && !(await confirmDiscardActiveEdits())) return false;
    commitDocumentSnapshot({
      ...snapshot,
      pdfId: null,
      revision: null,
      isDemoContent: false,
    }, options);
    return true;
  }, [commitDocumentSnapshot, confirmDiscardActiveEdits]);

  const loadTemplateFresh = useCallback(
    (templateElements, title, templateId = null, metadata = {}) => startFreshDocument({
      ...metadata,
      elements: materializeElementSpecs(templateElements, nanoid),
      deletedElements: [],
      title: title || "",
      templateId,
      editorMode: EDITOR_MODE_TEMPLATE,
      flowSpacing: metadata.flowSpacing ?? flowSpacing,
      cvData: metadata.cvData ?? null,
      sourceImportId: metadata.sourceImportId ?? null,
    }, {
      animateContent: true,
      replacementConfirmed: metadata.replacementConfirmed === true,
    }),
    [flowSpacing, startFreshDocument],
  );
  const loadTemplateWithFillFresh = useCallback(
    (templateElements, title, fills, templateId = null, metadata = {}) => {
      const fillMap = Object.fromEntries((fills || []).map((fill) => [fill.id, fill.content]));
      const filled = templateElements.map((element, index) => {
        const content = fillMap[String(index)];
        const canFill = element.category === "text" || element.category === "textarea";
        return canFill && content != null && content !== ""
          ? { ...element, content }
          : element;
      });
      return startFreshDocument({
        ...metadata,
        elements: materializeElementSpecs(filled, nanoid),
        deletedElements: [],
        title: title || "",
        templateId,
        editorMode: EDITOR_MODE_TEMPLATE,
        flowSpacing: metadata.flowSpacing ?? flowSpacing,
        cvData: metadata.cvData ?? null,
        sourceImportId: metadata.sourceImportId ?? null,
      }, { animateContent: true });
    },
    [flowSpacing, startFreshDocument],
  );
  const loadAiElementsFresh = useCallback(
    (specs, title, templateId = null, metadata = {}) => startFreshDocument({
      ...metadata,
      elements: applyStarterElementStructure(
        materializeElementSpecs(specs, nanoid),
        metadata.cvData,
        templateId,
        pageSize?.height ?? 842,
      ).map((element) => (
        metadata.selectName && element.mastheadRole === "name"
          ? { ...element, isSelected: true, isEditing: true }
          : element
      )),
      deletedElements: [],
      title: title || "",
      templateId,
      editorMode: EDITOR_MODE_TEMPLATE,
      flowSpacing: metadata.flowSpacing ?? flowSpacing,
      cvData: metadata.cvData ?? null,
      sourceImportId: metadata.sourceImportId ?? null,
    }, {
      animateContent: true,
      replacementConfirmed: metadata.replacementConfirmed === true,
    }),
    [flowSpacing, pageSize?.height, startFreshDocument],
  );
  const clearA4Fresh = useCallback(
    () => startFreshDocument({
      elements: [],
      deletedElements: [],
      title: "",
      pageCount: 1,
      templateId: null,
      editorMode: EDITOR_MODE_FREEFORM,
      flowSpacing: DEFAULT_FLOW_SPACING,
      cvData: null,
      sourceImportId: null,
    }),
    [startFreshDocument],
  );

  const replaceActiveElements = useCallback((specs, title, templateId = null, metadata = {}) => {
    const nextCvData = Object.hasOwn(metadata, "cvData") ? metadata.cvData : activeCvData;
    commitDocumentSnapshot({
      elements: applyStarterElementStructure(
        materializeElementSpecs(specs, nanoid),
        nextCvData,
        templateId,
        pageSize?.height ?? 842,
      ),
      deletedElements: [],
      title: title ?? documentTitle,
      templateId,
      editorMode: EDITOR_MODE_TEMPLATE,
      flowSpacing: metadata.flowSpacing ?? flowSpacing,
      cvData: nextCvData,
      sourceImportId: Object.hasOwn(metadata, "sourceImportId")
        ? metadata.sourceImportId
        : activeImportId,
      pdfId,
      revision: serverRevision,
      currentPage: 1,
    }, { animateContent: true });
  }, [
    activeCvData,
    activeImportId,
    commitDocumentSnapshot,
    documentTitle,
    flowSpacing,
    pdfId,
    pageSize?.height,
    serverRevision,
  ]);

  const handleCreateStarterCv = useCallback(async (config, options = {}) => {
    const template = TEMPLATES.find((candidate) => candidate.id === config.templateId);
    if (!template) throw new Error("Nie znaleziono wybranego szablonu.");
    const { cvData, fillProfile } = buildStarterDocument(config);
    const requestScope = captureDocumentScope();
    const response = await fillTemplate(fillProfile, template.id, {
      errorMessage: "Nie udało się utworzyć nowego CV.",
      spacing: DEFAULT_FLOW_SPACING,
    });
    if (!isDocumentScopeCurrent(requestScope, { requireSameRevision: true })) {
      throw new Error("Dokument zmienił się podczas tworzenia. Otwórz konfigurator ponownie.");
    }
    const created = await loadAiElementsFresh(response.elements, "Moje CV", template.id, {
      cvData,
      flowSpacing: DEFAULT_FLOW_SPACING,
      selectName: true,
      replacementConfirmed: options.replacementConfirmed === true,
    });
    if (created) {
      queueGuestEvent("new_cv_created");
      setStartChooserDismissed(true);
    }
    return created;
  }, [captureDocumentScope, isDocumentScopeCurrent, loadAiElementsFresh]);

  const handleRecoverLegacyDraft = useCallback(async () => {
    if (!legacyDraft?.profile) return;
    const requested = TEMPLATES.find((template) => template.id === legacyDraft.selectedTemplateId);
    const template = requested && isTemplateAllowed(requested, entitlements)
      ? requested
      : TEMPLATES.find((candidate) => candidate.id === "meridian");
    try {
      const response = await fillTemplate(legacyDraft.profile, template.id, {
        errorMessage: "Nie udało się przenieść starego szkicu na A4.",
        spacing: DEFAULT_FLOW_SPACING,
      });
      const created = await loadAiElementsFresh(response.elements, "Moje CV", template.id, {
        cvData: legacyDraft.profile,
        flowSpacing: DEFAULT_FLOW_SPACING,
      });
      if (!created) return;
      if (legacyDraft.source === "browser") {
        clearGuestWizardDraft();
      } else if (getAccessToken()) {
        await new ApiClient({ Authorization: `Bearer ${getAccessToken()}` }).httpRequest(
          ENDPOINTS.AI.BIO_CV_DRAFT,
          "DELETE",
          null,
          "CV utworzono, ale nie udało się usunąć starego szkicu.",
        );
      }
      setLegacyDraft(null);
      setStartChooserDismissed(true);
      pushToast?.({
        title: "Szkic przeniesiony",
        msg: "Dane ze starego kreatora są teraz edytowalne bezpośrednio na A4.",
        variant: "success",
      });
    } catch (error) {
      pushToast?.({
        title: "Nie udało się przenieść szkicu",
        msg: planErrorMessage(error, "Spróbuj ponownie — stary szkic nie został usunięty."),
        variant: "error",
      });
    }
  }, [entitlements, legacyDraft, loadAiElementsFresh, pushToast]);

  // Unlocking freeform CLONES the current canvas into a new, unsaved freeform
  // copy (fresh element ids, cleared pdfId). No edits are discarded — the
  // in-memory content is carried into the copy — so no discard guard is needed.
  const confirmUnlockFreeform = useCallback(() => {
    const baseTitle = (documentTitle || "Projekt").trim() || "Projekt";
    const copyTitle = `${baseTitle} (swobodny)`;
    const cloned = A4_Elements.map((element) => ({
      ...element,
      element_id: nanoid(),
      isSelected: false,
      isMove: false,
      isEditing: false,
      preserveInitialLayout: false,
    }));
    commitDocumentSnapshot({
      elements: cloned,
      deletedElements: [],
      title: copyTitle,
      pageCount,
      currentPage,
      templateId: null,
      editorMode: EDITOR_MODE_FREEFORM,
      flowSpacing,
      cvData: null,
      sourceImportId: null,
      pdfId: null,
      revision: null,
    });
    setDialog(null);
    pushToast?.({
      title: "Projekt własny",
      msg: "Utworzono kopię ze swobodną edycją.",
      variant: "success",
    });
  }, [
    A4_Elements,
    commitDocumentSnapshot,
    currentPage,
    documentTitle,
    flowSpacing,
    pageCount,
    pushToast,
  ]);

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
  // These refs coordinate the explicit browser-draft ownership prompt and the
  // authenticated wizard conversion without allowing duplicate adoption.
  const claimOfferedRef = useRef(false);
  const pendingGuestDocRef = useRef(null);
  const guestDocumentRestoredRef = useRef(false);

  // Both authored guest drafts and the demo survive refresh on the same URL.
  // Explicit creation intents start their own flow; an import gate can safely
  // keep the existing draft visible behind it without sending its data.
  useEffect(() => {
    if (guestDocumentRestoredRef.current || getAccessToken()
      || (initialStartIntentRef.current && initialStartIntentRef.current !== "import")) return;
    const guestDoc = loadGuestDocument();
    if (
      !Array.isArray(guestDoc?.elements)
      || guestDoc.elements.length === 0
    ) return;
    // Regent powered the previous demo. Replace that persisted product sample
    // instead of restoring stale demo content after the canonical starter was
    // moved to Linden; user-authored guest documents never enter this branch.
    if (guestDoc.isDemoContent && guestDoc.templateId !== "linden") {
      guestDocumentRestoredRef.current = true;
      clearGuestDocument();
      commitDocumentSnapshot({
        elements: materializeElementSpecs(lindenTemplate, nanoid),
        title: "DEMO_CV",
        templateId: "linden",
        editorMode: EDITOR_MODE_TEMPLATE,
        flowSpacing,
        cvData: null,
        sourceImportId: null,
        pdfId: null,
        revision: null,
        isDemoContent: true,
      }, { animateContent: true });
      return;
    }
    // Local guest snapshots bypass ModalPdfs, so apply the same idempotent
    // persistence migrations before any editor mode or history is hydrated.
    const restoredElements = normalizeProfilePhotoVisibilityPersistence(
      normalizeSterlingFamilyPersistence(guestDoc.elements, guestDoc.templateId),
      guestDoc.templateId,
    );
    guestDocumentRestoredRef.current = true;
    commitDocumentSnapshot({
      ...guestDoc,
      elements: restoredElements,
      deletedElements: Array.isArray(guestDoc.deletedIds) ? guestDoc.deletedIds : [],
      title: guestDoc.title || "",
      flowSpacing: guestDoc.spacingPx ?? DEFAULT_FLOW_SPACING,
      cvData: guestDoc.cvData ?? null,
      sourceImportId: null,
      pdfId: null,
      revision: null,
      isDemoContent: Boolean(guestDoc.isDemoContent),
    }, { markClean: true });
  }, [
    commitDocumentSnapshot,
    flowSpacing,
  ]);

  useEffect(() => {
    if (claimOfferedRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    const guestDoc = loadGuestDocument();
    if (!guestDoc || !Array.isArray(guestDoc.elements) || guestDoc.elements.length === 0) return;
    if (guestDoc.isDemoContent) {
      // The Linden demo is product content, not a user's draft. Never ask a
      // newly authenticated account to claim it, and remove the browser copy
      // so it cannot reappear after a later session on this device.
      clearGuestDocument();
      return;
    }

    claimOfferedRef.current = true;
    pendingGuestDocRef.current = guestDoc;
    setDialog('claimGuest');
  }, []);

  // Load the browser-buffered guest JSON onto the A4 canvas only.
  // Do not call `createPdf` / `POST /pdf/create_pdf` here — that would render and
  // persist a server document before the user asked to save. Saving does not
  // consume an export; the separate authenticated download does. They keep an unsaved
  // canvas (`pdfId` null) and use “Zapisz PDF” when ready.
  //
  // Raw guest elements already have stable ids. They go directly through the
  // snapshot commit instead of materialization, which would mint new ids and
  // break connector references that do not carry symbolic template spec ids.
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
    // Claiming a guest draft must preserve the same saved Slate hide/show
    // contract as opening an authenticated document from “Moje dokumenty”.
    const restoredElements = normalizeProfilePhotoVisibilityPersistence(
      normalizeSterlingFamilyPersistence(guestDoc.elements, guestDoc.templateId),
      guestDoc.templateId,
    );
    // Unsaved editor document: authenticated persistence waits for an explicit
    // save, but every in-memory field lands in the same replacement commit.
    const { scope: claimedScope } = commitDocumentSnapshot({
      ...guestDoc,
      elements: restoredElements,
      deletedElements: [],
      currentPage: 1,
      cvData: guestDoc.cvData ?? null,
      sourceImportId: null,
      pdfId: null,
      revision: null,
      isDemoContent: Boolean(guestDoc.isDemoContent),
    });
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
      if (isDocumentScopeCurrent(claimedScope)) setActiveCvData(cvData);
    }).catch(() => {
      if (isDocumentScopeCurrent(claimedScope)) setActiveCvData(null);
    });

    pushToast({
      title: "Szkic wczytany",
      msg: "Dokument jest na płótnie. Zapisz go, gdy będziesz gotowy.",
      variant: "success",
    });
  }, [
    commitDocumentSnapshot,
    isDocumentScopeCurrent,
    pushToast,
    setActiveCvData,
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
    commitDocumentSnapshot({
      elements: [],
      deletedElements: [],
      title: "",
      pageCount: 1,
      templateId: null,
      editorMode: EDITOR_MODE_FREEFORM,
      flowSpacing: DEFAULT_FLOW_SPACING,
      cvData: null,
      sourceImportId: null,
      pdfId: null,
      revision: null,
    }, { markClean: true });
  }, [commitDocumentSnapshot]);

  const handleDemoUseOwnData = useCallback(() => {
    setDialog('newCv');
  }, []);

  const canvasValue = useMemo(() => ({
    A4_Elements,
    isDemoContent,
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
    addGridSectionEntry: handleAddGridSectionEntry,
    addSkillItem: handleAddSkillItem,
    addRecordBlock: handleAddRecordBlock,
    addRecordDescription: handleAddRecordDescription,
    removeSection: handleRemoveSection,
    removeGridSectionEntry: handleRemoveGridSectionEntry,
    removeRecordBlock: handleRemoveRecordBlock,
    removeRecordDescription: handleRemoveRecordDescription,
    reorderRecordBlock: handleReorderRecordBlock,
    reorderSection: handleReorderSection,
    transferSectionLane: handleTransferSectionLane,
    changeSkillsDisplayMode: handleChangeSkillsDisplayMode,
    markSelected,
    setTextareaEditing: handleSetTextareaEditing,
    requestTextEdit,
    requestEditZoomRestore,
    editZoomSpreadTransitionRef,
    selectElement: handleSelectElement,
    moveElement: handleMoveElement,
    moveSelectedElements: handleMoveSelectedElements,
    selectMoveElement: handleSelectMoveElement,
    spacingHoldId,
    setSpacingHoldId,
    editElementValues: handleEditElementValues,
    applyScopedTextPatches,
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
    hideProfilePhoto,
    showProfilePhoto,
    removeProfilePhoto,
    applyLayoutPatches,
    alignElement: handleAlignElements,
    deleteElement: handleDeleteElement,
    deleteSelectedElements: handleDeleteSelectedElements,
    duplicateElement: handleDuplicateElement,
    duplicateSelectedElements: handleDuplicateSelectedElements,
    resizeElement: handleResizeElement,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    activePdfId: pdfId,
    confirmDiscardActiveEdits,
    discardActiveDocument,
    clearA4: clearA4Fresh,
    loadTemplate: loadTemplateFresh,
    loadTemplateWithFill: loadTemplateWithFillFresh,
    loadAiElements: loadAiElementsFresh,
    // Restyling preserves id/title but starts a new element-id epoch.
    replaceActiveElements,
    setDocumentTitle,
    activeTemplateId,
    setActiveTemplateId,
    editorMode,
    setEditorMode,
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    adoptDocumentFlowSpacing,
    fitTooLong,
    fitStatus,
    onFitToPages,
    onePageFit,
    onFitToOnePage,
    showUnlockFreeform: handleShowUnlockFreeform,
    activeCvData,
    setActiveCvData,
    activeImportId,
    setActiveImportId,
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
    A4_Elements, isDemoContent, groupMoveDelta, setPageCanvasRef, isPdfLoading, pdfId, setA4_Elements_deleted, A4_Elements_deleted,
    handleAddImage, handleAddText, handleAddLine, handleAddRectangle, handleAddCircle, handleAddEllipse,
    handleAddPolygon, handleAddPath,
    handleSelectElement, handleMoveElement, handleMoveSelectedElements, handleSelectMoveElement,
    handleSaveClick, applyStructureOperation, applyCloneOperation, applyDeleteOperation,
    removeContactChannel, addContactChannel, toggleNameCase, toggleTitle,
    hideProfilePhoto, showProfilePhoto, removeProfilePhoto,
    handleEditElementValues, applyScopedTextPatches, handleEditSelectedElementValues, handleFitTextareaToContent, applyLayoutPatches,
    handleAlignElements, handleDeleteElement, handleDeleteSelectedElements, handleDuplicateSelectedElements,
    setA4_Elements, handleResizeElement, handleDownloadClick,
    handleCollapseSpilledMainIntoSidebar,
    clearA4Fresh, discardActiveDocument, confirmDiscardActiveEdits, loadTemplateFresh, loadTemplateWithFillFresh,
    loadAiElementsFresh, replaceActiveElements, activeTemplateId, setActiveTemplateId,
    editorMode, setEditorMode, flowSpacing, setFlowSpacing, baselineFlowSpacing, adoptDocumentFlowSpacing, fitTooLong, fitStatus, onFitToPages, onePageFit, onFitToOnePage, handleShowUnlockFreeform,
    activeCvData, setActiveCvData, activeImportId, setActiveImportId,
    pageCount, currentPage, addPage, removePage, goToPage, clonePage, movePage, setPageCount, setCurrentPage,
    isTwoPageView, toggleTwoPageView, handleAddTextarea, handleAddSection, openAddSectionModal, openFlatSectionLayoutModal, openSkillsLayoutModal, handleAddSectionRecord, handleAddGridSectionEntry, handleAddSkillItem, handleAddRecordBlock, handleAddRecordDescription, handleRemoveSection, handleRemoveGridSectionEntry, handleRemoveRecordBlock, handleRemoveRecordDescription, handleReorderRecordBlock, handleReorderSection, handleTransferSectionLane, handleChangeSkillsDisplayMode, markSelected, handleSetTextareaEditing, requestTextEdit, requestEditZoomRestore, editZoomSpreadTransitionRef,
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
    isNewCvSetupModal,
    showNewCvSetup: handleShowNewCvSetup,
    isPlanModal,
    showPlanModal: handleShowPlanModal,
    isChangeTemplateModal,
    showChangeTemplateModal: handleShowChangeTemplateModal,
    showUnlockFreeform: handleShowUnlockFreeform,
    isUnlockFreeformModal,
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
    isAiPanel, handleShowAiPanel, isNewCvSetupModal, handleShowNewCvSetup,
    isPlanModal, handleShowPlanModal, isChangeTemplateModal, handleShowChangeTemplateModal,
    handleShowUnlockFreeform, isUnlockFreeformModal,
    isGallery, handleShowGallery, isSectionsPanel, handleShowSections,
    isDropzone, handleShowDropzone,
    valueImageUpload, setValueImageUpload, isModalPdfs, setIsModalPdfs,
    assistantAction, requestAssistantAction,
  ]);

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

  // Account onboarding replaces the complete editor shell a signed-in user
  // lands on with the two guided paths (wizard / import). Gating lives in the
  // pure `shouldShowStartChooser` helper so it can be unit-tested without a DOM.
  const showStartChooser = shouldShowStartChooser({
    isGuest,
    elementsCount: A4_Elements.length,
    isDemoContent,
    isPdfLoading,
    pdfId,
    dismissed: startChooserDismissed,
  });

  return (
    <EditorView
      className={`main-container ${isDemoContent ? "has-demo-banner" : ""}`}
      onMouseMove={throttledHandleIsActive}
      dialogsSuspended={dirtyGuard.dialogOpen}
      documentLifecycle={documentLifecycle}
      documentSessionKey={documentSessionKey}
      canvasValue={canvasValue}
      uiValue={uiValue}
      sessionValue={sessionValue}
    >
              <ScopedAiProvider key={documentSessionKey} enabled={!showStartChooser}>
              <ModalPdfs />
              <UnsavedChangesDialog
                open={dirtyGuard.dialogOpen}
                onCancel={dirtyGuard.cancelDialogDiscard}
                onDiscard={dirtyGuard.confirmDialogDiscard}
                onSave={handleSaveAndContinue}
                isSaving={dirtyGuard.dialogSaving}
                error={dirtyGuard.dialogError}
              />
              <TemplatesModal />
              <PlanSelectModal />
              {isAiPanel && !isGuest ? (
                <Suspense fallback={<LazyAiFallback modal />}>
                  <LazyAiCvPanel />
                </Suspense>
              ) : null}
              {isNewCvSetupModal ? (
                <NewCvSetupModal
                  open
                  onClose={() => setDialog(null)}
                  onCreate={handleCreateStarterCv}
                  entitlements={entitlements}
                  hasActiveDocument={A4_Elements.length > 0}
                />
              ) : null}
              <ChangeTemplateModal />
              <UnlockFreeformModal
                open={isUnlockFreeformModal}
                onCancel={() => setDialog(null)}
                onConfirm={confirmUnlockFreeform}
              />
              <SaveGateModal
                open={isSaveGateModal || isImportGateModal}
                purpose={isImportGateModal ? "import" : "save"}
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
                open={longCvModalOpen}
                targetPages={fitTargetPages}
                canUseAi={canUseAiAssistant}
                onRequestAiShorten={handleRequestAiShorten}
                onClose={closeLongCvModal}
              />
              {/* Do not merely paint over editor chrome: leaving its controls
                  mounted would expose invisible Topbar, Sidebar, and AI actions
                  to keyboard and assistive-technology users. */}
              {!showStartChooser ? (
                <Sidebar>
                  {isSectionsPanel ? (
                    <SectionsPanel onClose={() => setPanel(null)} />
                  ) : null}
                </Sidebar>
              ) : null}
              {/* Floating property inspector (portal); not docked to the tool rail. */}
              {!showStartChooser ? <Editor /> : null}
              {!showStartChooser ? (
                <div className="right-pane">
                  {isDemoContent ? (
                    <DemoBanner onUseOwnData={handleDemoUseOwnData} />
                  ) : null}
                  <Topbar
                    titleRef={titleRef}
                    title={documentTitle}
                    onTitleChange={setDocumentTitle}
                  />
                  {/* Portal loader: card sits 100px under the live A4 top edge
                      (viewport px via A4ref), independent of canvas zoom. */}
                  {isPdfLoading ? (
                    <Spinner loading={isPdfLoading} anchorRef={A4ref} />
                  ) : null}
                  <div className="canvas-area" ref={canvasAreaRef} onClick={handleCanvasBackgroundClick}>
                    <div className={isTwoPageView ? "canvas-spread" : "canvas-single"}>
                      {isTwoPageView ? (
                        visiblePages.map((page, pageIndex) => (
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
                              <CanvasElements
                                elements={previewedElements.filter((element) => (element.page ?? 1) === page)}
                                spreadSide={pageIndex === 0 ? "left" : "right"}
                              />
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
              ) : null}
              {showStartChooser ? (
                <StartChooser
                  onNew={() => {
                    handleShowNewCvSetup();
                  }}
                  onImport={() => {
                    // Import follows the same return path as the wizard:
                    // closing its modal restores the start screen, while a
                    // successful import replaces the empty workspace.
                    handleShowAiPanel();
                  }}
                  onDocuments={() => {
                    // Keep the chooser mounted behind the documents modal.
                    // Closing the modal must return the user to the same
                    // start screen instead of exposing the blank freeform
                    // canvas.
                    setIsModalPdfs(true);
                  }}
                  documents={PDFs}
                  documentsLoaded={pdfsLoaded}
                  legacyDraftAvailable={Boolean(legacyDraft)}
                  legacyDraftNeedsOwnershipConfirmation={!isGuest && legacyDraft?.source === "browser"}
                  onRecoverLegacyDraft={handleRecoverLegacyDraft}
                  onLogout={handleLogout}
                />
              ) : null}
              {!showStartChooser ? <Gallery /> : null}
              {!showStartChooser && entitlements?.ai_assistant ? (
                <Suspense fallback={<LazyAiFallback />}>
                  <LazyAiAssistant key={documentSessionKey} />
                </Suspense>
              ) : null}
              <ToastStack toasts={toasts} onDismiss={dismissToast} />
              </ScopedAiProvider>
    </EditorView>
  )
}

export default EditorController;
