import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { getElementBounds } from '../utils/elementBounds';
import { measureTextareaHeight } from '../utils/textareaHeight';
import { reflowTextareaHeight } from '../utils/textareaReflow';
import { cloneFixedPageDecorations } from '../utils/structureOperation';
import { findPageCanvasAtPoint } from '../utils/pageSpread';
import { moveElementsByDelta } from '../utils/pageDrag';
import { sanitizeTextContent } from '../utils/sanitizeTextContent';
import { markContentElementsEnter, markElementsEnter, isCanvasEnterReflowSuppressed, endCanvasEnterReflowSuppress } from '../utils/canvasEnter';
import { isDecorativeChrome } from '../utils/elementInteraction';
import {
  createCircleElement,
  createEllipseElement,
  createImageElement,
  createLineElement,
  createRectangleElement,
  createTextElement,
  createTextareaElement,
} from '../utils/a4ElementFactories';
import { materializeElementSpecs } from '../utils/materializeElementSpecs';
import { useDocumentHistory } from './useDocumentHistory';
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
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
const stepZoom = (z, dir) => clampZoom(Math.round((z + dir * ZOOM_STEP) * 10) / 10);

export function useA4Elements(titleRef) {

  const A4ref = useRef(null);

  const [A4_Elements, setA4_Elements] = useState([]);
  const [A4_Elements_deleted, setA4_Elements_deleted] = useState([]);
  // Last loaded template slug (e.g. "words"). Used by Layout AI for layout_contract
  // hints; cleared for blank canvases and unknown freestyle loads.
  const [activeTemplateId, setActiveTemplateId] = useState(null);

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
  const [zoom, setZoomState] = useState(1);
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
  // Strip NULL/NBSP junk already sitting in open documents (loaded before
  // sanitization existed, or pasted in). One pass; clean state is a no-op.
  useEffect(() => {
    const needsScrub = A4_Elements.some((element) => (
      (element.category === "text" || element.category === "textarea")
      && element.content != null
      && sanitizeTextContent(element.content) !== element.content
    ));
    if (!needsScrub) return;
    setA4_Elements((prev) => prev.map((element) => {
      if (
        (element.category !== "text" && element.category !== "textarea")
        || element.content == null
      ) {
        return element;
      }
      const content = sanitizeTextContent(element.content);
      return content === element.content ? element : { ...element, content };
    }));
  }, [A4_Elements]);
  useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]);
  useEffect(() => {
    if (pageCount < 2) setIsTwoPageView(false);
  }, [pageCount]);
  useEffect(() => {
    const nextPageCount = reflowPageCountRef.current;
    if (nextPageCount === null) return;

    reflowPageCountRef.current = null;
    setPageCount(nextPageCount);
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
    setElements: setA4_Elements,
    setDeletedElements: setA4_Elements_deleted,
  });

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

  const handleGoToPage = useCallback((page) => {
    setPageCount(count => {
      setCurrentPage(Math.min(Math.max(1, page), count));
      return count;
    });
    clearSelection();
  }, [clearSelection]);

  const handleAddPage = useCallback(() => {
    setPageCount(prev => {
      const next = prev + 1;
      setCurrentPage(next);
      return next;
    });
    clearSelection();
  }, [clearSelection]);

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
      return [...shifted, ...clones];
    });
    setPageCount(pageCountRef.current + 1);
    setCurrentPage(src + 1);   // land on the fresh copy
    clearSelection();
  }, [clearSelection]);

  // Swap the current page with its neighbour (dir: -1 earlier, +1 later) and
  // follow it, so repeated clicks walk the page through the document.
  const handleMovePage = useCallback((dir) => {
    const from = currentPageRef.current;
    setPageCount(count => {
      const to = from + dir;
      if (to < 1 || to > count) return count;
      setA4_Elements(prev => prev.map(el => {
        const p = el.page ?? 1;
        if (p === from) return { ...el, page: to };
        if (p === to) return { ...el, page: from };
        return el;
      }));
      setCurrentPage(to);
      return count;
    });
    clearSelection();
  }, [clearSelection]);

  const handleRemovePage = useCallback(() => {
    setPageCount(prevCount => {
      if (prevCount <= 1) return prevCount;

      // Read the page being removed from the ref so we don't depend on
      // currentPage in this callback.
      const removed = currentPageRef.current;

      // Track elements on the removed page as deletions so an update wipes
      // them from the DB (mirrors handleDeleteElement).
      const removedEls = elementsRef.current.filter(e => (e.page ?? 1) === removed);
      if (removedEls.length) {
        setA4_Elements_deleted(prevDel => {
          const additions = removedEls
            .filter(e => !prevDel.some(d => d.element_id === e.element_id))
            .map(e => ({ ...e, deleted: true }));
          return additions.length ? [...prevDel, ...additions] : prevDel;
        });
      }

      // Drop the page and shift every later page down by one.
      setA4_Elements(prev => prev
        .filter(e => (e.page ?? 1) !== removed)
        .map(e => {
          const p = e.page ?? 1;
          return { ...e, isSelected: false, page: p > removed ? p - 1 : p };
        }));

      const next = prevCount - 1;
      setCurrentPage(Math.min(removed, next));
      return next;
    });
  }, []);

  // Sidebar / gallery add handlers. Factories own default geometry and category
  // fields; these wrappers stamp a fresh id, the active page, and enter markers.
  // Bodies were dropped during the selection-drag split while return exports
  // stayed — that left "handleAddText is not defined" and crashed /pdfcanvas.
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
  const handleDuplicateElement = useCallback((elementId) => {
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
  const handleDuplicateSelectedElements = useCallback(() => {
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

  const handleDeleteElement = useCallback((elementId) => {
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

      return prevState.filter(element => !removedIds.has(element.element_id));
    });
  }, []);

  const handleDeleteSelectedElements = useCallback(() => {
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

      return prevState.filter((element) => !removedIds.has(element.element_id));
    });
  }, []);

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

      return prevState.filter((element) => !removedIds.has(element.element_id));
    });
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
          }
          return next;
        } else {
          return element;
        }
      });
      return newState;
    });
  }, [])

  // Applies a shared set of editable fields to every selected element. The
  // editor only exposes fields present on the entire selection, so this does
  // not introduce properties incompatible with an element category.
  const handleEditSelectedElementValues = useCallback((dataObject) => {
    setA4_Elements(prevState => prevState.map((element) => {
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
    }));
  }, [])

  // The canvas is the typography authority: after a template textarea has
  // rendered, its measured content height replaces the authored placeholder
  // height and every later element in the same visual lane keeps its gap.
  // Quiet history so this settle never becomes an Undo step of its own.
  // Skip while canvas enter is holding opacity at 0 — fallback-font measures
  // during that window were collapsing whole CV layouts on load.
  const handleFitTextareaToContent = useCallback((elementId, measuredHeight) => {
    if (isCanvasEnterReflowSuppressed()) return;
    markHistoryQuiet();
    setA4_Elements((prevState) => {
      const result = reflowTextareaHeight(
        prevState,
        elementId,
        measuredHeight,
        pageSizeRef.current.height,
        // Framed classic/sidebar CVs reserve ~66px top and keep clear of the
        // footer rule near y=783. Using those safe margins prevents canvas
        // auto-height from packing into decorative chrome.
        { pageTop: 66, bottomMargin: 96 },
      );
      if (!result.changed) return prevState;

      reflowPageCountRef.current = result.pageCount;
      return result.elements;
    });
  }, [markHistoryQuiet]);

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
      const nextPageCount = Math.max(
        1,
        ...nextElements.map(element => element.page ?? 1),
        ...targetPages,
      );
      reflowPageCountRef.current = nextPageCount;
      layoutTargetPageRef.current = targetPages.length > 0 ? Math.max(...targetPages) : null;
      return nextElements;
    });
  }, []);

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
      const existingMaxPage = Math.max(1, ...prevState.map((element) => element.page ?? 1));
      const targetMaxPage = Math.max(
        existingMaxPage,
        ...documentElements.map((element) => element.page ?? 1),
      );
      const generatedDecorations = cloneFixedPageDecorations(
        documentElements,
        existingMaxPage + 1,
        targetMaxPage,
        nanoid,
      );
      const withDecorations = [...documentElements, ...generatedDecorations];
      // Content only — cloned page chrome must appear instantly.
      markContentElementsEnter(normalizedAdditions);
      reflowPageCountRef.current = Math.max(
        targetMaxPage,
        ...withDecorations.map((element) => element.page ?? 1),
      );
      layoutTargetPageRef.current = normalizedAdditions[0]?.page ?? null;
      return withDecorations;
    });
  }, []);

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
      const existingMaxPage = Math.max(1, ...prevState.map((element) => element.page ?? 1));
      const targetMaxPage = Math.max(
        existingMaxPage,
        group.page_count || 1,
        ...documentElements.map((element) => element.page ?? 1),
      );
      const generatedDecorations = cloneFixedPageDecorations(
        documentElements,
        existingMaxPage + 1,
        targetMaxPage,
        nanoid,
      );

      const withDecorations = [...documentElements, ...generatedDecorations];
      const byNewId = new Map(withDecorations.map((element) => [element.element_id, element]));
      const reconciled = withDecorations.map((element) => {
        if (element.category !== "connector") return element;
        const connectorSource = byNewId.get(element.source_id);
        const connectorTarget = byNewId.get(element.target_id);
        if (!connectorSource || !connectorTarget || (connectorSource.page ?? 1) !== (connectorTarget.page ?? 1)) {
          return element;
        }
        return { ...element, page: connectorSource.page ?? 1 };
      });
      markContentElementsEnter(normalizedAdditions);
      reflowPageCountRef.current = Math.max(targetMaxPage, ...reconciled.map((element) => element.page ?? 1));
      layoutTargetPageRef.current = normalizedAdditions[0]?.page ?? null;
      return reconciled;
    });
  }, []);

  const handleAlignElements = useCallback((elementId, position, width, category) => {
    if (elementsRef.current.find((element) => element.element_id === elementId)?.locked) return;
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
      setPageCount(1);
      setCurrentPage(1);
      titleRef.current.value = "";
  }, [resetHistory])

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
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && title) {
      titleRef.current.value = title;
    }
  }, [resetHistory])

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
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && templateName) {
      titleRef.current.value = `${templateName} CV`;
    }
  }, [])

  const handleLoadTemplate = useCallback((templateElements, title, templateId = null) => {
    resetHistory();
    const mapped = materializeElementSpecs(templateElements, nanoid);
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    markContentElementsEnter(mapped);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setActiveTemplateId(templateId || null);
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && title) {
      titleRef.current.value = title;
    }
  }, [resetHistory])


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
    handleAddImage,
    handleAddTextarea,
    // connector mode
    connectMode,
    connectSourceId,
    startConnecting,
    cancelConnecting,
    pickConnectorAt,
    markSelected,
    handleSetTextareaEditing,
    handleAlignElements,
    handleDeleteElement,
    handleDeleteSelectedElements,
    handleDuplicateElement,
    handleDuplicateSelectedElements,
    handleEditElementValues,
    handleEditSelectedElementValues,
    fitTextareaToContent: handleFitTextareaToContent,
    applyLayoutPatches,
    applyStructureOperation,
    applyCloneOperation,
    applyDeleteOperation,
    A4ref,
    setPageCanvasRef,
    PDFTitle,
    handleResizeElement,
    handleClearA4,
    handleLoadTemplate,
    handleLoadTemplateWithFill,
    handleLoadAiElements,
    activeTemplateId,
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