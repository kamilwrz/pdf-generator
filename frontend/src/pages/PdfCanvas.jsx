import { usePageTitle } from "../i18n/usePageTitle.js";
import { messageRef } from '../i18n/messageState.js';
import englishLinden from '../templates/en/linden.json';
import API_BASE_URL from '../services/api';
import { getUiLanguage } from '../i18n/index.js';
import { t as uiText } from "../i18n/index.js";
import { useTranslation } from 'react-i18next';
import Gallery from '../components/gallery/Gallery/Gallery';
import Sidebar from '../components/editor/Sidebar/Sidebar';
import Topbar from '../components/editor/Topbar/Topbar';
import DemoBanner from '../components/editor/DemoBanner/DemoBanner';
import CvOnboarding from '../components/editor/CvOnboarding/CvOnboarding';
import { loadOnboarding } from '../utils/cvOnboarding';
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
import { lazy, Suspense, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef} from 'react';
import { useA4Elements } from "../hooks/useA4Elements";
import { usePdfExport } from '../hooks/usePdfExport';
import CanvasElements from "../components/canvas/CanvasElements/CanvasElements";
import SelectionOverlay from "../components/canvas/SelectionOverlay/SelectionOverlay";
import AiCorrectionOverlay from "../components/canvas/AiCorrectionOverlay/AiCorrectionOverlay";
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { resolveStartTemplate } from '../utils/cvTemplateSelection';
import { getDocumentPath, parseDocumentId } from '../utils/siteRoutes';
import { loadOwnedDocument } from '../services/documents';
import SiteLayout from '../components/common/SiteLayout/SiteLayout';
import siteClasses from '../components/common/SiteLayout/SiteLayout.module.css';
import { Link } from 'react-router-dom';
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
import SaveProgressModal from '../components/editor/SaveProgressModal/SaveProgressModal';
import DownloadProgressModal from '../components/editor/DownloadProgressModal/DownloadProgressModal';
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
import SkillsLayoutPanel from '../components/editor/SkillsLayoutPanel/SkillsLayoutPanel';
import LongCvModal from '../components/editor/LongCvModal/LongCvModal';
import { logEvent } from '../services/eventLog';
import { saveGuestDocument, loadGuestDocument, clearGuestDocument, hasGuestDocument } from '../utils/guestDocument';
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
import { matchesAutomaticNameFitSnapshot, normalizeCommittedDocumentSnapshot } from '../utils/documentSnapshotCommit';
import { preserveSavedTextLayouts } from '../utils/savedTextLayout';
/**
 * CV editor page: canvas, toolbars, dialogs, explicit saves and guest drafts.
 *
 * Composes `useA4Elements` + `usePdfExport` into focused Canvas, UiSurfaces,
 * and Session contexts. Consumers subscribe only to the domain they need,
 * preventing unrelated surface or session updates from invalidating canvas UI.
 * Dialog (`docs` / `templates` / AI / plan) and panel (`upload` / `gallery`)
 * surfaces are mutually exclusive so only one overlay owns focus at a time.
 */

// Retain the legacy template-picker completion marker for existing metrics
// and guest claims. New documents enter CvOnboarding instead of this picker.
const TEMPLATES_MODAL_SEEN_KEY = "cv-studio:templatesModalSeen";
const LazyAiAssistant = lazy(() => import('../components/ai/AiAssistant/AiAssistant'));

