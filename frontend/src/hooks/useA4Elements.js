import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { getElementBounds } from '../utils/elementBounds';
import { measureTextareaHeight } from '../utils/textareaHeight';
import { reflowTextareaHeight } from '../utils/textareaReflow';
import { cloneFixedPageDecorations } from '../utils/structureOperation';

// Elements a connector can attach to — those with a real bounding box the
// backend can reproduce for the PDF. Single-line text (no stored width/height)
// is intentionally excluded.
const CONNECTABLE = new Set(["textarea", "rectangle", "circle", "ellipse", "image", "line"]);

// Canvas size presets (pt = px, 1:1 with the PDF). The deck preset matches
// PowerPoint's 13.33×7.5in widescreen slide.
export const PAGE_PRESETS = {
  "a4-portrait":  { label: "A4 · Pion",       width: 595, height: 842 },
  "a4-landscape": { label: "A4 · Poziom",     width: 842, height: 595 },
  "deck-16-9":    { label: "Prezentacja · 16:9", width: 960, height: 540 },
};

// Canvas zoom is view-only (never persisted or exported). Snap each step to
// the 0.1 grid (not just +/- 0.1 from the current value) so levels are always
// clean multiples — otherwise, once you hit the 0.25 floor (not on the grid),
// every later step lands on ...5 values and 100% becomes unreachable.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
const stepZoom = (z, dir) => clampZoom(Math.round((z + dir * ZOOM_STEP) * 10) / 10);

// Match stored dimensions back to a preset id (loading a saved PDF).
export function presetFromDims(width, height) {
  const found = Object.entries(PAGE_PRESETS)
    .find(([, p]) => p.width === width && p.height === height);
  return found ? found[0] : "custom";
}

// Translate a set of positioned elements by one shared delta. The delta is
// clamped for the complete set, so their relative distances never change and
// no individual element can leave the page.
function moveElementsByDelta(elements, elementIds, deltaX, deltaY, pageSize) {
  const movable = elements.filter((element) => (
    elementIds.has(element.element_id)
    && !element.locked
    && Number.isFinite(Number(element.left))
    && Number.isFinite(Number(element.top))
  ));
  if (movable.length === 0) return elements;

  let minX = -Infinity;
  let maxX = Infinity;
  let minY = -Infinity;
  let maxY = Infinity;

  movable.forEach((element) => {
    const { width, height } = getElementBounds(element);
    const left = Number(element.left);
    const top = Number(element.top);
    minX = Math.max(minX, -left);
    maxX = Math.min(maxX, pageSize.width - left - width);
    minY = Math.max(minY, -top);
    maxY = Math.min(maxY, pageSize.height - top - height);
  });

  // An element already outside of the page must not make the group jump to an
  // arbitrary edge. In that exceptional case, keep that axis stationary.
  const safeDeltaX = minX > maxX
    ? 0
    : Math.min(Math.max(deltaX, minX), maxX);
  const safeDeltaY = minY > maxY
    ? 0
    : Math.min(Math.max(deltaY, minY), maxY);

  if (safeDeltaX === 0 && safeDeltaY === 0) return elements;

  return elements.map((element) => (
    elementIds.has(element.element_id)
      && Number.isFinite(Number(element.left))
      && Number.isFinite(Number(element.top))
      ? {
          ...element,
          left: Number(element.left) + safeDeltaX,
          top: Number(element.top) + safeDeltaY,
        }
      : element
  ));
}

