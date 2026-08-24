import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { measureTextareaHeight } from '../utils/textareaHeight';
import { reflowTextareaHeight } from '../utils/textareaReflow';
import { reconcileDocumentPages } from '../utils/structureOperation';
import { findPageCanvasAtPoint } from '../utils/pageSpread';
import { moveElementsByDelta } from '../utils/pageDrag';
import { sanitizeTextContent } from '../utils/sanitizeTextContent';
import { trimTrailingEmptyTextareaPayload } from '../utils/textareaHeight';
import { markContentElementsEnter, markElementsEnter, isCanvasEnterReflowSuppressed, endCanvasEnterReflowSuppress } from '../utils/canvasEnter';
import { isDecorativeChrome } from '../utils/elementInteraction';
import {
  EDITOR_MODE_FREEFORM,
  EDITOR_MODE_TEMPLATE,
  canCloneOrDeleteElements,
  canFreePositionElement,
  canResizeElement,
  normalizeEditorMode,
} from '../utils/editorMode';
import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from '../utils/flowSpacing';
import { collapseSpilledMainIntoSidebar } from '../utils/collapseMainIntoSidebar';
import { transferSectionLane } from '../utils/transferSectionLane';
import { changeSkillsDisplayMode } from '../utils/skillsDisplayMode';
import {
  deriveSectionStyle,
  appendSectionAtEnd,
  healDecorativeOrdinalBaselines,
  healSkillChipLabelBaselines,
  insertSectionAfter,
  isSidebarSectionHeading,
  listDocumentSections,
  listSidebarSections,
  removeSection,
  reorderSection,
} from '../utils/sectionStructure';
import { buildSectionElements } from '../utils/sectionBuilder';
import {
  appendRecordToSection,
  insertRecordBlockAfterRecord,
  removeRecordBlock,
  reorderRecordBlock,
} from '../utils/sectionRecord';
import { applySelectedSectionIcon } from '../utils/sectionIcons';
import {
  createCircleElement,
  createEllipseElement,
  createImageElement,
  createLineElement,
  createPathElement,
  createPolygonElement,
  createRectangleElement,
  createTextElement,
  createTextareaElement,
} from '../utils/a4ElementFactories';
import { materializeElementSpecs } from '../utils/materializeElementSpecs';
import { useDocumentHistory } from './useDocumentHistory';
import { applyChannelRemoval, applyChannelAddition, applyChannelRelayout } from '../utils/contactBandOps';
import { applyNameCaseToggle, applyTitleToggle } from '../utils/mastheadIdentityOps';
import { canvasFontFamily } from '../utils/canvasFont';
import { hasActiveTextEdit, isCanvasInteractionTarget } from '../utils/editZoomExit';
import { useElementSelectionDrag } from './useElementSelectionDrag';
import API_BASE_URL, { ENDPOINTS } from '../services/api';

/**
 * Core canvas state hook for the A4 CV editor.
 *
 * Owns element CRUD, selection/drag/resize, multi-page view, undo/redo history,
 * connector draw mode, template/AI loaders, and zoom. Geometry uses A4 points
 * (595×842) 1:1 with the PDF renderer. Decorative `fixedToPage` chrome is
 * interaction-locked via `isDecorativeChrome`.
 *
 * @param {React.RefObject<HTMLInputElement|null>} titleRef - Document title input.
 */

// Elements a connector can attach to — those with a real bounding box the
// backend can reproduce for the PDF. Single-line text (no stored width/height)
// is intentionally excluded.
const CONNECTABLE = new Set(["textarea", "rectangle", "circle", "ellipse", "image", "line"]);

// Fixed A4 portrait page (pt = px, 1:1 with the PDF). Orientation is not
// user-switchable — CV layouts are portrait-only.
export const A4_PAGE_SIZE = Object.freeze({ width: 595, height: 842 });

// Canvas zoom is view-only (never persisted or exported). Snap each step to
// the 0.1 grid (not just +/- 0.1 from the current value) so levels are always
// clean multiples — otherwise, once you hit the 0.25 floor (not on the grid),
// every later step lands on ...5 values and 100% becomes unreachable.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
// Opening the editor always starts at 100%. Zoom remains view-only (not
// persisted or exported).
const ZOOM_DEFAULT = 1.0;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
const stepZoom = (z, dir) => clampZoom(Math.round((z + dir * ZOOM_STEP) * 10) / 10);

// Entering text-edit mode zooms the canvas to this level so small type is
// readable while typing, then restores the pre-edit zoom on exit (see the
// editingElementId effect below). Editing from a two-page spread temporarily
// focuses the selected element's page before applying this same zoom.
const EDIT_ZOOM = 2;
// Matches the CSS transition on `.A4` / `.zoomWrapper` (A4.module.css) plus a
// small buffer. `scrollIntoView` called mid-transition targets an
// interpolated (not final) position, so the post-zoom scroll waits for the
// transition to settle before measuring the edited element for real.
const EDIT_ZOOM_TRANSITION_MS = 260;

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Return whether a pointer event originated on an A4 page or one of its
 * rendered elements. Toolbar, sidebar, and browser-chrome clicks must not end
 * the focused text edit's temporary zoom level.
 */
