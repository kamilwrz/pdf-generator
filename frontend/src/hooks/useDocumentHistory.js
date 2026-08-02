/**
 * Session-scoped undo/redo for the A4 document (elements + page count).
 *
 * Snapshots strip volatile UI flags (isSelected/isMove/isEditing). Recording is
 * debounced so a drag or typing burst collapses into one step. Quiet mode
 * replaces the current tip in place — used after load/reflow so Undo does not
 * restore pre-measure heights.
 */
import { useCallback, useEffect, useRef, useState } from "react";

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

  const buildSnapshot = () => ({
    elements: elementsRef.current.map(({ isSelected, isMove, isEditing, ...keep }) => keep),
    pageCount: pageCountRef.current,
  });

  const syncHistoryFlags = () => {
    const { stack, index } = historyRef.current;
    setCanUndo(index > 0);
    setCanRedo(index < stack.length - 1);
  };

  // Extend (never shorten) the quiet window so overlapping reflows stay quiet.
  const markHistoryQuiet = useCallback((ms = HISTORY_QUIET_MS) => {
    historyQuietUntilRef.current = Math.max(
      historyQuietUntilRef.current,
      Date.now() + ms,
    );
  }, []);

  const recordSnapshot = () => {
    const snap = buildSnapshot();
    const h = historyRef.current;
    const quiet = Date.now() < historyQuietUntilRef.current;
    if (quiet) {
      // Reflow / load settle: keep a single mutable baseline (or refresh tip).
      if (h.index < 0 || h.stack.length === 0) {
        historyRef.current = { stack: [snap], index: 0 };
      } else {
        const stack = h.stack.slice(0, h.index + 1);
        stack[h.index] = snap;
        historyRef.current = { stack, index: h.index };
      }
      syncHistoryFlags();
      return;
    }
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
  // While quiet (reflow settle), use a shorter delay so authored→measured height
  // bursts collapse into one in-place baseline update.
  useEffect(() => {
    clearTimeout(historyTimerRef.current);
    const quiet = Date.now() < historyQuietUntilRef.current;
    historyTimerRef.current = setTimeout(recordSnapshot, quiet ? 80 : 350);
    return () => clearTimeout(historyTimerRef.current);
  }, [elements, pageCount]);

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

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applySnapshot(h.stack[h.index]);
    syncHistoryFlags();
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applySnapshot(h.stack[h.index]);
    syncHistoryFlags();
  }, [applySnapshot]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,
    markHistoryQuiet,
  };
}
