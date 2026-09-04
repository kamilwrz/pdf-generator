/**
 * Session-scoped undo/redo for the A4 document (elements + page count).
 *
 * Snapshots strip volatile UI flags (isSelected/isMove/isEditing). Recording is
 * debounced so a drag or typing burst collapses into one step. Quiet mode
 * replaces the current tip in place — used after load/reflow so Undo does not
 * restore pre-measure heights.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { recordSnapshotState } from "../utils/documentHistory";

const HISTORY_LIMIT = 100;
const HISTORY_QUIET_MS = 500;
const HISTORY_LOAD_QUIET_MS = 1200;

/**
 * @param {object} options
 * @param {object[]} options.elements - Current canvas elements (triggers record).
 * @param {number} options.pageCount - Current page count (triggers record).
 * @param {React.MutableRefObject<object[]>} options.elementsRef
 * @param {React.MutableRefObject<number>} options.pageCountRef
 * @param {(updater: any) => void} options.setElements
 * @param {(count: number) => void} options.setPageCount
 * @param {(updater: any) => void} options.setCurrentPage
 */
export function useDocumentHistory({
  elements,
  pageCount,
  elementsRef,
  pageCountRef,
  setElements,
  setPageCount,
  setCurrentPage,
}) {
  const historyRef = useRef({ stack: [], index: -1 });
  const historyTimerRef = useRef(null);
  const historyQuietUntilRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const buildSnapshot = useCallback(() => ({
    elements: elementsRef.current.map((element) => {
      const snapshotElement = { ...element };
      delete snapshotElement.isSelected;
      delete snapshotElement.isMove;
      delete snapshotElement.isEditing;
      return snapshotElement;
    }),
    pageCount: pageCountRef.current,
  }), [elementsRef, pageCountRef]);

  const syncHistoryFlags = useCallback(() => {
    const { stack, index } = historyRef.current;
    setCanUndo(index > 0);
    setCanRedo(index < stack.length - 1);
  }, []);

  // Extend (never shorten) the quiet window so overlapping reflows stay quiet.
  const markHistoryQuiet = useCallback((ms = HISTORY_QUIET_MS) => {
    historyQuietUntilRef.current = Math.max(
      historyQuietUntilRef.current,
      Date.now() + ms,
    );
  }, []);

  const recordSnapshot = useCallback(() => {
    const snap = buildSnapshot();
    // A quiet record is a load/reflow settle: it refreshes the current tip in
    // place and preserves the redo tail. A non-quiet record is a real edit: it
    // pushes a new step and drops the redo tail. Both rules — including the
    // redo-tail preservation that keeps redo usable after an undo — live in the
    // pure `recordSnapshotState` (see `utils/documentHistory.js`).
    const quiet = Date.now() < historyQuietUntilRef.current;
    historyRef.current = recordSnapshotState(historyRef.current, snap, {
      quiet,
      limit: HISTORY_LIMIT,
    });
    syncHistoryFlags();
  }, [buildSnapshot, syncHistoryFlags]);

  // Debounced recorder: coalesces drag frames / keystrokes into a single step.
  // While quiet (reflow settle), use a shorter delay so authored→measured height
  // bursts collapse into one in-place baseline update.
  useEffect(() => {
    clearTimeout(historyTimerRef.current);
    const quiet = Date.now() < historyQuietUntilRef.current;
    historyTimerRef.current = setTimeout(recordSnapshot, quiet ? 80 : 350);
    return () => clearTimeout(historyTimerRef.current);
  }, [elements, pageCount, recordSnapshot]);

  // Wipe history to a fresh baseline (loading a template / AI doc / saved PDF /
  // clearing) so you can't undo BACK into the previous document. Stay quiet
  // long enough for canvas font measure + auto-height reflow to finish.
  const resetHistory = useCallback(() => {
    historyRef.current = { stack: [], index: -1 };
    setCanUndo(false);
    setCanRedo(false);
    markHistoryQuiet(HISTORY_LOAD_QUIET_MS);
  }, [markHistoryQuiet]);

  const applySnapshot = useCallback((snap) => {
    // Applying undo/redo can retrigger textarea measure; keep those adjustments
    // on the restored entry instead of appending a new step.
    markHistoryQuiet();
    setElements(snap.elements.map((el) => ({
      ...el,
      isSelected: false,
      isMove: false,
      isEditing: false,
    })));
    setPageCount(snap.pageCount);
    setCurrentPage((cp) => Math.min(cp, snap.pageCount));
  }, [markHistoryQuiet, setCurrentPage, setElements, setPageCount]);

  /**
   * Record a complete content transaction immediately. Flush pending typing
   * first so a quick AI acceptance cannot swallow the user's preceding edit.
   * Subsequent measurement settles into this step rather than creating another.
   */
  const commitElements = useCallback((nextElements, nextPageCount) => {
    clearTimeout(historyTimerRef.current);
    const before = buildSnapshot();
    const after = { elements: nextElements.map((element) => {
      const next = { ...element };
      delete next.isSelected;
      delete next.isMove;
      delete next.isEditing;
      return next;
    }), pageCount: nextPageCount };
    let history = recordSnapshotState(historyRef.current, before, { limit: HISTORY_LIMIT });
    history = recordSnapshotState(history, after, { limit: HISTORY_LIMIT });
    historyRef.current = history;
    elementsRef.current = nextElements;
    pageCountRef.current = nextPageCount;
    setElements(nextElements);
    setPageCount(nextPageCount);
    setCurrentPage((page) => Math.min(page, nextPageCount));
    markHistoryQuiet();
    syncHistoryFlags();
  }, [buildSnapshot, elementsRef, pageCountRef, setElements, setPageCount, setCurrentPage, markHistoryQuiet, syncHistoryFlags]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applySnapshot(h.stack[h.index]);
    syncHistoryFlags();
  }, [applySnapshot, syncHistoryFlags]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applySnapshot(h.stack[h.index]);
    syncHistoryFlags();
  }, [applySnapshot, syncHistoryFlags]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,
    markHistoryQuiet,
    commitElements,
  };
}