export function useA4Elements(titleRef) {

  const A4ref = useRef(null);

  const [A4_Elements, setA4_Elements] = useState([]);
  const [A4_Elements_deleted, setA4_Elements_deleted] = useState([]);

  // ---- Connector draw mode ----
  // connectMode: true while the user is picking the two elements to link.
  // connectSourceId: the first element picked (null until then).
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState(null);

  // ---- Multi-page state ----
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  // ---- Page geometry (preset-driven; default A4 portrait) ----
  const [pageSize, setPageSize] = useState({ preset: "a4-portrait", ...PAGE_PRESETS["a4-portrait"] });

  // View-only zoom (not persisted, not in undo/redo — lives outside A4_Elements).
  const [zoom, setZoomState] = useState(1);
  const zoomIn = useCallback(() => setZoomState(z => stepZoom(z, 1)), []);
  const zoomOut = useCallback(() => setZoomState(z => stepZoom(z, -1)), []);

  // Refs let the stable add-element callbacks read the latest page/elements
  // without being recreated on every page change.
  const currentPageRef = useRef(1);
  const elementsRef = useRef([]);
  const pageSizeRef = useRef(pageSize);
  const pageCountRef = useRef(1);
  const draggedElementIdsRef = useRef(new Set());
  const reflowPageCountRef = useRef(null);
  const layoutTargetPageRef = useRef(null);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { elementsRef.current = A4_Elements; }, [A4_Elements]);
  useEffect(() => { pageSizeRef.current = pageSize; }, [pageSize]);
  useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]);
  useEffect(() => {
    const nextPageCount = reflowPageCountRef.current;
    if (nextPageCount === null) return;

    reflowPageCountRef.current = null;
    setPageCount(nextPageCount);
    const targetPage = layoutTargetPageRef.current;
    layoutTargetPageRef.current = null;
    setCurrentPage((page) => targetPage ?? Math.min(page, nextPageCount));
  }, [A4_Elements]);

  // ---- Undo / redo history (in-memory, session-scoped) ----
  // A snapshot is the DOCUMENT: elements with the volatile UI flags stripped
  // (isSelected/isMove/isEditing) + page geometry. Stripping those flags means
  // selecting an element or a single drag FRAME is not an undo step. The
  // recorder is debounced, so a whole drag or a typed burst collapses into ONE
  // step. History is never persisted — autosave persists the document; undo is
  // a session concept. Undo/redo apply by content-equality, so re-applying a
  // snapshot produces an identical snapshot the recorder skips (no flag needed).
  const HISTORY_LIMIT = 100;
  const historyRef = useRef({ stack: [], index: -1 });
  const historyTimerRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const buildSnapshot = () => ({
    elements: elementsRef.current.map(({ isSelected, isMove, isEditing, ...keep }) => keep),
    pageCount: pageCountRef.current,
    pageWidth: pageSizeRef.current.width,
    pageHeight: pageSizeRef.current.height,
  });

  const syncHistoryFlags = () => {
    const { stack, index } = historyRef.current;
    setCanUndo(index > 0);
    setCanRedo(index < stack.length - 1);
  };

  const recordSnapshot = () => {
    const snap = buildSnapshot();
    const h = historyRef.current;
    const cur = h.stack[h.index];
    if (cur && JSON.stringify(cur) === JSON.stringify(snap)) return; // content unchanged (e.g. selection only)
    const next = h.stack.slice(0, h.index + 1);
    next.push(snap);
    const overflow = next.length - HISTORY_LIMIT;
    const capped = overflow > 0 ? next.slice(overflow) : next;
    historyRef.current = { stack: capped, index: capped.length - 1 };
    syncHistoryFlags();
  };

  // Debounced recorder: coalesces drag frames / keystrokes into a single step.
  useEffect(() => {
    clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(recordSnapshot, 350);
    return () => clearTimeout(historyTimerRef.current);
  }, [A4_Elements, pageCount, pageSize]);

  // Wipe history to a fresh baseline (loading a template / AI doc / saved PDF /
  // clearing) so you can't undo BACK into the previous document. The pending
  // debounced recorder seeds the new baseline from current state.
  const resetHistory = useCallback(() => {
    historyRef.current = { stack: [], index: -1 };
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const applySnapshot = (snap) => {
    setA4_Elements(snap.elements.map(el => ({ ...el, isSelected: false, isMove: false, isEditing: false })));
    setPageCount(snap.pageCount);
    setCurrentPage(cp => Math.min(cp, snap.pageCount));
    setPageSize(ps => (ps.width === snap.pageWidth && ps.height === snap.pageHeight)
      ? ps
      : { preset: presetFromDims(snap.pageWidth, snap.pageHeight), width: snap.pageWidth, height: snap.pageHeight });
  };

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applySnapshot(h.stack[h.index]);
    syncHistoryFlags();
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applySnapshot(h.stack[h.index]);
    syncHistoryFlags();
  }, []);

  const setPagePreset = useCallback((presetId) => {
    const p = PAGE_PRESETS[presetId];
    if (p) setPageSize({ preset: presetId, width: p.width, height: p.height });
  }, []);

  const clearSelection = useCallback(() => {
    setA4_Elements(prev => prev.some(e => e.isSelected)
      ? prev.map(e => (e.isSelected ? { ...e, isSelected: false } : e))
      : prev);
  }, []);

  // Enter connector mode: next two element clicks pick source then target.
  const startConnecting = useCallback(() => {
    setConnectSourceId(null);
    setConnectMode(true);
    clearSelection();
  }, [clearSelection]);

  const cancelConnecting = useCallback(() => {
    setConnectMode(false);
    setConnectSourceId(null);
  }, []);

  // Topmost connectable element on the current page whose box contains the
  // given canvas-space point (px from the A4 top-left corner).
  const elementAtPoint = (x, y) => {
    const hits = elementsRef.current.filter((el) =>
      CONNECTABLE.has(el.category) &&
      (el.page ?? 1) === currentPageRef.current &&
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
  const pickConnectorAt = useCallback((clientX, clientY) => {
    const rect = A4ref.current?.getBoundingClientRect();
    if (!rect) return;
    // rect is the SCALED #A4; convert the screen-space click offset back to
    // canvas units so it matches stored element left/top/width/height.
    const zoom = rect.width / pageSizeRef.current.width || 1;
    const hit = elementAtPoint((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
    if (!hit) { setConnectMode(false); setConnectSourceId(null); return; }

    setConnectSourceId((prevSource) => {
      if (!prevSource) return hit.element_id;           // first pick
      if (prevSource === hit.element_id) return prevSource; // ignore same element
      const connector = {
        element_id: nanoid(),
        category: "connector",
        source_id: prevSource,
        target_id: hit.element_id,
        backgroundColor: "#000000",
        borderWidth: 1,
        arrow: true,
        isSelected: false,
        isMove: false,
        locked: false,
        zIndex: 50,
        page: currentPageRef.current,
      };
      setA4_Elements((prev) => [...prev, connector]);
      setConnectMode(false);
      return null;
    });
  }, []);

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
    setPageCount(prevCount => {
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
        return [...shifted, ...clones];
      });
      setCurrentPage(src + 1);   // land on the fresh copy
      return prevCount + 1;
    });
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



  const handleMoveElement = useCallback((e, elementId) => {
    if ((e.buttons & 1) !== 1) return;

    const canvas = A4ref.current;
    const elementNode = e.currentTarget;
    if (!canvas || !elementNode) return;

    const canvasRect = canvas.getBoundingClientRect();
    const elementRect = elementNode.getBoundingClientRect();
    const scaleX = canvasRect.width / pageSizeRef.current.width;
    const scaleY = canvasRect.height / pageSizeRef.current.height;
    if (!scaleX || !scaleY) return;

    const pointerX = (e.clientX - canvasRect.left) / scaleX;
    const pointerY = (e.clientY - canvasRect.top) / scaleY;
    const targetLeft = pointerX - elementRect.width / scaleX / 2;
    const targetTop = pointerY - elementRect.height / scaleY / 2;

    setA4_Elements((prevState) => {
      const dragged = prevState.find((element) => element.element_id === elementId);
      if (!dragged?.isMove || dragged.locked) return prevState;
      draggedElementIdsRef.current.add(elementId);

      const selectedOnSamePage = prevState.filter((element) => (
        element.isSelected
        && !element.locked
        && (element.page ?? 1) === (dragged.page ?? 1)
      ));
      const movedElements = dragged.isSelected && selectedOnSamePage.length > 1
        ? selectedOnSamePage
        : [dragged];
      const movedIds = new Set(movedElements.map((element) => element.element_id));

      return moveElementsByDelta(
        prevState,
        movedIds,
        targetLeft - dragged.left,
        targetTop - dragged.top,
        pageSizeRef.current,
      );
    });
  }, [])

  const handleMoveSelectedElements = useCallback((deltaX = 0, deltaY = 0) => {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

    setA4_Elements((prevState) => {
      const selectedIds = new Set(
        prevState
          .filter((element) => element.isSelected && !element.locked)
          .map((element) => element.element_id)
      );
      return moveElementsByDelta(
        prevState,
        selectedIds,
        deltaX,
        deltaY,
        pageSizeRef.current,
      );
    });
  }, [])

  // Explicit press/release drag state: pointerdown passes moving=true,
  // pointerup moving=false. NEVER a toggle — a toggle inverts permanently the
  // moment a pointerup is missed (e.g. the element remounts when selecting it
  // swaps in the <Resize>-wrapped branch and the pointer capture dies).
  const handleSelectMoveElement = useCallback((elementId, moving) => {
    if (moving) {
      draggedElementIdsRef.current.delete(elementId);
    } else {
      // Click follows pointerup in the same interaction. Delay cleanup by one
      // task so handleSelectElement can recognise and ignore that post-drag
      // click, preserving the current group selection.
      window.setTimeout(() => draggedElementIdsRef.current.delete(elementId), 0);
    }
    setA4_Elements(prevState => prevState.map((element) => (
      element.element_id === elementId
        ? { ...element, isMove: !!moving && !element.locked }
        : { ...element, isMove: false }
    )));
  }, [])

  // Safety net: releasing the button ANYWHERE ends every drag, even when the
  // dragged element lost its pointer capture and its own pointerup never fired.
  useEffect(() => {
    const endDrag = () => {
      setA4_Elements(prev => prev.some(e => e.isMove)
        ? prev.map(e => (e.isMove ? { ...e, isMove: false } : e))
        : prev);
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [])

  // Normal click makes one element the active selection. Ctrl/Cmd-click toggles
  // only that element, preserving the rest of the selection for bulk editing.
  const handleSelectElement = useCallback((elementId, additive = false) => {
    if (!additive && draggedElementIdsRef.current.delete(elementId)) return;

    setA4_Elements(prevState => {
      return prevState.map((element) => {
        if (element.element_id === elementId) {
          return {
            ...element,
            isSelected: additive ? !element.isSelected : true,
            isMove: false,
            isEditing: element.category === "textarea" ? false : element.isEditing,
          };
        }
        return additive
          ? { ...element, isMove: false, isEditing: element.category === "textarea" ? false : element.isEditing }
          : {
              ...element,
              isSelected: false,
              isMove: false,
              isEditing: element.category === "textarea" ? false : element.isEditing,
            };
      });
    });
  }, [])

  const handleAddText = useCallback(() => {
    const text = {
      element_id: nanoid(),
      content: "Przykładowy tekst…",
      fontSize: 14,
      fontFamily: "Inter",
      color: "#000000",
      left: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      locked: false,
      category: "text",
      bold: false,
      italic: false,
      underline: false,
      zIndex: 3,
      page: currentPageRef.current,
    };
    setA4_Elements(prevState => {
      return [...prevState, text];
    });
  }, [])

  const handleAddLine = useCallback(() => {
    const line = {
      element_id: nanoid(),
      backgroundColor: "#000000",
      left: 10,
      width: 100,
      height: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      locked: false,
      category: "line",
      zIndex: 2,
      page: currentPageRef.current,
    };
    setA4_Elements(prevState => {
      return [...prevState, line];
    });
  }, [])

  const handleAddRectangle = useCallback(() => {
    const rectangle = {
      element_id: nanoid(),
      backgroundColor: "#000000", // reused as the border (stroke) colour
      borderWidth: 1,
      left: 20,
      top: 20,
      width: 120,
      height: 80,
      isSelected: false,
      isMove: false,
      locked: false,
      category: "rectangle",
      zIndex: 2,
      page: currentPageRef.current,
    };
    setA4_Elements(prevState => {
      return [...prevState, rectangle];
    });
  }, [])

  const handleAddCircle = useCallback(() => {
    const circle = {
      element_id: nanoid(),
      backgroundColor: "#000000",
      borderWidth: 1,
      filled: false,
      left: 20,
      top: 20,
      width: 80,
      height: 80,
      isSelected: false,
      isMove: false,
      locked: false,
      category: "circle",
      zIndex: 2,
      page: currentPageRef.current,
    };
    setA4_Elements((prevState) => [...prevState, circle]);
  }, [])

  const handleAddEllipse = useCallback(() => {
    const ellipse = {
      element_id: nanoid(),
      backgroundColor: "#000000",
      borderWidth: 1,
      filled: false,
      left: 20,
      top: 20,
      width: 120,
      height: 80,
      isSelected: false,
      isMove: false,
      locked: false,
      category: "ellipse",
      zIndex: 2,
      page: currentPageRef.current,
    };
    setA4_Elements((prevState) => [...prevState, ellipse]);
  }, [])

  const handleAddImage = useCallback((e) => {
    const image = {
      element_id: nanoid(),
      src: e.target.src,
      width: 100,
      height: e.target.naturalHeight / e.target.naturalWidth * 100,
      left: 10,
      top: 10,
      isSelected: false,
      isMove: false,
      locked: false,
      category: "image",
      zIndex: 1,
      img_id : e.target.id,
      page: currentPageRef.current,
    };
    setA4_Elements(prevState => {
      return [...prevState, image];
    });
  }, [])

  const handleAddTextarea = useCallback(() => {
    const fontSize = 14;
    const lineHeight = Math.round(fontSize * 1.4);
    const width = 260;
    const textarea = {
      element_id: nanoid(),
      content: "",
      fontSize,
      fontFamily: "Inter",
      color: "#000000",
      lineHeight,
      letterSpacing: 0,
      left: 20,
      top: 20,
      width,
      height: measureTextareaHeight("", width, fontSize, lineHeight),
      isSelected: true,
      isMove: false,
      locked: false,
      isEditing: true,
      bold: false,
      italic: false,
      underline: false,
      align: "left",
      bulletList: false,
      category: "textarea",
      zIndex: 4,
      page: currentPageRef.current,
    };
    // New box starts in edit mode; clear selection/editing on everything else.
    setA4_Elements(prevState => [
      ...prevState.map(el => ({
        ...el,
        isSelected: false,
        isEditing: el.category === "textarea" ? false : el.isEditing,
      })),
      textarea,
    ]);
  }, [])

  // Select an element without toggling (used by the text box on single click)
  // and leave edit mode on any other text box.
  const markSelected = useCallback((elementId) => {
    handleSelectElement(elementId);
  }, [handleSelectElement])

  const handleSetTextareaEditing = useCallback((elementId, editing) => {
    setA4_Elements(prevState => prevState.map(el => {
      if (el.element_id === elementId) {
        return { ...el, isEditing: editing, isSelected: true };
      }
      // A text box in direct edit mode becomes the sole active element; this
      // prevents a bulk selection from remaining active while typing content.
      return editing
        ? { ...el, isSelected: false, isEditing: el.category === "textarea" ? false : el.isEditing }
        : (el.category === "textarea" ? { ...el, isEditing: false } : el);
    }));
  }, [])

  
  // Clone the selected element: same size/text/colors/font/page, new id,
  // nudged 15px down-right so the copy is visibly distinct, then selected.
  const handleDuplicateElement = useCallback((elementId) => {
    setA4_Elements(prevState => {
      const original = prevState.find(el => el.element_id === elementId);
      if (!original) return prevState;

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

      // Deselect everything else; the new copy is the only selected element.
      return [...prevState.map(el => ({ ...el, isSelected: false })), copy];
    });
  }, []);

  // Clone the entire current selection as one group. Connectors explicitly
  // selected by the user — plus connectors whose two endpoints are in the
  // group — are copied with their endpoints re-linked to the clones.
  const handleDuplicateSelectedElements = useCallback(() => {
    setA4_Elements((prevState) => {
      const selected = prevState.filter((element) => element.isSelected);
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
          .filter((element) => element.isSelected)
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
          return { ...element, ...dataObject };
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
  const handleFitTextareaToContent = useCallback((elementId, measuredHeight) => {
    setA4_Elements((prevState) => {
      const result = reflowTextareaHeight(
        prevState,
        elementId,
        measuredHeight,
        pageSizeRef.current.height,
      );
      if (!result.changed) return prevState;

      reflowPageCountRef.current = result.pageCount;
      return result.elements;
    });
  }, []);

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
      reflowPageCountRef.current = Math.max(targetMaxPage, ...reconciled.map((element) => element.page ?? 1));
      layoutTargetPageRef.current = normalizedAdditions[0]?.page ?? null;
      return reconciled;
    });
  }, []);

  // Move an element to newTop and shift every element BELOW it (in absolute
  // document order) by the same delta — opens/closes vertical space above the
  // moved block while preserving spacing. Fully bidirectional: pushing down
  // flows overflow onto the next page (creating it), pushing up pulls elements
  // back from later pages and trims the now-empty trailing pages.
  const handleMoveElementWithBelow = useCallback((elementId, newTop) => {
    const PAGE_HEIGHT = pageSizeRef.current.height;
    const elements = elementsRef.current;
    const target = elements.find(el => el.element_id === elementId);
    if (!target || target.locked) return;

    // Work in absolute document Y (across all pages). This keeps the moved
    // block rigid as it flows across page boundaries — measuring per-page and
    // matching only the target's page collapses spacing the moment an element
    // crosses onto the next page.
    const absOf = (el) => ((el.page ?? 1) - 1) * PAGE_HEIGHT + el.top;
    const oldAbs = absOf(target);
    const newAbs = ((target.page ?? 1) - 1) * PAGE_HEIGHT + newTop;
    const delta = newAbs - oldAbs;
    if (delta === 0) return;

    // Absolute Y -> { page, top }. Only wraps downward overflow; upward moves
    // that pull an element to an earlier page resolve naturally too.
    const toPageTop = (abs) => {
      let a = abs;
      let p = 1;
      while (a >= PAGE_HEIGHT) { a -= PAGE_HEIGHT; p += 1; }
      return { page: p, top: a };
    };

    let maxPage = 1;
    const next = elements.map(el => {
      let res = el;
      if (el.element_id === elementId) {
        const { page, top } = toPageTop(newAbs);
        res = { ...el, page, top };
      } else if (absOf(el) > oldAbs && !el.locked) {
        // Every element below the target (in absolute terms) shifts by the
        // same delta — spacing preserved across the page break.
        const { page, top } = toPageTop(absOf(el) + delta);
        res = { ...el, page, top };
      }
      if ((res.page ?? 1) > maxPage) maxPage = res.page ?? 1;
      return res;
    });

    setA4_Elements(next);
    // Set the page count to the furthest page that actually holds an element:
    // grows as overflow flows down, shrinks when an upward push empties the
    // trailing pages the overflow created. Empty pages between content are kept
    // (maxPage tracks the highest OCCUPIED page). Clamp the view so it doesn't
    // sit on a page that no longer exists.
    setPageCount(maxPage);
    setCurrentPage(cp => Math.min(cp, maxPage));
  }, [])

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
    if (elementsRef.current.find((element) => element.element_id === elementId)?.locked) return;

    let aspectRatio = 1;
    let heightFactor;
    if (category === "image" && elementRef?.current) {
      aspectRatio = elementRef.current.naturalHeight / elementRef.current.naturalWidth;
    }

    const A4_COORDS = A4ref.current.getBoundingClientRect();

    const { width: A4_WIDTH, height: A4_HEIGHT } = pageSizeRef.current;
    const MIN_WIDTH = 10;
    const MIN_HEIGHT = 10;

    // Under canvas zoom, a screen-pixel drag covers fewer canvas units. The
    // rect is the SCALED #A4, so rect.width / pageWidth is exactly the zoom
    // factor. Every resize branch below is driven by the horizontal delta.
    const zoom = A4_COORDS.width / A4_WIDTH || 1;
    const moveX = e.movementX / zoom;

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
          if (direction === "bottom-right" || direction === "top-right") { w += moveX; }
          else if (direction === "bottom-left" || direction === "top-left") { w -= moveX; l += moveX; }
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
            const newWidth = Math.max(MIN_WIDTH, Math.min(A4_WIDTH - element.left, proposedWidth))
            return {
              ...element,
              width: newWidth,
              left: element.left

            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

        if (direction === "center-left") {

          const rightEdge = element.left + element.width;
          const proposedLeft = element.left + moveX;
          const newLeft = Math.max(0, Math.min(rightEdge - MIN_WIDTH, proposedLeft));
          const newWidth = rightEdge - newLeft;

          if (element.element_id === elementId) {
            return {
              ...element,
              width: newWidth,
              left: newLeft
            }
          }
          else {
            return {
              ...element,
              isSelected: false
            }
          }
        }

      })
      return newState;
    })
  }, [])

  const handleClearA4 = useCallback(() => {
      resetHistory();
      setA4_Elements([]);
      setA4_Elements_deleted([]);
      setPageCount(1);
      setCurrentPage(1);
      titleRef.current.value = "";
  }, [resetHistory])

  // Assign fresh element_ids to a list of specs, honouring symbolic `id` keys:
  // a template/AI spec may carry `id: "box1"` and a connector referencing it via
  // source_id/target_id — those references are rewritten to the generated
  // nanoids so connectors survive loading. Interaction flags default off.
  const materializeSpecs = (specs) => {
    const idMap = {};
    const mapped = (specs || []).map(spec => {
      const nid = nanoid();
      if (spec.id != null) idMap[spec.id] = nid;
      const { id, ...rest } = spec;
      const normalizedRest = rest.category === "circle"
        ? { ...rest, width: rest.width ?? rest.height ?? 80, height: rest.width ?? rest.height ?? 80 }
        : rest;
      return {
        isSelected: false,
        isMove: false,
        isEditing: false,
        locked: normalizedRest.locked ?? false,
        ...normalizedRest,
        page: normalizedRest.page ?? 1,
        element_id: nid,
      };
    });
    return mapped.map(el => el.category === "connector"
      ? { ...el, source_id: idMap[el.source_id] ?? el.source_id, target_id: idMap[el.target_id] ?? el.target_id }
      : el);
  };

  // Replace the canvas with generated/authored specs. `title` is used verbatim;
  // `presetId` (optional) switches the page size (e.g. deck templates).
  const handleLoadAiElements = useCallback((specs, title, presetId) => {
    resetHistory();
    const mapped = materializeSpecs(specs);
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setPageCount(maxPage);
    setCurrentPage(1);
    if (presetId) setPagePreset(presetId);
    if (titleRef?.current && title) {
      titleRef.current.value = title;
    }
  }, [setPagePreset])

  const handleLoadTemplateWithFill = useCallback((templateElements, templateName, fills) => {
    resetHistory();
    // fills use array index as id (String) — match by position, not by element_id
    const fillMap = Object.fromEntries((fills || []).map(f => [f.id, f.content]));
    const withContent = templateElements.map((spec, i) => {
      const aiContent = fillMap[String(i)];
      const useAi = (spec.category === "text" || spec.category === "textarea")
        && aiContent !== undefined && aiContent !== "";
      return { ...spec, content: useAi ? aiContent : spec.content };
    });
    const mapped = materializeSpecs(withContent);
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setPageCount(maxPage);
    setCurrentPage(1);
    if (titleRef?.current && templateName) {
      titleRef.current.value = `${templateName} CV`;
    }
  }, [])

  const handleLoadTemplate = useCallback((templateElements, title, presetId) => {
    resetHistory();
    const mapped = materializeSpecs(templateElements);
    const maxPage = mapped.reduce((m, el) => Math.max(m, el.page ?? 1), 1);
    setA4_Elements(mapped);
    setA4_Elements_deleted([]);
    setPageCount(maxPage);
    setCurrentPage(1);
    if (presetId) setPagePreset(presetId);
    if (titleRef?.current && title) {
      titleRef.current.value = title;
    }
  }, [setPagePreset, resetHistory])


  return {
    A4_Elements,
    setA4_Elements,
    A4_Elements_deleted,
    setA4_Elements_deleted,
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
    handleMoveElementWithBelow,
    A4ref,
    PDFTitle,
    handleResizeElement,
    handleClearA4,
    handleLoadTemplate,
    handleLoadTemplateWithFill,
    handleLoadAiElements,
    // multi-page
    pageCount,
    setPageCount,
    currentPage,
    setCurrentPage,
    addPage: handleAddPage,
    removePage: handleRemovePage,
    goToPage: handleGoToPage,
    clonePage: handleClonePage,
    movePage: handleMovePage,
    // page geometry
    pageSize,
    setPageSize,
    setPagePreset,
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