export function useA4Elements(titleRef) {

  const A4ref = useRef(null);
  // Scroll container for the page(s); the edit-zoom effect below scrolls this
  // to bring the edited element into view. Exposed so PdfCanvas.jsx can attach
  // it to `.canvas-area` instead of keeping its own separate ref.
  const canvasAreaRef = useRef(null);

  const [A4_Elements, setA4_Elements] = useState([]);
  const [A4_Elements_deleted, setA4_Elements_deleted] = useState([]);
  // Last loaded template slug (e.g. "monument"). Used by Layout AI for layout_contract
  // hints; cleared for blank canvases and unknown freestyle loads.
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  // Lets stable callbacks (e.g. the skills layout picker) read the current
  // template without being recreated on every template change.
  const activeTemplateIdRef = useRef(null);
  useEffect(() => { activeTemplateIdRef.current = activeTemplateId; }, [activeTemplateId]);
  // Constrained template layout vs freeform project. Persisted with the Pdf row.
  const [editorMode, setEditorModeState] = useState(EDITOR_MODE_FREEFORM);
  const editorModeRef = useRef(EDITOR_MODE_FREEFORM);
  const setEditorMode = useCallback((mode) => {
    const next = normalizeEditorMode(mode);
    editorModeRef.current = next;
    setEditorModeState(next);
  }, []);
  // Per-document SPACE_* rhythm (Sections panel). Persisted as Pdf.spacing_px.
  const [flowSpacing, setFlowSpacingState] = useState(() => ({ ...DEFAULT_FLOW_SPACING }));
  const flowSpacingRef = useRef(flowSpacing);
  // Rhythm knobs captured when the CV was rendered / loaded. Reset restores
  // these — not a blind re-pack to DEFAULT while the knobs are already there
  // (force-packing generator geometry changes pagination, e.g. Monument education).
  const [baselineFlowSpacing, setBaselineFlowSpacingState] = useState(() => ({
    ...DEFAULT_FLOW_SPACING,
  }));
  const setFlowSpacing = useCallback((next) => {
    const normalized = normalizeFlowSpacing(
      typeof next === "function" ? next(flowSpacingRef.current) : next,
    );
    flowSpacingRef.current = normalized;
    setFlowSpacingState(normalized);
  }, []);
  const setBaselineFlowSpacing = useCallback((next) => {
    setBaselineFlowSpacingState(normalizeFlowSpacing(next));
  }, []);
  /**
   * Adopt spacing for a newly loaded / rendered document and pin Reset to it.
   */
  const adoptDocumentFlowSpacing = useCallback((next) => {
    const normalized = normalizeFlowSpacing(next ?? DEFAULT_FLOW_SPACING);
    flowSpacingRef.current = normalized;
    setFlowSpacingState(normalized);
    setBaselineFlowSpacingState(normalized);
  }, []);
  /**
   * After a fresh generator fill that used the live knobs, pin Reset to those
   * knobs without rewriting them (fill already sent flowSpacing to the API).
   */
  const pinFlowSpacingBaseline = useCallback(() => {
    setBaselineFlowSpacingState(normalizeFlowSpacing(flowSpacingRef.current));
  }, []);

  // ---- Connector draw mode ----
  // connectMode: true while the user is picking the two elements to link.
  // connectSourceId: the first element picked (null until then).
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState(null);

  // ---- Multi-page state ----
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTwoPageView, setIsTwoPageView] = useState(false);

  // ---- Page geometry: fixed A4 portrait ----
  const pageSize = A4_PAGE_SIZE;
  // View-only zoom (not persisted, not in undo/redo — lives outside A4_Elements).
  const [zoom, setZoomState] = useState(ZOOM_DEFAULT);
  const zoomIn = useCallback(() => setZoomState(z => stepZoom(z, 1)), []);
  const zoomOut = useCallback(() => setZoomState(z => stepZoom(z, -1)), []);
  const toggleTwoPageView = useCallback(() => {
    setIsTwoPageView((visible) => (pageCountRef.current > 1 ? !visible : false));
  }, []);

  // Refs let the stable add-element callbacks read the latest page/elements
  // without being recreated on every page change.
  const currentPageRef = useRef(1);
  const elementsRef = useRef([]);
  const pageSizeRef = useRef(A4_PAGE_SIZE);
  const pageCountRef = useRef(1);
  const pageCanvasRefs = useRef(new Map());
  const reflowPageCountRef = useRef(null);
  const layoutTargetPageRef = useRef(null);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  const setPageCanvasRef = useCallback((page, node) => {
    if (node) {
      pageCanvasRefs.current.set(page, node);
    } else {
      pageCanvasRefs.current.delete(page);
    }
    if (page === currentPageRef.current) {
      A4ref.current = node ?? pageCanvasRefs.current.get(currentPageRef.current) ?? null;
    }
  }, []);
  const canvasForPage = useCallback((page) => (
    pageCanvasRefs.current.get(page) ?? A4ref.current
  ), []);
  const visibleCanvasEntries = useCallback(() => (
    [...pageCanvasRefs.current.entries()]
      .map(([page, node]) => ({ page, node }))
      .filter(({ node }) => Boolean(node))
  ), []);
  useEffect(() => {
    A4ref.current = pageCanvasRefs.current.get(currentPage) ?? null;
  }, [currentPage]);
  useEffect(() => { elementsRef.current = A4_Elements; }, [A4_Elements]);

  // ---- Auto-zoom while editing text ----
  // Entering edit mode on a text/textarea element zooms the canvas to
  // EDIT_ZOOM and scrolls so the element is centered, then restores the
  // pre-edit zoom on exit. `editingElementId` is a plain string (or null), so
  // even though this useMemo re-runs on every keystroke (A4_Elements changes
  // as content is typed), the effect below — keyed on that primitive value —
  // only re-fires when the *edited element itself* changes, not on every
  // keystroke inside it.
  const editingElementId = useMemo(() => {
    const editing = A4_Elements.find((element) => (
      element.isEditing && (element.category === "text" || element.category === "textarea")
    ));
    return editing ? editing.element_id : null;
  }, [A4_Elements]);
  // Keep page as a primitive dependency: content edits replace A4_Elements on
  // every keystroke, but they do not re-run the zoom/scroll effect.
  const editingElementPage = useMemo(() => {
    if (!editingElementId) return null;
    return A4_Elements.find((element) => element.element_id === editingElementId)?.page ?? null;
  }, [A4_Elements, editingElementId]);
  // Zoom level to restore when edit mode ends; null while not auto-zoomed.
  const editZoomPreviousRef = useRef(null);
  // A two-page spread cannot keep both A4 sheets legible at 200%. Remember
  // that it was active so an edit started there can focus its own page, then
  // return the reader to the previous spread after an intentional edit exit.
  const editZoomPreviousSpreadRef = useRef(null);
  // Switching a spread to one page unmounts the old contentEditable node. Its
  // browser blur is a view-transition side effect, not a user edit finalisation.
  // Store the affected id until the replacement edit node is mounted and seeded.
  const editZoomSpreadTransitionRef = useRef(null);
  // A blur can be caused by any control outside the canvas. Restore the
  // temporary edit zoom only after an intentional page/element interaction,
  // not when the user uses the sidebar or toolbar while text remains focused.
  const editZoomExitRequestedRef = useRef(false);
  // Switching directly from one text element to another briefly clears the
  // previous `editingElementId`. Delay restoration until the next task so the
  // replacement edit can claim the document first.
  const editZoomRestoreTimerRef = useRef(null);
  const restoreEditZoom = useCallback(() => {
    if (editZoomRestoreTimerRef.current != null) {
      window.clearTimeout(editZoomRestoreTimerRef.current);
      editZoomRestoreTimerRef.current = null;
    }
    editZoomExitRequestedRef.current = true;
    if (editZoomPreviousRef.current != null) {
      setZoomState(editZoomPreviousRef.current);
      editZoomPreviousRef.current = null;
    }
    if (editZoomPreviousSpreadRef.current) {
      setIsTwoPageView(true);
      editZoomPreviousSpreadRef.current = null;
    }
    editZoomExitRequestedRef.current = false;
  }, []);
  useEffect(() => {
    const markCanvasEditExit = (event) => {
      if (!isCanvasInteractionTarget(event.target)) return;
      // Structural controls can close the active edit without changing the
      // primitive `editingElementId` dependency. If no edit surface remains,
      // restore immediately so the next canvas click cannot leave stale zoom.
      if (
        !document.querySelector('[contenteditable="true"]')
        && editZoomPreviousRef.current != null
      ) {
        restoreEditZoom();
        return;
      }
      editZoomExitRequestedRef.current = true;
    };
    document.addEventListener("pointerdown", markCanvasEditExit, true);
    return () => document.removeEventListener("pointerdown", markCanvasEditExit, true);
  }, [restoreEditZoom]);
  const requestEditZoomRestore = useCallback(() => {
    // The properties panel's click is preceded by the contentEditable blur.
    // That blur can commit `isEditing: false` before the Close handler runs,
    // so setting only a ref here would not trigger the zoom effect again.
    // Restore synchronously from the saved pre-edit value instead.
    restoreEditZoom();
  }, [restoreEditZoom]);
  useEffect(() => {
    if (!editingElementId) {
      const shouldRestore = editZoomExitRequestedRef.current;
      if (!shouldRestore) return undefined;
      if (editZoomRestoreTimerRef.current == null) {
        editZoomRestoreTimerRef.current = window.setTimeout(() => {
          editZoomRestoreTimerRef.current = null;
          // A direct canvas switch clears the old edit before the new edit is
          // scheduled. Keep the zoomed page when that handoff completed.
          if (hasActiveTextEdit(elementsRef.current)) {
            editZoomExitRequestedRef.current = false;
            return;
          }
          restoreEditZoom();
        }, 0);
      }
      return undefined;
    }

    if (isTwoPageView) {
      if (editZoomPreviousSpreadRef.current == null) {
        editZoomPreviousSpreadRef.current = true;
      }
      // A spread may currently be anchored to its neighbouring page. Make the
      // selected page the single-page target before its 200% transform begins.
      if (Number.isInteger(editingElementPage) && editingElementPage > 0) {
        setCurrentPage(editingElementPage);
      }
      editZoomSpreadTransitionRef.current = editingElementId;
      setIsTwoPageView(false);
      return undefined;
    }

    // A click on another canvas element also marks a potential exit. Reset the
    // signal when that click immediately opens the next text edit instead.
    editZoomExitRequestedRef.current = false;
    setZoomState((current) => {
      if (editZoomPreviousRef.current == null) editZoomPreviousRef.current = current;
      return EDIT_ZOOM;
    });

    // `scrollIntoView` on the edited node itself (native, so it accounts for
    // the real post-zoom layout instead of a manually derived position) —
    // but only once the zoom transition has actually settled; called earlier
    // it would center on the element's still-animating, not-yet-final spot.
    const reduceMotion = prefersReducedMotion();
    const scrollToEditedElement = () => {
      document.getElementById(editingElementId)?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    };
    if (reduceMotion) {
      scrollToEditedElement();
      return undefined;
    }
    const timer = window.setTimeout(scrollToEditedElement, EDIT_ZOOM_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [editingElementId, editingElementPage, isTwoPageView, restoreEditZoom]);

  // Strip NULL/NBSP junk and trailing bullet placeholders already sitting in
  // open documents (loaded before sanitization existed, or left after edit).
  // Plain textarea blank rows are authored spacing and remain untouched.
  // Skip the element currently being edited; Textarea normalizes bullets on blur.
  // One pass; clean state is a no-op.
  useEffect(() => {
    const needsScrub = A4_Elements.some((element) => {
      if (
        (element.category !== "text" && element.category !== "textarea")
        || element.content == null
        || element.isEditing
      ) {
        return false;
      }
      const sanitized = sanitizeTextContent(element.content);
      if (element.category === "textarea") {
        const trimmed = trimTrailingEmptyTextareaPayload(
          sanitized,
          element.runs,
          { bulletList: !!element.bulletList },
        );
        return trimmed.content !== element.content;
      }
      return sanitized !== element.content;
    });
    if (!needsScrub) return;
    setA4_Elements((prev) => prev.map((element) => {
      if (
        (element.category !== "text" && element.category !== "textarea")
        || element.content == null
        || element.isEditing
      ) {
        return element;
      }
      const sanitized = sanitizeTextContent(element.content);
      if (element.category === "textarea") {
        const trimmed = trimTrailingEmptyTextareaPayload(
          sanitized,
          element.runs,
          { bulletList: !!element.bulletList },
        );
        if (trimmed.content === element.content) return element;
        return {
          ...element,
          content: trimmed.content,
          runs: trimmed.runs,
        };
      }
      return sanitized === element.content ? element : { ...element, content: sanitized };
    }));
  }, [A4_Elements]);

  // Repair Monument ordinal badges saved with digits below the title baseline
  // (legacy badgeNumber.relTop=8 → square+16) and Cardinal skill-chip labels
  // saved at CHIP_PAD_Y instead of the pill midline. No-op when already aligned.
  useEffect(() => {
    let healed = healDecorativeOrdinalBaselines(A4_Elements);
    healed = healSkillChipLabelBaselines(healed);
    if (healed === A4_Elements) return;
    const changed = healed.some((element, index) => element !== A4_Elements[index]);
    if (!changed) return;
    setA4_Elements(healed);
  }, [A4_Elements]);
  useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]);
  useEffect(() => {
    if (pageCount < 2) setIsTwoPageView(false);
  }, [pageCount]);
  useEffect(() => {
    // Every element-producing path (textarea growth, section packing, AI
    // patches, manual page chrome) converges here. Deriving the fallback from
    // the committed array avoids reading a value assigned inside a React state
    // updater before that updater has actually run.
    const committedMaxPage = Math.max(
      1,
      ...A4_Elements.map((element) => Math.max(1, Math.trunc(element.page ?? 1))),
    );
    const nextPageCount = reflowPageCountRef.current ?? committedMaxPage;
    reflowPageCountRef.current = null;
    setPageCount((count) => (count === nextPageCount ? count : nextPageCount));
    const targetPage = layoutTargetPageRef.current;
    layoutTargetPageRef.current = null;
    setCurrentPage((page) => targetPage ?? Math.min(page, nextPageCount));
  }, [A4_Elements]);

  // Undo/redo lives in useDocumentHistory — session-scoped, never persisted.
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,
    markHistoryQuiet,
  } = useDocumentHistory({
    elements: A4_Elements,
    pageCount,
    elementsRef,
    pageCountRef,
    setElements: setA4_Elements,
    setPageCount,
    setCurrentPage,
  });

  const {
    groupMoveDelta,
    clearSelection,
    handleMoveElement,
    handleMoveSelectedElements,
    handleSelectMoveElement,
    handleSelectElement,
    markSelected,
  } = useElementSelectionDrag({
    elementsRef,
    pageSizeRef,
    canvasForPage,
    visibleCanvasEntries,
    editorModeRef,
    setElements: setA4_Elements,
    setDeletedElements: setA4_Elements_deleted,
  });

  // Clicking bare canvas background — the scroll container's own padding/
  // gutters, or a page's blank surface, as opposed to any specific element —
  // exits whatever is currently selected or being edited. `event.target` is
  // checked against the nearest `[data-page-canvas]` ancestor rather than
  // relying on individual elements calling stopPropagation: a click lands
  // exactly on the page node only when it did not hit any actual rendered
  // element (element clicks always target a deeper descendant), so this stays
  // correct regardless of which element type was clicked past.
  // Blurring first lets the focused element's own finalize logic (content
  // commit) run via its existing onBlur handler before the selection clears.
  const handleCanvasBackgroundClick = useCallback((event) => {
    const pageNode = event.target?.closest?.("[data-page-canvas]");
    const isBackground = !pageNode || pageNode === event.target;
    if (!isBackground) return;
    if (typeof document !== "undefined" && document.activeElement?.isContentEditable) {
      document.activeElement.blur();
    }
    clearSelection();
  }, [clearSelection]);

  // Enter connector mode: next two element clicks pick source then target.
  // Connectors are retired from the editor; keep a no-op so old context wiring
  // does not throw. Legacy documents may still render existing connector rows.
  const startConnecting = useCallback(() => {}, []);

  const cancelConnecting = useCallback(() => {
    setConnectMode(false);
    setConnectSourceId(null);
  }, []);

  // Topmost connectable element on the requested page whose box contains the
  // given canvas-space point (px from the A4 top-left corner).
  const elementAtPoint = (x, y, page = currentPageRef.current) => {
    const hits = elementsRef.current.filter((el) =>
      CONNECTABLE.has(el.category) &&
      (el.page ?? 1) === page &&
      x >= el.left && x <= el.left + (parseFloat(el.width) || 0) &&
      y >= el.top && y <= el.top + (parseFloat(el.height) || 0)
    );
    if (hits.length === 0) return null;
    return hits.reduce((top, el) => ((el.zIndex ?? 0) >= (top.zIndex ?? 0) ? el : top));
  };

  // Called by the A4 click handler while in connect mode. Resolves the element
  // under the cursor by geometry (no DOM ids needed). First hit = source,
  // second (different) hit = target -> creates the connector. Clicking empty
  // space cancels.
  const pickConnectorAt = useCallback((clientX, clientY, requestedPage) => {
    const resolved = requestedPage
      ? { page: requestedPage, node: canvasForPage(requestedPage) }
      : findPageCanvasAtPoint(visibleCanvasEntries(), clientX, clientY);
    const page = resolved?.page ?? currentPageRef.current;
    const rect = resolved?.node?.getBoundingClientRect();
    if (!rect) return;
    // rect is the SCALED #A4; convert the screen-space click offset back to
    // canvas units so it matches stored element left/top/width/height.
    const zoom = rect.width / pageSizeRef.current.width || 1;
    const hit = elementAtPoint((clientX - rect.left) / zoom, (clientY - rect.top) / zoom, page);
    if (!hit) { setConnectMode(false); setConnectSourceId(null); return; }

    // Side effects (setA4_Elements, setConnectMode) run here, outside any
    // updater — React StrictMode double-invokes functional state updaters
    // in dev, which previously caused a second click to create two
    // connectors (each with its own nanoid()) from one click.
    if (!connectSourceId) {
      setConnectSourceId(hit.element_id);               // first pick
      return;
    }
    if (connectSourceId === hit.element_id) return;      // ignore same element
    const source = elementsRef.current.find((element) => element.element_id === connectSourceId);
    // Connector paths are page-local. Keep the first endpoint selected when
    // the second click lands on the opposite page instead of creating an
    // invalid cross-page path.
    if ((source?.page ?? 1) !== page) return;
    const connector = {
      element_id: nanoid(),
      category: "connector",
      source_id: connectSourceId,
      target_id: hit.element_id,
      backgroundColor: "#000000",
      borderWidth: 1,
      arrow: true,
      isSelected: false,
      isMove: false,
      locked: false,
      zIndex: 50,
      page,
    };
    setA4_Elements((prev) => [...prev, connector]);
    setConnectMode(false);
    setConnectSourceId(null);
  }, [canvasForPage, visibleCanvasEntries, connectSourceId]);

  /**
   * Sync fixed page chrome / pageCount only. Never rewrites content geometry —
   * packing and textarea reflow own Y positions. Returns the same array
   * reference when chrome does not need to change.
   *
   * @param {object[]} elements
   * @param {{ minPageCount?: number, collapseEmpty?: boolean }} [options]
   * @returns {object[]}
   */
  const finalizeDocumentPages = useCallback((elements, options = {}) => {
    const reconciled = reconcileDocumentPages(elements, nanoid, {
      collapseEmpty: true,
      ...options,
    });
    reflowPageCountRef.current = reconciled.pageCount;
    return reconciled.elements;
  }, []);

  // Soft cap so Next / Dodaj stronę cannot grow forever by mis-clicks.
  const MAX_DOCUMENT_PAGES = 20;

  const handleGoToPage = useCallback((page) => {
    const target = Math.max(1, Math.trunc(page));
    if (target > MAX_DOCUMENT_PAGES) return;

    // Navigating past the last page (e.g. after page 2 was collapsed) creates
    // a fresh continuation with template chrome and the correct page number.
    if (target > pageCountRef.current) {
      setA4_Elements((prev) => finalizeDocumentPages(prev, {
        minPageCount: target,
        collapseEmpty: false,
      }));
      // Required for freeform documents with no fixed chrome: reconciling an
      // intentionally blank page can legitimately return the same array.
      setPageCount(target);
      setCurrentPage(target);
      clearSelection();
      return;
    }

    setCurrentPage(Math.min(target, pageCountRef.current));
    clearSelection();
  }, [clearSelection, finalizeDocumentPages]);

  const handleAddPage = useCallback(() => {
    const next = Math.min(MAX_DOCUMENT_PAGES, pageCountRef.current + 1);
    if (next <= pageCountRef.current) return;
    setA4_Elements((prev) => finalizeDocumentPages(prev, {
      minPageCount: next,
      collapseEmpty: false,
    }));
    setPageCount(next);
    setCurrentPage(next);
    clearSelection();
  }, [clearSelection, finalizeDocumentPages]);

  // Clone the current page: every element on it is duplicated with a fresh id
  // onto a new page inserted DIRECTLY AFTER it (later pages shift down by one).
  // Connectors between cloned elements are re-pointed at the clones. Works for
  // any document type — it only touches the shared page model.
  const handleClonePage = useCallback(() => {
    const src = currentPageRef.current;
    // setPageCount, setA4_Elements and setCurrentPage are all called
    // independently here rather than nesting the latter two inside
    // setPageCount's updater — React StrictMode double-invokes functional
    // state updaters in dev, which previously caused a single click to
    // clone the page's elements twice (each with fresh nanoid()s).
    setA4_Elements(prev => {
      // make room: pages after the source shift one down
      const shifted = prev.map(el => {
        const p = el.page ?? 1;
        return p > src ? { ...el, page: p + 1 } : el;
      });
      // duplicate the source page's elements onto the new page
      const idMap = {};
      const clones = prev
        .filter(el => (el.page ?? 1) === src)
        .map(el => {
          const nid = nanoid();
          idMap[el.element_id] = nid;
          return { ...el, element_id: nid, page: src + 1, isSelected: false, isMove: false, isEditing: false };
        })
        .map(el => el.category === "connector"
          ? { ...el, source_id: idMap[el.source_id] ?? el.source_id, target_id: idMap[el.target_id] ?? el.target_id }
          : el);
      markElementsEnter(clones.map((el) => el.element_id));
      // Renumber "01"/"02" labels after the insert shifts later pages.
      return finalizeDocumentPages([...shifted, ...clones], {
        minPageCount: pageCountRef.current + 1,
        collapseEmpty: false,
      });
    });
    setCurrentPage(src + 1);   // land on the fresh copy
    clearSelection();
  }, [clearSelection, finalizeDocumentPages]);

  // Swap the current page with its neighbour (dir: -1 earlier, +1 later) and
  // follow it, so repeated clicks walk the page through the document.
  const handleMovePage = useCallback((dir) => {
    const from = currentPageRef.current;
    const count = pageCountRef.current;
    const to = from + dir;
    if (to < 1 || to > count) return;
    setA4_Elements((prev) => {
      const swapped = prev.map((el) => {
        const p = el.page ?? 1;
        if (p === from) return { ...el, page: to };
        if (p === to) return { ...el, page: from };
        return el;
      });
      return finalizeDocumentPages(swapped, {
        minPageCount: count,
        collapseEmpty: false,
      });
    });
    setCurrentPage(to);
    clearSelection();
  }, [clearSelection, finalizeDocumentPages]);

  const handleRemovePage = useCallback(() => {
    if (pageCountRef.current <= 1) return;

    // Read the page being removed from the ref so we don't depend on
    // currentPage in this callback.
    const removed = currentPageRef.current;

    // Track elements on the removed page as deletions so an update wipes
    // them from the DB (mirrors handleDeleteElement).
    const removedEls = elementsRef.current.filter((e) => (e.page ?? 1) === removed);
    if (removedEls.length) {
      setA4_Elements_deleted((prevDel) => {
        const additions = removedEls
          .filter((e) => !prevDel.some((d) => d.element_id === e.element_id))
          .map((e) => ({ ...e, deleted: true }));
        return additions.length ? [...prevDel, ...additions] : prevDel;
      });
    }

    // Drop the page, shift later pages down, then renumber chrome labels.
    setA4_Elements((prev) => {
      const shifted = prev
        .filter((e) => (e.page ?? 1) !== removed)
        .map((e) => {
          const p = e.page ?? 1;
          return { ...e, isSelected: false, page: p > removed ? p - 1 : p };
        });
      return finalizeDocumentPages(shifted, { collapseEmpty: true });
    });
    setCurrentPage(Math.min(removed, pageCountRef.current - 1));
  }, [finalizeDocumentPages]);

  // Sidebar / gallery add handlers. Factories own default geometry and category
  // fields; these wrappers stamp a fresh id, the active page, and enter markers.
  // Bodies were dropped during the selection-drag split while return exports
  // stayed — that left "handleAddText is not defined" and crashed the editor.
  const handleAddText = useCallback(() => {
    const text = createTextElement({
      elementId: nanoid(),
      page: currentPageRef.current,
    });
    markElementsEnter(text.element_id);
    setA4_Elements((prev) => [...prev, text]);
  }, []);

  const handleAddLine = useCallback(() => {
    const line = createLineElement({
      elementId: nanoid(),
      page: currentPageRef.current,
    });
    markElementsEnter(line.element_id);
    setA4_Elements((prev) => [...prev, line]);
  }, []);

  const handleAddRectangle = useCallback(() => {
    const rectangle = createRectangleElement({
      elementId: nanoid(),
      page: currentPageRef.current,
    });
    markElementsEnter(rectangle.element_id);
    setA4_Elements((prev) => [...prev, rectangle]);
  }, []);

  const handleAddCircle = useCallback(() => {
    const circle = createCircleElement({
      elementId: nanoid(),
      page: currentPageRef.current,
    });
    markElementsEnter(circle.element_id);
    setA4_Elements((prev) => [...prev, circle]);
  }, []);

  const handleAddEllipse = useCallback(() => {
    const ellipse = createEllipseElement({
      elementId: nanoid(),
      page: currentPageRef.current,
    });
    markElementsEnter(ellipse.element_id);
    setA4_Elements((prev) => [...prev, ellipse]);
  }, []);

  const handleAddPolygon = useCallback((shape = "triangle") => {
    const polygon = createPolygonElement({
      elementId: nanoid(),
      page: currentPageRef.current,
      shape,
    });
    markElementsEnter(polygon.element_id);
    setA4_Elements((prev) => [...prev, polygon]);
  }, []);

  const handleAddPath = useCallback((pathKind = "wave") => {
    const path = createPathElement({
      elementId: nanoid(),
      page: currentPageRef.current,
      pathKind,
    });
    markElementsEnter(path.element_id);
    setA4_Elements((prev) => [...prev, path]);
  }, []);

  /**
   * Insert a library image onto the current page.
   *
   * GalleryItem passes `{ img_id, naturalWidth, naturalHeight }`. Persist a
   * stable `/images/{id}/content` URL — not a short-lived blob preview — so
   * save/export keep resolving after the gallery revokes object URLs.
   *
   * @param {{ img_id?: string|number, naturalWidth?: number, naturalHeight?: number, src?: string }|Event} payload
   */
  const handleAddImage = useCallback((payload) => {
    const imgId = payload?.img_id ?? payload?.target?.id ?? null;
    const naturalWidth = payload?.naturalWidth ?? payload?.target?.naturalWidth ?? 100;
    const naturalHeight = payload?.naturalHeight ?? payload?.target?.naturalHeight ?? 100;
    let src = payload?.src || "";
    if (!src && imgId != null && imgId !== "") {
      src = `${API_BASE_URL}${ENDPOINTS.IMG.CONTENT(imgId)}`;
    } else if (!src) {
      src = payload?.target?.src || "";
    }
    const image = createImageElement({
      elementId: nanoid(),
      src,
      imgId,
      naturalWidth,
      naturalHeight,
      page: currentPageRef.current,
    });
    markElementsEnter(image.element_id);
    setA4_Elements((prev) => [...prev, image]);
  }, []);

  const handleAddTextarea = useCallback(() => {
    const textarea = createTextareaElement({
      elementId: nanoid(),
      page: currentPageRef.current,
    });
    markElementsEnter(textarea.element_id);
    // New textarea is selected + editing — clear other selection so typing
    // does not apply to a previous multi-select group.
    setA4_Elements((prev) => [
      ...prev.map((el) => ({ ...el, isSelected: false, isEditing: false })),
      textarea,
    ]);
  }, []);

  /**
   * Add a new template-mode section (heading + chrome + body) in the active
   * rhythm. When `afterHeadingId` is set, the section is inserted immediately
   * below that section; otherwise it is appended at the end. Style is sampled
   * from the anchor section (or the last section when appending).
   *
   * Pass `lane: "sidebar"` (or an afterHeadingId that is a sidebar kicker) to
   * build and insert into the rail instead of the main column.
   *
   * @param {{
   *   name: string,
   *   layout: "aa"|"cc-edu"|"cc-exp"|"cc-sub",
   *   iconName?: string|null,
   *   afterHeadingId?: string|null,
   *   lane?: "main"|"sidebar"|null,
   * }} config
   */
  const handleAddSection = useCallback(({
    name,
    layout,
    iconName = null,
    afterHeadingId = null,
    lane = null,
  }) => {
    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const spacing = flowSpacingRef.current;
      const afterHeading = afterHeadingId
        ? prev.find((element) => element.element_id === afterHeadingId)
        : null;
      const intoSidebar = lane === "sidebar"
        || (afterHeading && isSidebarSectionHeading(afterHeading));
      const sections = intoSidebar
        ? listSidebarSections(prev, pageHeight)
        : listDocumentSections(prev, pageHeight);
      const afterIndex = afterHeadingId
        ? sections.findIndex((section) => section.headingId === afterHeadingId)
        : -1;
      let style = deriveSectionStyle(
        prev,
        pageHeight,
        afterIndex >= 0 ? afterHeadingId : null,
        { lane: intoSidebar ? "sidebar" : "main" },
      );
      // Icon-tagged templates: swap/inject the section-heading glyph chosen in
      // the Add Section gallery, keeping the sampled size and offset.
      style = applySelectedSectionIcon(style, prev, pageHeight, {
        templateId: activeTemplateId,
        iconName,
      });
      // Monument-style ordinals: insert after index i → new position i+1 →
      // ordinal i+2; append at end → one past every detected section.
      const sectionOrdinal = afterIndex >= 0
        ? afterIndex + 2
        : sections.length + 1;
      const { elements, firstBodyId } = buildSectionElements({
        name,
        layout,
        style,
        spacing,
        sectionOrdinal,
        idFactory: nanoid,
        lane: intoSidebar ? "sidebar" : "main",
      });
      const packOpts = {
        spacing,
        lane: intoSidebar ? "sidebar" : null,
      };
      const next = afterIndex >= 0
        ? insertSectionAfter(prev, elements, afterHeadingId, pageHeight, packOpts)
        : appendSectionAtEnd(prev, elements, pageHeight, packOpts);
      markElementsEnter(elements.map((element) => element.element_id));

      // Select + open the first body for editing; clear any prior selection so
      // typing does not apply to a previously selected element.
      const selected = next.map((element) => {
        if (element.element_id === firstBodyId) {
          return { ...element, isSelected: true, isEditing: true };
        }
        if (element.isSelected || element.isEditing) {
          return { ...element, isSelected: false, isEditing: false };
        }
        return element;
      });
      return finalizeDocumentPages(selected, { collapseEmpty: true });
    });
  }, [activeTemplateId, finalizeDocumentPages]);

  /**
   * Append one placeholder record inside an existing multi-line section
   * (education / experience structure). Used by the heading hover "+" control.
   *
   * @param {string} headingId
   */
  const handleAddSectionRecord = useCallback((headingId) => {
    if (!headingId) return;
    // Record append is a template-flow operation — freeform keeps free positioning.
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    let jumpToPage = null;
    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const spacing = flowSpacingRef.current;
      const result = appendRecordToSection(prev, headingId, pageHeight, {
        spacing,
        idFactory: nanoid,
      });
      if (!result) return prev;

      const { elements: next, firstBodyId } = result;
      // Do not mark canvas-enter for structural inserts: each page filters
      // elements, and a pack that moves new ids across pages can leave them
      // stuck at opacity 0 until the page remounts (page change / 2-page view).

      const packed = next.find((element) => element.element_id === firstBodyId);
      if (packed) {
        const page = Math.max(1, Math.trunc(Number(packed.page) || 1));
        if (page !== currentPageRef.current) jumpToPage = page;
      }

      const selected = next.map((element) => {
        if (element.element_id === firstBodyId) {
          return { ...element, isSelected: true, isEditing: true };
        }
        if (element.isSelected || element.isEditing) {
          return { ...element, isSelected: false, isEditing: false };
        }
        return element;
      });
      return finalizeDocumentPages(selected, { collapseEmpty: true });
    });
    if (jumpToPage != null) setCurrentPage(jumpToPage);
  }, [finalizeDocumentPages]);

  /**
   * Insert a full placeholder record (edu/exp shape with generic copy) below
   * the record that owns `afterElementId`. Used by the upper-line hover "+".
   *
   * @param {string} afterElementId
   */
  const handleAddRecordBlock = useCallback((afterElementId) => {
    if (!afterElementId) return;
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    let jumpToPage = null;
    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const spacing = flowSpacingRef.current;
      const result = insertRecordBlockAfterRecord(
        prev,
        afterElementId,
        pageHeight,
        { spacing, idFactory: nanoid },
      );
      if (!result) return prev;

      const { elements: next, firstBodyId } = result;
      // Immediate paint — see handleAddSectionRecord (no canvas-enter hold).

      const packed = next.find((element) => element.element_id === firstBodyId);
      if (packed) {
        const page = Math.max(1, Math.trunc(Number(packed.page) || 1));
        if (page !== currentPageRef.current) jumpToPage = page;
      }

      const selected = next.map((element) => {
        if (element.element_id === firstBodyId) {
          return { ...element, isSelected: true, isEditing: true };
        }
        if (element.isSelected || element.isEditing) {
          return { ...element, isSelected: false, isEditing: false };
        }
        return element;
      });
      return finalizeDocumentPages(selected, { collapseEmpty: true });
    });
    if (jumpToPage != null) setCurrentPage(jumpToPage);
  }, [finalizeDocumentPages]);

  /**
   * Queue removed canvas elements for autosave tombstones (same contract as
   * bulk selection delete).
   *
   * @param {object[]} previousElements
   * @param {Set<string>} removedIds
   */
  const rememberDeletedElements = useCallback((previousElements, removedIds) => {
    if (!removedIds || removedIds.size === 0) return;
    const removedElements = previousElements.filter((element) => (
      removedIds.has(element.element_id)
    ));
    if (removedElements.length === 0) return;

    setA4_Elements_deleted((previousDeleted) => {
      const additions = removedElements.filter((element) => (
        !previousDeleted.some((deleted) => (
          deleted.element_id === element.element_id && deleted.pdf_id !== undefined
        ))
      )).map((element) => ({ ...element, deleted: true }));
      return additions.length ? [...previousDeleted, ...additions] : previousDeleted;
    });
  }, []);

  /**
   * Delete a whole template-mode section from the heading hover trash, then
   * re-pack remaining sections so the canvas closes the hole under rhythm.
   *
   * @param {string} headingId
   */
  const handleRemoveSection = useCallback((headingId) => {
    if (!headingId) return;
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const result = removeSection(prev, headingId, pageHeight, {
        spacing: flowSpacingRef.current,
      });
      if (!result) return prev;

      rememberDeletedElements(prev, result.removedIds);
      // Collapse empty trailing pages after packing pulls content upward.
      return finalizeDocumentPages(result.elements, { collapseEmpty: true });
    });
  }, [rememberDeletedElements, finalizeDocumentPages]);

  /**
   * Delete one multi-line record from the upper-line hover trash, then re-pack
   * so sibling records and later sections close the gap.
   *
   * @param {string} elementId
   */
  const handleRemoveRecordBlock = useCallback((elementId) => {
    if (!elementId) return;
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const result = removeRecordBlock(prev, elementId, pageHeight, {
        spacing: flowSpacingRef.current,
      });
      if (!result) return prev;

      rememberDeletedElements(prev, result.removedIds);
      return finalizeDocumentPages(result.elements, { collapseEmpty: true });
    });
  }, [rememberDeletedElements, finalizeDocumentPages]);

  /**
   * Move a multi-line record up/down via the hover arrows, then re-pack so the
   * section keeps template rhythm.
   *
   * @param {string} elementId
   * @param {"up"|"down"} direction
   */
  const handleReorderRecordBlock = useCallback((elementId, direction) => {
    if (!elementId) return;
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const result = reorderRecordBlock(
        prev,
        elementId,
        direction,
        pageHeight,
        { spacing: flowSpacingRef.current },
      );
      if (!result) return prev;
      return finalizeDocumentPages(result.elements, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  /**
   * Move a whole template-mode section up/down via the heading hover arrows,
   * then re-pack so later sections keep template rhythm.
   *
   * @param {string} headingId
   * @param {"up"|"down"} direction
   */
  const handleReorderSection = useCallback((headingId, direction) => {
    if (!headingId) return;
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const next = reorderSection(
        prev,
        headingId,
        direction,
        pageHeight,
        { spacing: flowSpacingRef.current },
      );
      if (!next) return prev;
      return finalizeDocumentPages(next, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  /**
   * Move a template-mode section between the main column and the sidebar rail.
   * Restyles members for the destination lane, appends last in that column,
   * and re-packs under the live flow spacing (standard or custom).
   *
   * @param {string} headingId
   */
  const handleTransferSectionLane = useCallback((headingId) => {
    if (!headingId) return;
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const next = transferSectionLane(
        prev,
        headingId,
        pageHeight,
        flowSpacingRef.current,
      );
      if (!next) return prev;
      return finalizeDocumentPages(next, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  /**
   * Switch a main-column Skills section (flat or with subcategories) between
   * the inline mid-dot row, a bullet list, or wrapped chip pills, in place.
   *
   * @param {string} headingId
   * @param {"inline"|"bullet"|"chips"} mode
   */
  const handleChangeSkillsDisplayMode = useCallback((headingId, mode) => {
    if (!headingId) return;
    if (editorModeRef.current !== EDITOR_MODE_TEMPLATE) return;

    setA4_Elements((prev) => {
      const pageHeight = pageSizeRef.current?.height ?? 842;
      const next = changeSkillsDisplayMode(
        prev,
        headingId,
        mode,
        pageHeight,
        flowSpacingRef.current,
        activeTemplateIdRef.current,
      );
      if (!next) return prev;
      return finalizeDocumentPages(next, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  const handleSetTextareaEditing = useCallback((elementId, editing) => {
    setA4_Elements(prevState => prevState.map(el => {
      if (el.element_id === elementId) {
        return { ...el, isEditing: editing, isSelected: true };
      }
      // A directly edited text element becomes the sole active element; this
      // prevents a bulk selection from remaining active while typing content.
      return editing
        ? { ...el, isSelected: false, isEditing: ["textarea", "text"].includes(el.category) ? false : el.isEditing }
        : (["textarea", "text"].includes(el.category) ? { ...el, isEditing: false } : el);
    }));
  }, [])

  
  // Clone the selected element: same size/text/colors/font/page, new id,
  // nudged 15px down-right so the copy is visibly distinct, then selected.
  // Template mode uses section/record affordances — panel clone is disabled.
  const handleDuplicateElement = useCallback((elementId) => {
    if (!canCloneOrDeleteElements(editorModeRef.current)) return;
    setA4_Elements(prevState => {
      const original = prevState.find(el => el.element_id === elementId);
      if (!original || isDecorativeChrome(original)) return prevState;

      const { width: A4_WIDTH, height: A4_HEIGHT } = pageSizeRef.current;
      const OFFSET = 15;
      const w = parseFloat(original.width) || 0;
      const h = parseFloat(original.height) || 0;
      const left = Math.max(0, Math.min(original.left + OFFSET, A4_WIDTH - (w || 10)));
      const top = Math.max(0, Math.min(original.top + OFFSET, A4_HEIGHT - (h || 10)));

      const copy = {
        ...original,            // carries width/height/content/color/font/lineHeight/letterSpacing/src/img_id/backgroundColor/zIndex/page
        element_id: nanoid(),
        left,
        top,
        isSelected: true,       // copy becomes the active element
        isMove: false,
        isEditing: false,       // textarea copies render as a block, not in edit mode
      };

      markElementsEnter(copy.element_id);
      // Deselect everything else; the new copy is the only selected element.
      return [...prevState.map(el => ({ ...el, isSelected: false })), copy];
    });
  }, []);

  // Clone the entire current selection as one group. Connectors explicitly
  // selected by the user — plus connectors whose two endpoints are in the
  // group — are copied with their endpoints re-linked to the clones.
  // Template mode uses section/record affordances — panel clone is disabled.
  const handleDuplicateSelectedElements = useCallback(() => {
    if (!canCloneOrDeleteElements(editorModeRef.current)) return;
    setA4_Elements((prevState) => {
      const selected = prevState.filter((element) => (
        element.isSelected && !isDecorativeChrome(element)
      ));
      if (selected.length === 0) return prevState;

      const idMap = {};
      const copiedElements = selected
        .filter((element) => element.category !== "connector")
        .map((element) => {
          const elementId = nanoid();
          idMap[element.element_id] = elementId;
          return {
            ...element,
            element_id: elementId,
            isSelected: true,
            isMove: false,
            isEditing: false,
          };
        });

      const copiedConnectors = prevState
        .filter((element) => (
          element.category === "connector"
          && (
            element.isSelected
            || (idMap[element.source_id] && idMap[element.target_id])
          )
        ))
        .map((element) => ({
          ...element,
          element_id: nanoid(),
          source_id: idMap[element.source_id] ?? element.source_id,
          target_id: idMap[element.target_id] ?? element.target_id,
          isSelected: true,
          isMove: false,
          isEditing: false,
        }));

      const copies = [...copiedElements, ...copiedConnectors];
      const copiedIds = new Set(copies.map((element) => element.element_id));
      const offsetCopies = moveElementsByDelta(
        copies,
        copiedIds,
        15,
        15,
        pageSizeRef.current,
      );

      markElementsEnter(offsetCopies.map((element) => element.element_id));
      return [
        ...prevState.map((element) => ({
          ...element,
          isSelected: false,
          isMove: false,
          isEditing: element.category === "textarea" ? false : element.isEditing,
        })),
        ...offsetCopies,
      ];
    });
  }, []);

  // Single-element delete from the floating inspector. Template mode deletes
  // whole sections/records via canvas trash instead of orphaning one line.
  const handleDeleteElement = useCallback((elementId) => {
    if (!canCloneOrDeleteElements(editorModeRef.current)) return;
    setA4_Elements(prevState => {
      const target = prevState.find((element) => element.element_id === elementId);
      if (!target || isDecorativeChrome(target)) return prevState;

      // Remove the element plus any connector attached to it (no dangling lines).
      const removedIds = new Set([elementId]);
      prevState.forEach(el => {
        if (el.category === "connector" && (el.source_id === elementId || el.target_id === elementId)) {
          removedIds.add(el.element_id);
        }
      });

      removedIds.forEach(id => {
        const el = prevState.find(e => e.element_id === id);
        if (el) {
          setA4_Elements_deleted(prev =>
            prev.some(e => e.element_id === id && e.pdf_id !== undefined)
              ? prev : [...prev, { ...el, deleted: true }]
          );
        }
      });

      const remaining = prevState.filter(element => !removedIds.has(element.element_id));
      // Drop chrome-only trailing pages when the last content on page N is gone.
      return finalizeDocumentPages(remaining, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  const handleDeleteSelectedElements = useCallback(() => {
    if (!canCloneOrDeleteElements(editorModeRef.current)) return;
    setA4_Elements((prevState) => {
      const removedIds = new Set(
        prevState
          .filter((element) => element.isSelected && !isDecorativeChrome(element))
          .map((element) => element.element_id)
      );
      if (removedIds.size === 0) return prevState;

      // A connector cannot survive when either end of its line has gone.
      prevState.forEach((element) => {
        if (
          element.category === "connector"
          && (removedIds.has(element.source_id) || removedIds.has(element.target_id))
        ) {
          removedIds.add(element.element_id);
        }
      });

      const removedElements = prevState.filter((element) => removedIds.has(element.element_id));
      setA4_Elements_deleted((previousDeleted) => {
        const additions = removedElements.filter((element) => (
          !previousDeleted.some((deleted) => (
            deleted.element_id === element.element_id && deleted.pdf_id !== undefined
          ))
        )).map((element) => ({ ...element, deleted: true }));

        return additions.length ? [...previousDeleted, ...additions] : previousDeleted;
      });

      const remaining = prevState.filter((element) => !removedIds.has(element.element_id));
      return finalizeDocumentPages(remaining, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  // Applies an AI-proposed deletion only after the reviewed card is accepted.
  // Keep fixed artwork and locked elements protected even if the client has
  // stale or malformed response data.
  const applyDeleteOperation = useCallback((group) => {
    const targetIds = group?.remove_element_ids;
    if (
      !Array.isArray(targetIds)
      || targetIds.length === 0
      || targetIds.length > 80
      || targetIds.some((elementId) => typeof elementId !== "string" || !elementId)
      || new Set(targetIds).size !== targetIds.length
    ) return;

    setA4_Elements((prevState) => {
      const byId = new Map(prevState.map((element) => [element.element_id, element]));
      const targets = targetIds.map((elementId) => byId.get(elementId));
      if (
        targets.some((element) => (
          !element
          || element.locked
          || element.fixedToPage
          || element.category === "connector"
        ))
      ) return prevState;

      const removedIds = new Set(targetIds);
      prevState.forEach((element) => {
        if (
          element.category === "connector"
          && (removedIds.has(element.source_id) || removedIds.has(element.target_id))
        ) {
          removedIds.add(element.element_id);
        }
      });
      const removedElements = prevState.filter((element) => removedIds.has(element.element_id));
      setA4_Elements_deleted((previousDeleted) => {
        const additions = removedElements
          .filter((element) => !previousDeleted.some((deleted) => (
            deleted.element_id === element.element_id && deleted.pdf_id !== undefined
          )))
          .map((element) => ({ ...element, deleted: true }));
        return additions.length ? [...previousDeleted, ...additions] : previousDeleted;
      });

      const remaining = prevState.filter((element) => !removedIds.has(element.element_id));
      return finalizeDocumentPages(remaining, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  // Measure a contact label's rendered width with the canvas font so the client
  // band layout wraps/centres exactly as the user sees it. Returns null when no
  // DOM canvas is available (SSR/tests) so the engine uses its deterministic
  // charWidth fallback (matching the backend estimate). Defined above
  // `handleEditElementValues` because the live-reflow path below references it.
  const contactMeasureCtxRef = useRef(null);
  const measureContactLabel = useCallback((text, fontFamily, fontSizePt) => {
    if (typeof document === "undefined") return null;
    if (!contactMeasureCtxRef.current) {
      contactMeasureCtxRef.current = document.createElement("canvas").getContext("2d");
    }
    const ctx = contactMeasureCtxRef.current;
    if (!ctx) return null;
    ctx.font = `${fontSizePt}px ${canvasFontFamily(fontFamily)}`;
    return ctx.measureText(String(text)).width;
  }, []);

  const handleEditElementValues = useCallback((dataObject, id) => {
    setA4_Elements(prevState => {
      const newState = prevState.map((element) => {
        if (element.element_id === id) {
          if (
            element.locked
            && ("left" in dataObject || "top" in dataObject || "page" in dataObject)
          ) {
            return element;
          }
          const next = { ...element, ...dataObject };
          if ("content" in dataObject) {
            next.content = sanitizeTextContent(dataObject.content);
            // Inline `runs` are addressed by character offset, so any content
            // change that does not carry its own runs (AI correction, bullet
            // toggle, properties-panel edit) would leave stale offsets. Clear
            // them here. The inline editors always send content AND runs
            // together, so live formatting is never dropped by this rule.
            if (!("runs" in dataObject)) {
              next.runs = null;
            }
          }
          return next;
        } else {
          return element;
        }
      });
      // A live edit of a contact label changes its width, so the band must
      // re-space (constant inter-item gap) and downstream flow shift by Δ. Only
      // label content edits trigger this; position-only edits are left alone.
      if ("content" in dataObject) {
        const edited = newState.find((el) => el.element_id === id);
        if (edited?.contactBandId && edited?.contactChannel && edited.category === "text") {
          return applyChannelRelayout(
            newState, edited.contactBandId, measureContactLabel, () => nanoid(),
          ).elements;
        }
        if (edited?.mastheadRole === "title" && edited.mastheadBandId) {
          const measured = measureContactLabel(
            edited.content,
            edited.fontFamily,
            edited.fontSize,
          );
          return newState.map((element) => {
            if (
              element.mastheadBandId !== edited.mastheadBandId
              || element.mastheadRole !== "title-decoration"
              || !element.titleDecoration
            ) {
              return element;
            }
            const decoration = element.titleDecoration;
            const letterSpacing = Number(edited.letterSpacing) || 0;
            const textWidth = measured ?? String(edited.content || "").length * 5.4;
            const naturalWidth = textWidth
              + Math.max(0, String(edited.content || "").length - 1) * letterSpacing
              // Canvas metrics can be a few pixels narrower than the loaded
              // webfont. Reserve a final 16 px so the white title never
              // reaches the coloured bar's right edge while editing.
              + (Number(decoration.horizontalPadding) || 0)
              + 16;
            const minWidth = Number(decoration.minWidth) || 0;
            const maxWidth = Number(decoration.maxWidth) || naturalWidth;
            return {
              ...element,
              width: Math.max(minWidth, Math.min(maxWidth, naturalWidth)),
            };
          });
        }
        if (
          edited?.autoHeight
          && String(edited.content ?? "").trim() === ""
        ) {
          // Clearing an auto-height block is a real layout change, including
          // AI "Skróć CV" patches. Collapse it immediately instead of waiting
          // for an off-page textarea to mount and report a scroll height.
          const result = reflowTextareaHeight(
            newState,
            id,
            0,
            pageSizeRef.current.height,
            {
              pageTop: 66,
              bottomMargin: 72,
              allowReclaim: editorModeRef.current === EDITOR_MODE_TEMPLATE,
              spacing: flowSpacingRef.current,
            },
          );
          if (result.changed) {
            return finalizeDocumentPages(result.elements, { collapseEmpty: true });
          }
        }
      }
      if ("page" in dataObject) {
        return finalizeDocumentPages(newState, { collapseEmpty: true });
      }
      return newState;
    });
  }, [finalizeDocumentPages, measureContactLabel]);

  // Applies a shared set of editable fields to every selected element. The
  // editor only exposes fields present on the entire selection, so this does
  // not introduce properties incompatible with an element category.
  const handleEditSelectedElementValues = useCallback((dataObject) => {
    setA4_Elements((prevState) => {
      const next = prevState.map((element) => {
        if (!element.isSelected) return element;
        if (
          element.locked
          && ("left" in dataObject || "top" in dataObject || "page" in dataObject)
        ) {
          return element;
        }
        if (element.category === "circle" && ("width" in dataObject || "height" in dataObject)) {
          const diameter = dataObject.width ?? dataObject.height;
          return { ...element, ...dataObject, width: diameter, height: diameter };
        }
        return { ...element, ...dataObject };
      });
      if ("page" in dataObject) {
        return finalizeDocumentPages(next, { collapseEmpty: true });
      }
      return next;
    });
  }, [finalizeDocumentPages]);

  // The canvas is the typography authority: after a template textarea has
  // rendered, its measured content height replaces the authored placeholder
  // height and every later element in the same visual lane keeps its gap.
  //
  // `quiet` controls whether this reflow becomes its own Undo step:
  // - A background measure (mount / font-ready / load settle) passes quiet=true
  //   so the height correction merges into the current tip instead of adding a
  //   spurious undo step for a change the user never made.
  // - A user typing/formatting commit passes quiet=false. The content edit that
  //   preceded it must land as a real, undoable step; quieting it here would
  //   overwrite the pre-edit tip in place, which made typed textarea changes
  //   impossible to undo.
  // Skip while canvas enter is holding opacity at 0 — fallback-font measures
  // during that window were collapsing whole CV layouts on load.
  const handleFitTextareaToContent = useCallback((elementId, measuredHeight, { quiet = true } = {}) => {
    if (isCanvasEnterReflowSuppressed()) return;
    if (quiet) markHistoryQuiet();
    setA4_Elements((prevState) => {
      const result = reflowTextareaHeight(
        prevState,
        elementId,
        measuredHeight,
        pageSizeRef.current.height,
        // Framed classic/sidebar CVs reserve ~66px top and keep clear of the
        // footer rule near y=783 (bottomMargin 72 → content bottom 770). Keep
        // in sync with backend CONTENT_BOTTOM / MARGIN_BOTTOM.
        // Freeform projects skip reclaim so hand-tuned page placement stays put.
        {
          pageTop: 66,
          bottomMargin: 72,
          allowReclaim: editorModeRef.current === EDITOR_MODE_TEMPLATE,
          spacing: flowSpacingRef.current,
        },
      );
      if (!result.changed) return prevState;

      // Overflow onto a new page must clone template chrome; reclaim that
      // empties page 2 must drop the orphaned decorations.
      return finalizeDocumentPages(result.elements, { collapseEmpty: true });
    });
  }, [markHistoryQuiet, finalizeDocumentPages]);

  /**
   * After AI content patches, move leftover main-column sections onto the
   * sidebar when that restyle (measured at rail width) drops a page.
   * Experience stays in the main column.
   */
  const handleCollapseSpilledMainIntoSidebar = useCallback(() => {
    setA4_Elements((prev) => {
      const collapsed = collapseSpilledMainIntoSidebar(prev, {
        pageHeight: pageSizeRef.current.height,
        spacing: flowSpacingRef.current,
      });
      if (collapsed === prev) return prev;
      return finalizeDocumentPages(collapsed, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  // Applies one reviewed layout group as a single state change. The backend
  // already validates proposals, but this client-side guard prevents stale or
  // malformed responses from moving elements outside the current canvas.
  const applyLayoutPatches = useCallback((patches) => {
    if (!Array.isArray(patches) || patches.length === 0) return;

    const uniqueIds = new Set();
    for (const patch of patches) {
      if (
        !patch?.element_id
        || uniqueIds.has(patch.element_id)
        || !Number.isFinite(patch.left)
        || !Number.isFinite(patch.top)
        || (
          patch.width !== undefined
          && (!Number.isFinite(patch.width) || patch.width <= 0)
        )
        || (
          patch.height !== undefined
          && (!Number.isFinite(patch.height) || patch.height <= 0)
        )
        || (
          patch.page !== undefined
          && (!Number.isInteger(patch.page) || patch.page < 1)
        )
      ) {
        return;
      }
      uniqueIds.add(patch.element_id);
    }

    setA4_Elements(prevState => {
      const elementsById = new Map(prevState.map(element => [element.element_id, element]));
      if ([...uniqueIds].some(elementId => !elementsById.has(elementId))) return prevState;
      if ([...uniqueIds].some(elementId => elementsById.get(elementId)?.locked)) return prevState;

      const { width: pageWidth, height: pageHeight } = pageSizeRef.current;
      const patchById = new Map(patches.map(patch => [patch.element_id, patch]));
      const isSafe = patches.every(patch => {
        const element = elementsById.get(patch.element_id);
        const width = Math.max(
          Number.isFinite(patch.width) ? patch.width : parseFloat(element.width) || 0,
          0
        );
        const height = Math.max(
          Number.isFinite(patch.height)
            ? patch.height
            : parseFloat(element.height) || (element.category === "text" ? (element.fontSize || 12) * 1.35 : 0),
          0
        );
        return (
          patch.left >= 0
          && patch.top >= 0
          && patch.left + width <= pageWidth
          && patch.top + height <= pageHeight
        );
      });
      if (!isSafe) return prevState;

      const movedElements = prevState.map(element => {
        const patch = patchById.get(element.element_id);
        return patch
          ? {
              ...element,
              left: patch.left,
              top: patch.top,
              ...(Number.isFinite(patch.width) ? { width: patch.width } : {}),
              ...(Number.isFinite(patch.height) ? { height: patch.height } : {}),
              page: patch.page ?? element.page ?? 1,
              isSelected: false,
              isMove: false,
              isEditing: false,
            }
          : element;
      });
      const movedById = new Map(movedElements.map(element => [element.element_id, element]));
      const nextElements = movedElements.map(element => {
        if (element.category !== "connector") return element;
        const source = movedById.get(element.source_id);
        const target = movedById.get(element.target_id);
        if (!source || !target || (source.page ?? 1) !== (target.page ?? 1)) return element;
        return { ...element, page: source.page ?? 1 };
      });

      const targetPages = patches
        .map(patch => patch.page)
        .filter(Number.isInteger);
      layoutTargetPageRef.current = targetPages.length > 0 ? Math.max(...targetPages) : null;
      return finalizeDocumentPages(nextElements, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  // Applies one reviewed section restructure atomically. The backend owns the
  // proposed geometry; the client validates it again, records removals for
  // autosave, and creates any fixed page decorations needed by overflow.
  // Additive-only clone apply for AI assistant (no removals). Supports the
  // same visual categories the backend may copy from an existing source.
  const applyCloneOperation = useCallback((group) => {
    const additions = group?.add_elements;
    if (!Array.isArray(additions) || additions.length === 0) return;

    const additionIds = new Set();
    const allowedCategories = new Set([
      "text", "textarea", "line", "rectangle", "circle", "ellipse", "image",
    ]);
    const additionsAreSafe = additions.every((spec) => (
      spec
      && typeof spec.element_id === "string"
      && !additionIds.has(spec.element_id)
      && allowedCategories.has(spec.category)
      && Number.isFinite(spec.left)
      && Number.isFinite(spec.top)
      && Number.isFinite(spec.width)
      && Number.isFinite(spec.height)
      && Number.isInteger(spec.page)
      && spec.page > 0
      && spec.left >= 0
      && spec.top >= 0
      && spec.width > 0
      && spec.height > 0
      && (additionIds.add(spec.element_id) || true)
    ));
    if (!additionsAreSafe) return;

    setA4_Elements((prevState) => {
      const existingIds = new Set(prevState.map((element) => element.element_id));
      if (additions.some((addition) => existingIds.has(addition.element_id))) return prevState;

      const { width: pageWidth, height: pageHeight } = pageSizeRef.current;
      const geometryIsSafe = additions.every((item) => (
        item.left + item.width <= pageWidth && item.top + item.height <= pageHeight
      ));
      if (!geometryIsSafe) return prevState;

      const normalizedAdditions = additions.map((spec) => ({
        ...spec,
        isSelected: false,
        isMove: false,
        isEditing: false,
        locked: false,
        fixedToPage: false,
        page: spec.page ?? 1,
      }));

      const documentElements = [
        ...prevState.map((element) => ({
          ...element,
          isSelected: false,
          isMove: false,
          isEditing: false,
        })),
        ...normalizedAdditions,
      ];
      // Content only — cloned page chrome must appear instantly.
      markContentElementsEnter(normalizedAdditions);
      layoutTargetPageRef.current = normalizedAdditions[0]?.page ?? null;
      return finalizeDocumentPages(documentElements, { collapseEmpty: true });
    });
  }, [finalizeDocumentPages]);

  const applyStructureOperation = useCallback((group) => {
    const removeIds = group?.remove_element_ids;
    const additions = group?.add_elements;
    const patches = group?.patches || [];
    if (
      !Array.isArray(removeIds)
      || removeIds.length !== 1
      || !Array.isArray(additions)
      || additions.length === 0
      || !Array.isArray(patches)
    ) return;

    const sourceId = removeIds[0];
    const additionIds = new Set();
    const allowedCategories = new Set(["text", "textarea", "line"]);
    const additionsAreSafe = additions.every((spec) => (
      spec
      && typeof spec.element_id === "string"
      && !additionIds.has(spec.element_id)
      && allowedCategories.has(spec.category)
      && Number.isFinite(spec.left)
      && Number.isFinite(spec.top)
      && Number.isFinite(spec.width)
      && Number.isFinite(spec.height)
      && Number.isInteger(spec.page)
      && spec.page > 0
      && spec.left >= 0
      && spec.top >= 0
      && spec.width > 0
      && spec.height > 0
      && (spec.category === "line" || typeof spec.content === "string")
      && (additionIds.add(spec.element_id) || true)
    ));
    if (!additionsAreSafe) return;

    const patchIds = new Set();
    const patchesAreSafe = patches.every((patch) => (
      patch
      && typeof patch.element_id === "string"
      && !patchIds.has(patch.element_id)
      && Number.isFinite(patch.left)
      && Number.isFinite(patch.top)
      && Number.isInteger(patch.page)
      && patch.page > 0
      && patch.left >= 0
      && patch.top >= 0
      && (patchIds.add(patch.element_id) || true)
    ));
    if (!patchesAreSafe) return;

    setA4_Elements((prevState) => {
      const byId = new Map(prevState.map((element) => [element.element_id, element]));
      const source = byId.get(sourceId);
      if (
        !source
        || source.locked
        || source.fixedToPage
        || !["text", "textarea"].includes(source.category)
        || additions.some((addition) => byId.has(addition.element_id))
        || patches.some((patch) => !byId.has(patch.element_id) || byId.get(patch.element_id)?.locked)
      ) return prevState;

      const { width: pageWidth, height: pageHeight } = pageSizeRef.current;
      const geometryIsSafe = [...additions, ...patches].every((item) => {
        const existing = byId.get(item.element_id);
        const width = Number.isFinite(item.width) ? item.width : Number(existing?.width) || 0;
        const height = Number.isFinite(item.height)
          ? item.height
          : Number(existing?.height) || (existing?.category === "text" ? Number(existing.fontSize || 12) * 1.35 : 0);
        return item.left + width <= pageWidth && item.top + height <= pageHeight;
      });
      if (!geometryIsSafe) return prevState;

      const removedIds = new Set([sourceId]);
      prevState.forEach((element) => {
        if (
          element.category === "connector"
          && (element.source_id === sourceId || element.target_id === sourceId)
        ) removedIds.add(element.element_id);
      });
      const removedElements = prevState.filter((element) => removedIds.has(element.element_id));
      setA4_Elements_deleted((previousDeleted) => {
        const newlyDeleted = removedElements
          .filter((element) => !previousDeleted.some((deleted) => (
            deleted.element_id === element.element_id && deleted.pdf_id !== undefined
          )))
          .map((element) => ({ ...element, deleted: true }));
        return newlyDeleted.length ? [...previousDeleted, ...newlyDeleted] : previousDeleted;
      });

      const patchesById = new Map(patches.map((patch) => [patch.element_id, patch]));
      const moved = prevState
        .filter((element) => !removedIds.has(element.element_id))
        .map((element) => {
          const patch = patchesById.get(element.element_id);
          if (!patch) return { ...element, isSelected: false, isMove: false, isEditing: false };
          return {
            ...element,
            left: patch.left,
            top: patch.top,
            page: patch.page,
            isSelected: false,
            isMove: false,
            isEditing: false,
          };
        });
      const normalizedAdditions = additions.map((spec) => ({
        ...spec,
        isSelected: false,
        isMove: false,
        isEditing: false,
        locked: false,
        page: spec.page ?? 1,
      }));

      const documentElements = [...moved, ...normalizedAdditions];
      const withPages = finalizeDocumentPages(documentElements, {
        minPageCount: group.page_count || 1,
        collapseEmpty: true,
      });
      const byNewId = new Map(withPages.map((element) => [element.element_id, element]));
      const reconciled = withPages.map((element) => {
        if (element.category !== "connector") return element;
        const connectorSource = byNewId.get(element.source_id);
        const connectorTarget = byNewId.get(element.target_id);
        if (!connectorSource || !connectorTarget || (connectorSource.page ?? 1) !== (connectorTarget.page ?? 1)) {
          return element;
        }
        return { ...element, page: connectorSource.page ?? 1 };
      });
      markContentElementsEnter(normalizedAdditions);
      layoutTargetPageRef.current = normalizedAdditions[0]?.page ?? null;
      return reconciled;
    });
  }, [finalizeDocumentPages]);

  const handleAlignElements = useCallback((elementId, position, width, category) => {
    const target = elementsRef.current.find((element) => element.element_id === elementId);
    if (target?.locked) return;
    if (!canFreePositionElement(target, editorModeRef.current)) return;
    if (category === "text") {
      const widthText = document.getElementById(elementId).clientWidth;
      width = widthText;
    }
    if (position === "LEFT") {
      setA4_Elements(prevState => {
        const newState = prevState.map((element) => (
          element.element_id === elementId ? { ...element, left: 0 } : { ...element }
        ))
        return newState;
      })
    }
    else if (position === "CENTER") {
      setA4_Elements(prevState => {
        const newState = prevState.map((element) => {
          if (element.element_id === elementId) {
            return { ...element, left: (pageSizeRef.current.width - width) / 2 };
          }
          else {
            return { ...element };
          }
        })
        return newState;
      })
    }
    else {
      setA4_Elements(prevState => {
        const newState = prevState.map((element) => {
          if (element.element_id === elementId) {
            return { ...element, left: pageSizeRef.current.width - width - 1 };
          }
          else {
            return { ...element };
          }
        })
        return newState;
      })
    }
  }, [])

  const PDFTitle = useCallback((title) => {
    setA4_Elements(prevState => {
      return [...prevState, { title }]
    });
  }, [])


  const handleResizeElement = useCallback((e, direction, category, elementId, elementRef) => {
    const resizedElement = elementsRef.current.find((element) => element.element_id === elementId);
    if (resizedElement?.locked) return;
    // Structural editing never drag-resizes — width/height stay layout-owned.
    if (!canResizeElement(resizedElement, editorModeRef.current)) return;

    let aspectRatio = 1;
    let heightFactor;
    if (category === "image" && elementRef?.current) {
      aspectRatio = elementRef.current.naturalHeight / elementRef.current.naturalWidth;
    }

    const A4_COORDS = canvasForPage(resizedElement?.page ?? 1)?.getBoundingClientRect();
    if (!A4_COORDS) return;

    const { width: A4_WIDTH, height: A4_HEIGHT } = pageSizeRef.current;
    const MIN_WIDTH = 10;
    const MIN_HEIGHT = 10;

    // Under canvas zoom, a screen-pixel drag covers fewer canvas units. The
    // rect is the scaled A4, so rect.width / pageWidth is exactly the zoom
    // factor.
    const zoom = A4_COORDS.width / A4_WIDTH || 1;
    const moveX = e.movementX / zoom;
    const moveY = e.movementY / zoom;

    setA4_Elements((prevState) => {
      const newState = prevState.map((element) => {
        // Text boxes: only width follows the drag (horizontal component).
        // Height always derives from content at the current width, never
        // from the drag itself — see measureTextareaHeight.
        if (category === "textarea") {
          if (element.element_id !== elementId) {
            return { ...element, isSelected: false };
          }
          let w = element.width;
          let l = element.left;
          const MIN_W = 40;
          if (direction === "bottom-right" || direction === "top-right" || direction === "center-right") { w += moveX; }
          else if (direction === "bottom-left" || direction === "top-left" || direction === "center-left") { w -= moveX; l += moveX; }
          if (l < 0) { w += l; l = 0; }
          w = Math.max(MIN_W, Math.min(A4_WIDTH - l, w));
          // Auto-height template fields are measured by the rendered canvas
          // after this width update. Keeping the previous height here lets the
          // shared reflow apply the full, exact delta once.
          if (element.autoHeight) {
            return { ...element, width: w, left: l };
          }
          const h = measureTextareaHeight(element.content, w, element.fontSize, element.lineHeight);
          return { ...element, width: w, height: h, left: l };
        }
        if (category === "image") {
          heightFactor = element.width
        } else {
          heightFactor = element.height
        }
        if (direction === "top-left") {
          if (element.element_id === elementId) {

            return {
              ...element,
              width: element.width - moveX,
              height: Math.round((heightFactor - moveX) * aspectRatio),
              left: element.left + moveX,
              top: element.top + (element.height - Math.round((heightFactor - moveX) * aspectRatio))
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }
        if (direction === "bottom-right") {

          let newWidth = element.width + moveX;
          let newHeight = Math.round((heightFactor + moveX) * aspectRatio);
          let newLeft = element.left;
          let newTop = element.top;
          newWidth = Math.max(MIN_WIDTH, Math.min(A4_WIDTH - element.left, newWidth));
          newHeight = Math.max(MIN_HEIGHT, Math.min(A4_HEIGHT - element.top, newHeight));

          if (element.element_id === elementId) {
            return {
              ...element,
              width: newWidth,
              height: newHeight,
              left: newLeft,
              top: newTop
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "bottom-left") {
          if (element.element_id === elementId) {
            return {
              ...element,
              width: element.width - moveX,
              height: Math.round((heightFactor - moveX) * aspectRatio),
              left: element.left + moveX,

            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "top-right") {
          if (element.element_id === elementId) {
            return {
              ...element,
              width: element.width + moveX,
              height: Math.round((heightFactor + moveX) * aspectRatio),
              left: element.left,
              top: element.top + (element.height - Math.round((heightFactor + moveX) * aspectRatio))
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "center-right") {
          if (element.element_id === elementId) {
            const proposedWidth = element.width + moveX;
            const newWidth = Math.max(MIN_WIDTH, Math.min(A4_WIDTH - element.left, proposedWidth));
            if (category === "circle") {
              const size = Math.max(
                MIN_WIDTH,
                Math.min(A4_WIDTH - element.left, A4_HEIGHT - element.top, newWidth),
              );
              return { ...element, width: size, height: size, left: element.left };
            }
            return {
              ...element,
              width: newWidth,
              left: element.left,
            };
          }
          return { ...element, isSelected: false };
        }

        if (direction === "center-left") {
          const rightEdge = element.left + element.width;
          const proposedLeft = element.left + moveX;
          const newLeft = Math.max(0, Math.min(rightEdge - MIN_WIDTH, proposedLeft));
          const newWidth = rightEdge - newLeft;

          if (element.element_id === elementId) {
            if (category === "circle") {
              const size = Math.max(
                MIN_WIDTH,
                Math.min(rightEdge, A4_HEIGHT - element.top, newWidth),
              );
              return {
                ...element,
                width: size,
                height: size,
                left: rightEdge - size,
              };
            }
            return {
              ...element,
              width: newWidth,
              left: newLeft,
            };
          }
          return { ...element, isSelected: false };
        }

        if (direction === "center-bottom") {
          if (element.element_id === elementId) {
            const proposedHeight = Number(element.height) + moveY;
            const newHeight = Math.max(
              MIN_HEIGHT,
              Math.min(A4_HEIGHT - Number(element.top), proposedHeight),
            );
            if (category === "circle") {
              const size = Math.max(
                MIN_HEIGHT,
                Math.min(A4_WIDTH - element.left, A4_HEIGHT - element.top, newHeight),
              );
              return { ...element, width: size, height: size };
            }
            return { ...element, height: newHeight };
          }
          return { ...element, isSelected: false };
        }

        if (direction === "center-top") {
          if (element.element_id === elementId) {
            const bottomEdge = Number(element.top) + Number(element.height);
            const proposedTop = Number(element.top) + moveY;
            const newTop = Math.max(0, Math.min(bottomEdge - MIN_HEIGHT, proposedTop));
            const newHeight = bottomEdge - newTop;
            if (category === "circle") {
              const size = Math.max(
                MIN_HEIGHT,
                Math.min(A4_WIDTH - element.left, bottomEdge, newHeight),
              );
              return {
                ...element,
                width: size,
                height: size,
                top: bottomEdge - size,
              };
            }
            return { ...element, top: newTop, height: newHeight };
          }
          return { ...element, isSelected: false };
        }

      })
      return newState;
    })
  }, [canvasForPage])

  const handleClearA4 = useCallback(() => {
      endCanvasEnterReflowSuppress();
      resetHistory();
      setA4_Elements([]);
      setA4_Elements_deleted([]);
      setActiveTemplateId(null);
      setEditorMode(EDITOR_MODE_FREEFORM);
      adoptDocumentFlowSpacing(DEFAULT_FLOW_SPACING);
      setPageCount(1);
      setCurrentPage(1);
      titleRef.current.value = "";
  }, [adoptDocumentFlowSpacing, resetHistory, setEditorMode])

  // Replace the canvas with generated/authored specs. `title` is used verbatim.
  // Content fades in after fonts settle; fixedToPage chrome appears immediately.
  const handleLoadAiElements = useCallback((specs, title, templateId = null) => {
    resetHistory();
    const mapped = materializeElementSpecs(specs, nanoid);
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    markContentElementsEnter(mapped);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setActiveTemplateId(templateId || null);
    setEditorMode(EDITOR_MODE_TEMPLATE);
    // Fill used the live knobs — Reset must return to those, not re-pack.
    pinFlowSpacingBaseline();
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && title) {
      titleRef.current.value = title;
    }
  }, [pinFlowSpacingBaseline, resetHistory, setEditorMode])

  const handleLoadTemplateWithFill = useCallback((templateElements, templateName, fills, templateId = null) => {
    resetHistory();
    // fills use array index as id (String) — match by position, not by element_id
    const fillMap = Object.fromEntries((fills || []).map(f => [f.id, f.content]));
    const withContent = templateElements.map((spec, i) => {
      const aiContent = fillMap[String(i)];
      const useAi = (spec.category === "text" || spec.category === "textarea")
        && aiContent !== undefined && aiContent !== "";
      return { ...spec, content: useAi ? aiContent : spec.content };
    });
    const mapped = materializeElementSpecs(withContent, nanoid);
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    markContentElementsEnter(mapped);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setActiveTemplateId(templateId || null);
    setEditorMode(EDITOR_MODE_TEMPLATE);
    pinFlowSpacingBaseline();
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && templateName) {
      titleRef.current.value = `${templateName} CV`;
    }
  }, [pinFlowSpacingBaseline, setEditorMode])

  const handleLoadTemplate = useCallback((templateElements, title, templateId = null) => {
    resetHistory();
    const mapped = materializeElementSpecs(templateElements, nanoid);
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    markContentElementsEnter(mapped);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setActiveTemplateId(templateId || null);
    setEditorMode(EDITOR_MODE_TEMPLATE);
    pinFlowSpacingBaseline();
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && title) {
      titleRef.current.value = title;
    }
  }, [pinFlowSpacingBaseline, resetHistory, setEditorMode])

  /**
   * Convert the current template document into a freeform project in place.
   * Callers that need a safety copy should duplicate elements / clear pdfId
   * before invoking this (see Topbar unlock flow).
   */
  const handleUnlockFreeform = useCallback(() => {
    setEditorMode(EDITOR_MODE_FREEFORM);
    setA4_Elements((prev) => prev.map((element) => (
      element.preserveInitialLayout
        ? { ...element, preserveInitialLayout: false }
        : element
    )));
  }, [setEditorMode]);

  // Remove/add a contact channel (icon + label as a unit) and reflow the band +
  // downstream document. Committed via setA4_Elements so undo/redo and save
  // apply unchanged; pageCount re-syncs from the reconciled element pages.
  const removeContactChannel = useCallback((bandId, channel) => {
    setA4_Elements((prev) =>
      applyChannelRemoval(prev, bandId, channel, measureContactLabel, () => nanoid()).elements,
    );
  }, [measureContactLabel]);
  const addContactChannel = useCallback((bandId, channel, label) => {
    setA4_Elements((prev) =>
      applyChannelAddition(prev, bandId, channel, label, measureContactLabel, () => nanoid()).elements,
    );
  }, [measureContactLabel]);

  // Masthead identity toggles (Phase 3). Committed via setA4_Elements so
  // undo/redo and save apply unchanged; the case toggle needs no reflow, the
  // title toggle re-paginates through applyTitleToggle.
  const toggleNameCase = useCallback((bandId) => {
    setA4_Elements((prev) => applyNameCaseToggle(prev, bandId).elements);
  }, []);
  const toggleTitle = useCallback((bandId) => {
    setA4_Elements((prev) => applyTitleToggle(prev, bandId, () => nanoid()).elements);
  }, []);


  return {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
    groupMoveDelta,
    handleMoveElement,
    handleMoveSelectedElements,
    handleSelectMoveElement,
    handleSelectElement,
    handleAddText,
    handleAddLine,
    handleAddRectangle,
    handleAddCircle,
    handleAddEllipse,
    handleAddPolygon,
    handleAddPath,
    handleAddImage,
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
    // connector mode
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
    handleAlignElements,
    handleDeleteElement,
    handleDeleteSelectedElements,
    handleDuplicateElement,
    handleDuplicateSelectedElements,
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
    A4ref,
    canvasAreaRef,
    setPageCanvasRef,
    PDFTitle,
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
    setBaselineFlowSpacing,
    adoptDocumentFlowSpacing,
    pinFlowSpacingBaseline,
    // multi-page
    pageCount,
    setPageCount,
    currentPage,
    setCurrentPage,
    isTwoPageView,
    toggleTwoPageView,
    addPage: handleAddPage,
    removePage: handleRemovePage,
    goToPage: handleGoToPage,
    clonePage: handleClonePage,
    movePage: handleMovePage,
    // page geometry (fixed A4 portrait)
    pageSize,
    // zoom (view-only; not persisted)
    zoom,
    zoomIn,
    zoomOut,
    // undo / redo
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  };

}