function LazyAiFallback({ modal = false }) {
  useTranslation();
  return (
    <div
      className={modal ? "editor-lazy-status editor-lazy-status--modal" : "editor-lazy-status"}
      role="status"
      aria-live="polite"
    >{uiText("editor:pdfCanvas.loadingAiTool")}</div>
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
  useTranslation();
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
  usePageTitle("common:editorTitle");
  useTranslation();

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
  const { workspace, documentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const startIntent = searchParams.get("start");
  const templateIntent = searchParams.get("template");
  const initialSourceImportRef = useRef(parseDocumentId(searchParams.get("savedImport")));
  const location = useLocation();
  const routePathRef = useRef(location.pathname);
  useLayoutEffect(() => { routePathRef.current = location.pathname; }, [location.pathname]);
  // Capture the validated selection before consuming the URL. Closing setup
  // clears it so a later New CV action starts an independent configuration.
  const [startTemplateId, setStartTemplateId] = useState(() => (
    ["new", "wizard", "choose", "onboarding", "templates"].includes(startIntent)
      ? resolveStartTemplate(TEMPLATES, templateIntent)?.id || null
      : null
  ));

  const [hasInitialGuestDraft, setHasInitialGuestDraft] = useState(() => !getAccessToken() && hasGuestDocument() && !loadGuestDocument()?.isDemoContent);
  const pendingClaimDownloadRef = useRef(null);
  const [downloadReturn] = useState(() => startIntent === "download");

  // Keep the path slug aligned with auth: guests → /cvstudio/guest,
  // authenticated users → /cvstudio/{username}. The slug is cosmetic; JWT
  // ownership still decides which documents the API returns.
  useEffect(() => {
    if (documentId) return;
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
    const nextPath = getEditorPath({ start: startIntent, template: templateIntent });
    navigate(nextPath, { replace: true });
  }, [workspace, documentId, startIntent, templateIntent, navigate]);
  // Read the landing intent only while this editor instance is created. It
  // becomes the initial dialog state, which avoids a visual flash of the
  // default template picker before the requested flow is visible.
  const initialStartIntentRef = useRef(
    startIntent === "choose"
      ? "choose"
      : startIntent === "import"
      || startIntent === "new"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
      || startIntent === "demo"
      || startIntent === "download"
      || startIntent === "onboarding"
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
    if (["new", "wizard", "choose", "import", "onboarding", "blank", "templates"].includes(initialStartIntentRef.current)) return "onboarding";
    if (!documentId && !initialStartIntentRef.current && loadOnboarding(getSessionUsername())) return "onboarding";
    return null;
  }); // 'docs' | 'templates' | 'onboarding' | 'saveGate' | 'downloadGate' | 'plan' | 'changeTemplate' | 'unlockFreeform' | null
  const [onboardingEntry, setOnboardingEntry] = useState(initialStartIntentRef.current);
  const [onboardingKey, setOnboardingKey] = useState(0);
  const [panel, setPanel] = useState(null);   // 'upload' | 'gallery' | 'sections' | 'skills-layout' | null
  const isModalPdfs = dialog === 'docs' && Boolean(localStorage.getItem("token"));
  const isTemplates = dialog === 'templates';
  const isNewCvSetupModal = dialog === 'onboarding';
  const isPlanModal = dialog === 'plan';
  const isChangeTemplateModal = dialog === 'changeTemplate';
  const isUnlockFreeformModal = dialog === 'unlockFreeform';
  const isSaveGateModal = dialog === 'saveGate' || dialog === 'downloadGate';
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
  const isGallery = panel === 'gallery';
  const isDropzone = panel === 'upload';
  const isSectionsPanel = panel === 'sections';
  const isSkillsLayoutPanel = panel === 'skills-layout';
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
  // This picker is a mutually exclusive editor panel rather than a modal, so
  // the document stays visible and each of the nine radio choices can be
  // compared through an immediate canvas commit.
  const [skillsLayoutHeadingId, setSkillsLayoutHeadingId] = useState(null);
  const openSkillsLayoutPanel = useCallback((headingId) => {
    setSkillsLayoutHeadingId(headingId);
    setPanel('skills-layout');
    setDialog(null);
  }, []);
  const closeSkillsLayoutPanel = useCallback(() => {
    setPanel((current) => current === 'skills-layout' ? null : current);
    setSkillsLayoutHeadingId(null);
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
  // distinguishes an empty library from a request still in progress
  const [pdfsLoaded, setPdfsLoaded] = useState(false);
  // Compatibility fields for the existing TemplatesModal metric callbacks.
  // New onboarding does not auto-open that picker or set this flag to true.
  // Keep the ref synchronous because legacy callbacks can run in one event.
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
      uiText("editor:pdfCanvas.couldNotCheckTheOlderDraft"),
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
    handleRemoveSkillItem,
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
  } = useA4Elements(titleRef, activeCvData?.language || getUiLanguage())

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
    return true;
  }, [isGuest, pdfId]);

  const dirtyGuard = useDirtyGuard({
    signature: documentSignature,
    isGuest,
    isDemoContent,
    flushGuestDraft,
    hasUnpersistedDocument: !isGuest && !isDemoContent && pdfId == null && hasPersistedDocumentContent(persistedSnapshot),
  });
  const confirmDiscardActiveEdits = dirtyGuard.confirmDiscard;
  const allowNextNavigation = dirtyGuard.allowNextNavigation;
  const cleanNameFitSnapshotRef = useRef(null);
  const markCleanSignature = dirtyGuard.markClean;
  const markDocumentClean = useCallback((signature) => {
    // Preserve the exact confirmed snapshot, including a save that completed
    // while newer edits were being made. Later font fitting may repair only
    // this graph, never reinterpret newer user input as already saved.
    cleanNameFitSnapshotRef.current = JSON.parse(signature);
    markCleanSignature(signature);
  }, [markCleanSignature]);
  useLayoutEffect(() => {
    const baseline = cleanNameFitSnapshotRef.current;
    if (!baseline || persistedDocumentSignature(baseline) === documentSignature) return;
    if (matchesAutomaticNameFitSnapshot(baseline, persistedSnapshot)) {
      cleanNameFitSnapshotRef.current = persistedSnapshot;
      markCleanSignature(documentSignature);
    }
  }, [documentSignature, persistedSnapshot, markCleanSignature]);

  /**
   * Commit a complete document replacement through one synchronous boundary.
   *
   * React batches these state writes into one render. Every field receives an
   * explicit value from the normalized snapshot, so no pdf id, revision,
   * template, CV profile, or import provenance can leak from document A to B.
   * Callers must finish dirty/stale checks before invoking this function.
   */
  const commitDocumentSnapshot = useCallback((input, options = {}) => {
    // A document replacement without a clean baseline must not inherit the
    // previous document's permission for automatic font-layout repairs.
    cleanNameFitSnapshotRef.current = null;
    const snapshot = normalizeCommittedDocumentSnapshot(input, {
      preserveSavedLayout: options.preserveSavedLayout !== false,
    });
    const committedFlowSpacing = normalizeFlowSpacing(
      snapshot.flowSpacing ?? DEFAULT_FLOW_SPACING,
    );
    const scope = advanceDocumentSession({ preserveConversation: options.preserveConversation });

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

    // Snapshot replacement has already passed the caller's dirty guard. Keep
    // its address in the same transaction; fresh CVs must lose an old saved ID.
    const nextPath = snapshot.pdfId != null ? getDocumentPath(snapshot.pdfId)
      : routePathRef.current.startsWith('/app/documents/') ? getEditorPath() : null;
    if (nextPath && routePathRef.current !== nextPath) {
      allowNextNavigation();
      navigate(nextPath, { replace: true });
    }

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
    allowNextNavigation,
    navigate,
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

  const handleChangeSkillsLayout = useCallback((mode, chipVariant) => {
    const headingId = skillsLayoutHeadingId;
    if (!headingId) return;
    // Every radio change uses the same structural commit as reorder/transfer,
    // preserving undo/redo, autosave and repacking while the panel stays open.
    handleChangeSkillsDisplayMode(headingId, mode, chipVariant);
  }, [skillsLayoutHeadingId, handleChangeSkillsDisplayMode]);

  // usePdfExport's callback param only ever signals "the progress-modal delay
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
    else completion.reject(error || new Error(uiText("editor:pdfCanvas.couldNotSaveTheDocument")));
  }, []);
  const handlePdfId = useCallback((nextPdfId, options = {}) => {
    const { force = false } = options;
    if (
      !force
      && saveScopeRef.current
      && !isDocumentScopeCurrent(saveScopeRef.current)
    ) return;
    setPdfId(nextPdfId);
    if (nextPdfId != null && routePathRef.current.startsWith('/cvstudio/')) {
      // First save changes the workspace address, not the document session.
      // A delayed save must not redirect a newer saved-document navigation.
      allowNextNavigation();
      navigate(getDocumentPath(nextPdfId), { replace: true });
    }
    if (nextPdfId == null || Object.hasOwn(options, "revision")) {
      const parsedRevision = Number(options.revision);
      setServerRevision(
        Number.isInteger(parsedRevision) && parsedRevision >= 1 ? parsedRevision : null,
      );
    }
  }, [allowNextNavigation, isDocumentScopeCurrent, navigate]);

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

  const {
    createPdf,
    updatePdf,
    downloadPdf,
    responsePDF,
    isPdfLoading,
    pdfOperation,
    pdfOperationPhase,
  } = usePdfExport(handlePdfId, noopShowModal, titleRef, A4_Elements_deleted, clearSavedDeletedElements);
  const wasPdfLoadingRef = useRef(false);

  // Stable callback ref for the post-progress effect so a `pushToast` identity
  // change does not re-run the effect for an already-handled response.
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;
  const refreshEntitlementsRef = useRef(refreshEntitlements);
  refreshEntitlementsRef.current = refreshEntitlements;

  // Fires exactly when the create/update progress modal finishes. Save (create or
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
        uiText("editor:pdfCanvas.theDocumentChangedWhileSavingCheckThe"),
      ));
      return undefined;
    }

    if (responsePDF?.message) {
      const localizedMessage = planErrorMessage(responsePDF, responsePDF.message);
      pushToastRef.current({
        title: responsePDF?.code === "document_conflict"
          ? messageRef("editor:pdfCanvas.saveConflict")
          : (responsePDF?.code?.startsWith?.("plan_") ? messageRef("documents:modalPdfs.planAllowance") : messageRef("editor:pdfCanvas.somethingWentWrong")),
        msg: localizedMessage,
        variant: "error",
      });
      settleDialogSave(false, new Error(localizedMessage));
      return undefined;
    }
    if (!responsePDF?.success) {
      settleDialogSave(false, new Error(uiText("editor:pdfCanvas.theServerDidNotConfirmTheDocument")));
      return undefined;
    }

    // Ignore completion from a document replaced while the request was in
    // flight. For a still-current session, mark exactly the submitted snapshot
    // clean: edits made after clicking Save remain dirty.
    markDocumentClean(saveSignatureRef.current);
    // Only the submitted fields gain a saved layout baseline. Later edits
    // remain dirty and retain normal measurement until their own save.
    const savedElements = JSON.parse(saveSignatureRef.current).elements;
    setA4_Elements((current) => preserveSavedTextLayouts(current, savedElements));
    if (clearSubmittedDeletes) {
      const submittedIds = savedDeletedIdsRef.current;
      setA4_Elements_deleted((current) => current.filter((element) => {
        const elementId = typeof element === "string" ? element : element.element_id;
        return !submittedIds.has(elementId);
      }));
    }
    const fileLabel = documentTitle ? `${documentTitle}.pdf` : "CV";
    pushToastRef.current({
      title: messageRef("editor:pdfCanvas.savedToMyDocuments"),
      msg: messageRef("editor:pdfCanvas.cvSavedSuccessfully", { value0: (documentTitle ? `: ${fileLabel}` : ".") }),
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
    setA4_Elements,
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
    api.httpRequest(ENDPOINTS.AUTH.TOKEN, "GET", null, uiText("editor:pdfCanvas.tokenVerificationFailed")).
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
      if (dialog === "onboarding" || !(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      const editable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (editable) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, dialog])

  // Guest-mode autosave: guests have no account to save into, so their
  // in-progress work is persisted to localStorage (a backend write would 401).
  // This local draft is intentionally kept even though authenticated background
  // autosave was removed — it is the only way a guest's edits survive a reload
  // before they register. A 2s settle debounce mirrors the editing cadence.
  // Skipped once a real pdfId exists: from that point the document is a saved
  // account document, updated only by an explicit "Zapisz".
  useEffect(() => {
    if (!isGuest || pdfId != null) return undefined;

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

  // Preserve the legacy completion marker when a guest draft or demo is loaded.
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

  // Demo path: load the authored Linden starter once, no dialog, so the
  // visitor sees the exact Julia Bernat document used by the Linden picker
  // mockup instead of a separately maintained approximation.
  const demoStartAppliedRef = useRef(false);
  useEffect(() => {
    if (initialStartIntentRef.current !== "demo" || demoStartAppliedRef.current) return;
    demoStartAppliedRef.current = true;
    commitDocumentSnapshot({
      elements: materializeElementSpecs(getUiLanguage() === 'en'
        ? englishLinden.map((element) => element.category === 'image' && element.src?.startsWith('/template-assets')
          ? { ...element, src: `${API_BASE_URL}${element.src}` } : element)
        : lindenTemplate, nanoid),
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
    markTemplatesModalSeen();
  }, [commitDocumentSnapshot, flowSpacing, markTemplatesModalSeen, zoomIn]);

  const openOnboarding = useCallback((intent) => {
    setOnboardingEntry(intent);
    setOnboardingKey(key => key + 1);
    setDialog('onboarding');
    setPanel(null);
  }, []);
  const handleShowAiPanel = useCallback(() => openOnboarding('import'), [openOnboarding]);
  const handleShowNewCvSetup = useCallback(() => openOnboarding('new'), [openOnboarding]);

  useEffect(() => {
    if (!initialStartIntentRef.current || !searchParams.has("start")) return;
    // Let the workspace redirect finish first; two replace navigations in one
    // commit would otherwise race and could discard the selected template.
    if (location.pathname !== getEditorPath()) return;
    // The initial state already opened the requested surface. Removing the
    // parameter keeps a refresh from re-opening a dialog the user dismissed.
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("start");
    nextSearchParams.delete("template");
    nextSearchParams.delete("savedImport");
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams, location.pathname]);

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
        title: messageRef("editor:pdfCanvas.layoutAdjusted"),
        msg: fit.typographyPreset === 'S'
          ? messageRef("editor:pdfCanvas.spacingReducedAndTextSizeSetTo")
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
      title: messageRef("editor:pdfCanvas.yourCvIsQuiteLong"),
      msg: messageRef("editor:pdfCanvas.itTakesPagesOpenCustomiseCvTo", { value0: (pageCount) }),
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
        title: messageRef("editor:pdfOperationProgressModal.done"),
        msg: messageRef("editor:pdfCanvas.cvShortenedFromToPages", { value0: (baseline), value1: (pageCount) }),
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
      title: messageRef("editor:pdfCanvas.enterYourFullName"),
      msg: messageRef("editor:pdfCanvas.thisIsTheOnlyRequiredFieldBefore"),
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
  // persistence write (not a download), so the post-progress effect shows the
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
   * Resolution is owned by the post-progress response effect above, after a
   * successful response has updated the authoritative pdf id/revision and the
   * exact submitted signature has been marked clean. Rejections intentionally
   * leave the guard promise pending so navigation or replacement cannot run.
   */
  const saveCurrentDocumentAndWait = useCallback(() => {
    if (!requireNameBeforeOutput()) {
      return Promise.reject(new Error(uiText("editor:pdfCanvas.enterYourFullName2")));
    }
    if (!localStorage.getItem("token")) {
      return Promise.reject(new Error(uiText("editor:pdfCanvas.signInToSaveTheDocument")));
    }
    if (isPdfLoading || saveRequestPendingRef.current || dialogSaveCompletionRef.current) {
      return Promise.reject(new Error(uiText("editor:pdfCanvas.theDocumentIsAlreadyBeingSavedWait")));
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
  // metered quota), so they see an account gate specific to downloading.
  const handleDownloadClick = useCallback(async () => {
    if (!requireNameBeforeOutput()) return;
    if (!localStorage.getItem("token")) {
      flushGuestDraft();
      setDialog('downloadGate');
      return;
    }
    try {
      const { blob, title, finishPresentation } = await downloadPdf(A4_Elements, titleRef, pageCount, pageSize, {
        editorMode,
        templateId: activeTemplateId,
        // A saved paid-template document may remain editable after Pro expires.
        // The backend accepts its paid template only when this owned id proves
        // legacy continuity; new or unsaved paid-template payloads stay blocked.
        pdfId,
        flowSpacing,
      });
      try {
        triggerBlobDownload(blob, title);
        finishPresentation(true);
      } catch (error) {
        // Do not leave the blocking progress surface mounted if the browser
        // rejects the synthetic download click before a file is handed off.
        finishPresentation(false);
        throw error;
      }
      pushToast({
        title: messageRef("editor:pdfCanvas.cvReadyToDownload"),
        msg: messageRef("editor:pdfCanvas.downloaded", { value0: (title) }),
        variant: "success",
        action: { label: messageRef("editor:pdfOperationProgressModal.downloadPdf"), href: blob, download: title },
      });
      // A download consumes an export entitlement; refresh so the plan counter
      // reflects it without waiting for the next natural fetch.
      refreshEntitlements?.();
    } catch (error) {
      console.error(uiText("editor:pdfCanvas.couldNotDownloadThePdf"), error);
      pushToast({
        title: error?.code?.startsWith?.("plan_") ? messageRef("documents:modalPdfs.planAllowance") : messageRef("documents:modalPdfs.downloadFailed"),
        msg: planErrorMessage(error, messageRef("editor:pdfCanvas.couldNotPrepareThePdfDownload")),
        variant: "error",
      });
    }
  }, [
    A4_Elements,
    activeTemplateId,
    downloadPdf,
    flushGuestDraft,
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
    // CvOnboarding owns the replacement confirmation for its complete flow.
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
    }, { animateContent: true, preserveConversation: true, preserveSavedLayout: false });
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
    if (!template) throw new Error(uiText("editor:pdfCanvas.selectedTemplateNotFound"));
    const { cvData, fillProfile } = buildStarterDocument(config);
    const requestScope = captureDocumentScope();
    const response = await fillTemplate(fillProfile, template.id, {
      errorMessage: uiText("editor:pdfCanvas.couldNotCreateANewCv"),
      spacing: DEFAULT_FLOW_SPACING,
    });
    if (options.isCurrent?.() === false) return false;
    if (!isDocumentScopeCurrent(requestScope, { requireSameRevision: true })) {
      throw new Error(uiText("editor:pdfCanvas.theDocumentChangedDuringCreationOpenSetup"));
    }
    const created = await loadAiElementsFresh(response.elements, uiText("interview:interviewFlow.myCv"), template.id, {
      cvData,
      flowSpacing: DEFAULT_FLOW_SPACING,
      selectName: true,
      replacementConfirmed: options.replacementConfirmed === true,
    });
    if (created) {
      if (localStorage.getItem("token")) logEvent("new_cv_created");
      setStartChooserDismissed(true);
    }
    return created;
  }, [captureDocumentScope, isDocumentScopeCurrent, loadAiElementsFresh]);

  const handleRecoverLegacyDraft = useCallback(async (isCurrent = () => true) => {
    if (!legacyDraft?.profile) return;
    const requested = TEMPLATES.find((template) => template.id === legacyDraft.selectedTemplateId);
    const template = requested && isTemplateAllowed(requested, entitlements)
      ? requested
      : TEMPLATES.find((candidate) => candidate.id === "meridian");
    try {
      const response = await fillTemplate(legacyDraft.profile, template.id, {
        errorMessage: uiText("editor:pdfCanvas.couldNotMoveTheOlderDraftTo"),
        spacing: DEFAULT_FLOW_SPACING,
      });
      if (!isCurrent()) return false;
      const created = await loadAiElementsFresh(response.elements, uiText("interview:interviewFlow.myCv"), template.id, {
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
          uiText("editor:pdfCanvas.theCvWasCreatedButTheOlder"),
        );
      }
      setLegacyDraft(null);
      setStartChooserDismissed(true);
      pushToast?.({
        title: uiText("editor:pdfCanvas.draftTransferred"),
        msg: uiText("editor:pdfCanvas.yourOlderWizardDataCanNowBe"),
        variant: "success",
      });
      return true;
    } catch (error) {
      pushToast?.({
        title: uiText("editor:pdfCanvas.couldNotMoveTheDraft"),
        msg: planErrorMessage(error, uiText("editor:pdfCanvas.tryAgainTheOlderDraftHasNot")),
        variant: "error",
      });
    }
  }, [entitlements, legacyDraft, loadAiElementsFresh, pushToast]);

  // Unlocking freeform CLONES the current canvas into a new, unsaved freeform
  // copy (fresh element ids, cleared pdfId). No edits are discarded — the
  // in-memory content is carried into the copy — so no discard guard is needed.
  const confirmUnlockFreeform = useCallback(() => {
    const baseTitle = (documentTitle || "Projekt").trim() || "Projekt";
    const copyTitle = uiText("editor:pdfCanvas.freeform", { value0: (baseTitle) });
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
      title: uiText("editor:pdfCanvas.freeformProject"),
      msg: uiText("editor:pdfCanvas.aFreeformEditingCopyWasCreated"),
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

  // Drafts and the demo survive refresh. New-CV entry restores an existing
  // draft behind replacement consent so cancel cannot lose it. The import
  // gate likewise keeps the draft local without sending its data.
  useEffect(() => {
    if (guestDocumentRestoredRef.current || getAccessToken()
      || (initialStartIntentRef.current && !["import", "new", "wizard", "choose", "onboarding", "blank", "templates"].includes(initialStartIntentRef.current))) return;
    // Restoration belongs to entry, including when storage was initially empty.
    // Otherwise a later template commit can rerun this effect and overwrite the
    // new canvas with the old draft that the autosave debounce has not replaced.
    guestDocumentRestoredRef.current = true;
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
        elements: materializeElementSpecs(getUiLanguage() === 'en'
        ? englishLinden.map((element) => element.category === 'image' && element.src?.startsWith('/template-assets')
          ? { ...element, src: `${API_BASE_URL}${element.src}` } : element)
        : lindenTemplate, nanoid),
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
      null,
      guestDoc.cvData?.language,
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
    // An auth round-trip from onboarding keeps the independent browser draft
    // unclaimed. Import/setup must not be interrupted by another document flow.
    if (claimOfferedRef.current || documentId || initialStartIntentRef.current === 'onboarding') return;
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
  }, [documentId]);

  // Load the browser-buffered guest JSON onto the A4 canvas only.
  // Do not call `createPdf` / `POST /pdf/create_pdf` here — that would render and
  // persist a server document before the user asked to save. Saving does not
  // consume an export; the separate authenticated download does. They keep an unsaved
  // canvas (`pdfId` null); only explicit ownership-and-download confirmation resumes export.
  //
  // Raw guest elements already have stable ids. They go directly through the
  // snapshot commit instead of materialization, which would mint new ids and
  // break connector references that do not carry symbolic template spec ids.
  const handleClaimGuestDocumentConfirm = useCallback(() => {
    const guestDoc = pendingGuestDocRef.current;
    pendingGuestDocRef.current = null;
    setDialog(null);
    if (!guestDoc) return;
    markTemplatesModalSeen();

    // The claim is logged only after authentication. Anonymous editor activity
    // is never buffered or replayed into the account event stream.
    logEvent("guest_doc_claimed");
    // Claiming a guest draft must preserve the same saved Slate hide/show
    // contract as opening an authenticated document from “Moje dokumenty”.
    const restoredElements = normalizeProfilePhotoVisibilityPersistence(
      normalizeSterlingFamilyPersistence(guestDoc.elements, guestDoc.templateId),
      guestDoc.templateId,
      null,
      guestDoc.cvData?.language,
    );
    // Unsaved editor document: authenticated persistence waits for an explicit
    // save, but every in-memory field lands in the same replacement commit.
    const { scope: claimedScope } = commitDocumentSnapshot({
      ...guestDoc,
      elements: restoredElements,
      deletedElements: [],
      currentPage: 1,
      flowSpacing: guestDoc.spacingPx ?? DEFAULT_FLOW_SPACING,
      cvData: guestDoc.cvData ?? null,
      sourceImportId: null,
      pdfId: null,
      revision: null,
      isDemoContent: Boolean(guestDoc.isDemoContent),
    });
    clearGuestDocument();
    if (initialStartIntentRef.current === "download") {
      pendingClaimDownloadRef.current = claimedScope;
    }

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

    if (initialStartIntentRef.current === "download") return;
    pushToast({
      title: messageRef("editor:pdfCanvas.draftLoaded"),
      msg: messageRef("editor:pdfCanvas.theDocumentIsOnTheCanvasSave"),
      variant: "success",
    });
  }, [
    commitDocumentSnapshot,
    isDocumentScopeCurrent,
    pushToast,
    setActiveCvData,
    markTemplatesModalSeen,
  ]);

  // Export only after the explicit ownership-and-download action has committed
  // the restored snapshot. Consume the request before async work, so rerenders,
  // retries, or StrictMode cannot spend another export. A replacement cancels it.
  useEffect(() => {
    const scope = pendingClaimDownloadRef.current;
    if (!scope) return;
    pendingClaimDownloadRef.current = null;
    if (isDocumentScopeCurrent(scope)) void handleDownloadClick();
  }, [A4_Elements, handleDownloadClick, isDocumentScopeCurrent]);

  // Declining discards the buffered draft outright rather than leaving it to
  // be re-offered to the next person who logs in on this browser — the same
  // ownership ambiguity that makes auto-claiming unsafe would make a silent
  // "keep asking" retry just as unsafe.
  const handleClaimGuestDocumentDecline = useCallback(() => {
    pendingGuestDocRef.current = null;
    clearGuestDocument();
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

  const handleDemoUseOwnData = useCallback(() => openOnboarding('new'), [openOnboarding]);

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
    openSkillsLayoutPanel,
    addSectionRecord: handleAddSectionRecord,
    addGridSectionEntry: handleAddGridSectionEntry,
    addSkillItem: handleAddSkillItem,
    removeSkillItem: handleRemoveSkillItem,
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
    isTwoPageView, toggleTwoPageView, handleAddTextarea, handleAddSection, openAddSectionModal, openFlatSectionLayoutModal, openSkillsLayoutPanel, handleAddSectionRecord, handleAddGridSectionEntry, handleAddSkillItem, handleRemoveSkillItem, handleAddRecordBlock, handleAddRecordDescription, handleRemoveSection, handleRemoveGridSectionEntry, handleRemoveRecordBlock, handleRemoveRecordDescription, handleReorderRecordBlock, handleReorderSection, handleTransferSectionLane, handleChangeSkillsDisplayMode, markSelected, handleSetTextareaEditing, requestTextEdit, requestEditZoomRestore, editZoomSpreadTransitionRef,
    handleDuplicateElement, pageSize, zoom, zoomIn, zoomOut, undo, redo, canUndo, canRedo, resetHistory,
    deletionPreviewIds, layoutPreviewPatches, structurePreviewGroup, spacingHoldId,
    aiCorrectionHighlights,
  ]);

  const uiValue = useMemo(() => ({
    isTemplates,
    showTemplates: handleShowTemplates,
    autoOpenedTemplates,
    markTemplatesModalSeen,
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
    handleShowAiPanel, isNewCvSetupModal, handleShowNewCvSetup,
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

  // An explicit creation flow covers the shell without disposing its document.
  // Passive empty-state entry waits for guest-draft restoration and excludes demo.
  const showStartChooser = dialog === 'onboarding' || (!documentId && !hasInitialGuestDraft && shouldShowStartChooser({
    elementsCount: A4_Elements.length, isDemoContent, isPdfLoading, pdfId,
    dismissed: startChooserDismissed || ['demo', 'download'].includes(initialStartIntentRef.current),
  }));

  const [documentRouteState, setDocumentRouteState] = useState(() => ({ id: documentId, loading: Boolean(documentId), error: null }));
  const [documentRouteRetry, setDocumentRouteRetry] = useState(0);
  const livePdfIdRef = useRef(pdfId);
  useLayoutEffect(() => { livePdfIdRef.current = pdfId; }, [pdfId]);
  useEffect(() => {
    if (!documentId || Number(documentId) === livePdfIdRef.current) return;
    let active = true;
    const scope = captureDocumentScope();
    setDocumentRouteState({ id: documentId, loading: true, error: null });
    loadOwnedDocument(documentId).then((snapshot) => {
      if (!active) return;
      if (!isDocumentScopeCurrent(scope, { requireSameRevision: true })) {
        setDocumentRouteState({ id: documentId, loading: false, error: new Error(uiText("editor:pdfCanvas.theDocumentChangedWhileLoadingTryAgain")) });
        return;
      }
      commitDocumentSnapshot(snapshot, { markClean: true });
      setDialog(null);
      setDocumentRouteState({ id: documentId, loading: false, error: null });
    }).catch((error) => {
      if (active) setDocumentRouteState({ id: documentId, loading: false, error });
    });
    return () => { active = false; };
  }, [documentId, documentRouteRetry, captureDocumentScope, isDocumentScopeCurrent, commitDocumentSnapshot]);

  // Do not expose an empty or previous canvas while an address resolves. The
  // library remains reachable on missing/forbidden documents and failed reads.
  if (documentId && Number(documentId) !== pdfId) {
    const failure = documentRouteState.id === documentId ? documentRouteState.error : null;
    return <SiteLayout workspace title={failure ? uiText("editor:pdfCanvas.couldNotOpenCv") : uiText("editor:pdfCanvas.openingCv")}>
      {failure ? <div role="alert" className={siteClasses.error}><p>{failure.status === 404 || failure.status === 403 ? uiText("editor:pdfCanvas.theDocumentDoesNotExistOrYou") : failure.message}</p>
        {failure.status === 401 ? <Link to={`/login?${new URLSearchParams({ returnTo: getDocumentPath(documentId) })}`}>{uiText("editor:pdfCanvas.signInAgain")}</Link> : <button className={siteClasses.secondary} onClick={() => setDocumentRouteRetry((value) => value + 1)}>{uiText("errors:errorBoundary.tryAgain")}</button>}
      </div> : <div role="status"><p>{uiText("editor:pdfCanvas.loadingDocumentContentAndLayout")}</p><div className={siteClasses.skeleton} aria-hidden="true" /></div>}
      <Link to="/app/documents">{uiText("editor:pdfCanvas.backToDocuments")}</Link>
    </SiteLayout>;
  }

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
              <ScopedAiProvider key={lifecycleController.conversationKey} enabled={!showStartChooser}>
              <ModalPdfs />
              <UnsavedChangesDialog
                open={dirtyGuard.dialogOpen}
                onCancel={dirtyGuard.cancelDialogDiscard}
                onDiscard={dirtyGuard.confirmDialogDiscard}
                onSave={handleSaveAndContinue}
                isSaving={dirtyGuard.dialogSaving}
                isNewDocument={pdfId == null}
                error={dirtyGuard.dialogError}
              />
              <TemplatesModal />
              <PlanSelectModal />
              <ChangeTemplateModal />
              <UnlockFreeformModal
                open={isUnlockFreeformModal}
                onCancel={() => setDialog(null)}
                onConfirm={confirmUnlockFreeform}
              />
              <SaveGateModal
                open={isSaveGateModal}
                purpose={dialog === "downloadGate" ? "download" : "save"}
                onCancel={() => setDialog(null)}
              />
              <ClaimGuestDocumentModal
                open={isClaimGuestModal}
                download={downloadReturn}
                title={pendingGuestDocRef.current?.title || null}
                onConfirm={handleClaimGuestDocumentConfirm}
                onDecline={handleClaimGuestDocumentDecline}
                onDismiss={() => setDialog(null)}
              />
              <AddSectionModal
                documentLanguage={activeCvData?.language || "Polish"}
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
              <SkillsLayoutPanel
                open={isSkillsLayoutPanel}
                onClose={closeSkillsLayoutPanel}
                elements={A4_Elements}
                headingId={skillsLayoutHeadingId}
                pageHeight={pageSize?.height ?? 842}
                onChange={handleChangeSkillsLayout}
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
              {!showStartChooser && !isNewCvSetupModal && !dirtyGuard.dialogOpen ? <Editor /> : null}
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
                  {/* Save and download share one progress grammar, while their
                      copy and stages keep persistence and local file delivery
                      unambiguous. Both overlays remain outside the A4 tree. */}
                  {isPdfLoading && pdfOperation === 'save' ? (
                    <SaveProgressModal
                      phase={pdfOperationPhase}
                      title={documentTitle}
                    />
                  ) : null}
                  {isPdfLoading && pdfOperation === 'download' ? (
                    <DownloadProgressModal
                      phase={pdfOperationPhase}
                      title={documentTitle}
                    />
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
                <CvOnboarding
                  key={`${onboardingKey}:${getSessionUsername() || 'guest'}`}
                  initialTemplateId={startTemplateId}
                  initialIntent={onboardingEntry}
                  initialImportId={onboardingKey === 0 ? initialSourceImportRef.current : null}
                  entitlements={entitlements}
                  refreshEntitlements={refreshEntitlements}
                  isGuest={isGuest}
                  hasActiveDocument={(A4_Elements.length > 0 && !isDemoContent) || hasInitialGuestDraft}
                  hasSavedDocument={pdfId != null}
                  legacyDraftAvailable={Boolean(legacyDraft?.profile)}
                  onRecoverLegacyDraft={handleRecoverLegacyDraft}
                  onCreate={handleCreateStarterCv}
                  onImportCreate={async (cvData, templateId, source, options) => {
                    const scope = captureDocumentScope();
                    const result = await fillTemplate(cvData, templateId, { spacing: DEFAULT_FLOW_SPACING });
                    if (options.isCurrent?.() === false) return false;
                    if (!isDocumentScopeCurrent(scope, { requireSameRevision: true })) throw new Error(uiText('onboarding:documentChanged'));
                    const created = await loadAiElementsFresh(result.elements, uiText('interview:interviewFlow.myCv'), templateId, {
                      cvData, sourceImportId: source.kind === 'import' ? source.id : null,
                      flowSpacing: DEFAULT_FLOW_SPACING, replacementConfirmed: options.replacementConfirmed,
                    });
                    if (created && getAccessToken()) logEvent('new_cv_created');
                    return created;
                  }}
                  onNavigate={async (path, isCurrent) => {
                    if (!(await confirmDiscardActiveEdits()) || !isCurrent()) return false;
                    flushGuestDraft();
                    allowNextNavigation();
                    navigate(path);
                    return true;
                  }}
                  onClose={(reason) => {
                    setStartTemplateId(null);
                    setHasInitialGuestDraft(false);
                    setStartChooserDismissed(true);
                    setDialog(null);
                    if (reason !== 'created' && A4_Elements.length === 0 && !hasInitialGuestDraft) {
                      navigate(isGuest ? '/' : '/app/documents', { replace: true });
                    }
                  }}
                />
              ) : null}
              {!showStartChooser ? <Gallery /> : null}
              {!showStartChooser && entitlements?.ai_assistant ? (
                <Suspense fallback={<LazyAiFallback />}>
                  <LazyAiAssistant hideLauncher={isSkillsLayoutPanel} />
                </Suspense>
              ) : null}
              <ToastStack toasts={toasts} onDismiss={dismissToast} />
              </ScopedAiProvider>
    </EditorView>
  )
}

export default EditorController;
