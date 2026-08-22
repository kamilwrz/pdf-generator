/**
 * Default PdfContext shape for the CV canvas editor.
 *
 * PdfCanvas provides the real implementation via `PdfContext.Provider`.
 * Canvas/editor children read handlers through `use(PdfContext)` so they stay
 * decoupled from prop drilling. Default no-ops keep Storybook/tests from
 * crashing when a provider is absent.
 */
import { createContext } from "react";

export const PdfContext = createContext({
    A4_Elements: [],
    groupMoveDelta: null,
    isTwoPageView: false,
    toggleTwoPageView: () => {},
    setPageCanvasRef: () => {},
    addImage: () => {},
    addText: () => {},
    addLine: () => {},
    addRectangle: () => {},
    addCircle: () => {},
    addEllipse: () => {},
    addPolygon: () => {},
    addPath: () => {},
    addConnector: () => {},
    addSection: () => {},
    openAddSectionModal: () => {},
    openFlatSectionLayoutModal: () => {},
    openSkillsLayoutModal: () => {},
    // Bridge for surfaces (e.g. the "CV too long" modal) that need to open the
    // AI assistant and fire an action. `{ action, nonce }`; bump nonce to re-fire.
    assistantAction: null,
    requestAssistantAction: () => {},
    addSectionRecord: () => {},
    addRecordBlock: () => {},
    removeSection: () => {},
    removeRecordBlock: () => {},
    reorderRecordBlock: () => {},
    reorderSection: () => {},
    transferSectionLane: () => {},
    changeSkillsDisplayMode: () => {},
    requestEditZoomRestore: () => {},
    editZoomSpreadTransitionRef: { current: null },
    isBioCvModal: false,
    showBioCvModal: () => {},
    cancelBioCvModal: () => {},
    isPlanModal: false,
    showPlanModal: () => {},
    clonePage: () => {},
    movePage: () => {},
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    resetHistory: () => {},
    activePdfId: null,
    // Guard for canvas-replacing actions: returns true when it is safe to
    // discard the current in-memory document (no unsaved edits, or the user
    // confirmed). Default no-op provider always allows the switch.
    confirmDiscardActiveEdits: () => true,
    discardActiveDocument: () => {},
    pageSize: { width: 595, height: 842 },
    zoom: 1.0,
    zoomIn: () => {},
    zoomOut: () => {},
    selectElement: () => {},
    moveElement: () => {},
    moveSelectedElements: () => {},
    selectMoveElement: () => {},
    spacingHoldId: null,
    setSpacingHoldId: () => {},
    isGallery: false,
    isDropzone: false,
    createPdf: () => {},
    showDropzone: () => {},
    showGallery: () => {},
    editElementValues: () => {},
    collapseSpilledMainIntoSidebar: () => {},
    editSelectedElementValues: () => {},
    applyStructureOperation: () => {},
    applyCloneOperation: () => {},
    applyDeleteOperation: () => {},
    // Contact channel manager: remove/add a channel (icon + label) and reflow.
    removeContactChannel: () => {},
    addContactChannel: () => {},
    toggleNameCase: () => {},
    toggleTitle: () => {},
    fitTextareaToContent: () => {},
    alignElement: () => {},
    deleteElement: () => {},
    deleteSelectedElements: () => {},
    duplicateSelectedElements: () => {},
    setA4_Elements: () => {},
    valueImageUpload: 0,
    setValueImageUpload: () => {},
    addTitle: () => {},
    isVisibleModal: false,
    setIsModalPdfs: () => {},
    resizeElement: () => {},
    // Render-on-demand download of the current canvas, independent of Save.
    downloadPdf: () => {},
    handlePdfId: () => {},
    handleSetTitle: () => {},
    title: undefined,
    clearA4modalDelete: () => {},
    clearA4: () => {},
    entitlements: null,
    refreshEntitlements: async () => null,
    logout: () => {},
    isPdfLoading: false,
    setA4_Elements_deleted: () => {},
    structurePreviewGroup: null,
    setStructurePreviewGroup: () => {},
    deletionPreviewIds: [],
    setDeletionPreviewIds: () => {},
    // Pending AI suggestion marks on the A4 canvas (content/style/layout/…).
    aiCorrectionHighlights: [],
    setAiCorrectionHighlights: () => {},
    // Structured cv_data behind the CV currently on the canvas (set by
    // AiCvPanel/BioCvModal on a successful fill; null when the canvas has no
    // known reusable source data — e.g. a blank template or a reopened saved
    // document). Backs the Topbar "Zmień szablon" gallery.
    activeCvData: null,
    setActiveCvData: () => {},
    isChangeTemplateModal: false,
    showChangeTemplateModal: () => {},
    // template = layout-owned; freeform = free positioning.
    editorMode: "freeform",
    setEditorMode: () => {},
    flowSpacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    setFlowSpacing: () => {},
    // Rhythm knobs from the last render / document load (Sections panel Reset).
    baselineFlowSpacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    // Adopt knobs + Reset baseline together (load PDF, change template, clear).
    adoptDocumentFlowSpacing: () => {},
    activeTemplateId: null,
    setActiveTemplateId: () => {},
    hydrateDocumentMode: () => {},
    showUnlockFreeform: () => {},
    unlockFreeform: () => {},
    showSections: () => {},
    isSectionsPanel: false,
    // Raw canvas replace: swaps elements/template but — unlike `loadAiElements`
    // — keeps the current pdfId and title, so it updates the existing saved
    // document instead of starting a new one.
    replaceActiveElements: () => {},
})
