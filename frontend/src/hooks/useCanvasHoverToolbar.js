/**
 * Shared hover/pin lifecycle for structural controls painted around the A4.
 *
 * The hook deliberately listens to the rendered canvas nodes instead of
 * changing their component contracts. This keeps the PDF element DOM stable
 * while section and record affordances share identical timing and exclusivity.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { useHoverPlusExclusive } from "./useHoverPlusExclusive";
import {
  CANVAS_TOOLBAR_INITIAL_STATE,
  reduceCanvasHoverToolbarState,
} from "../utils/canvasHoverToolbarState";

/** Short grace period for crossing from A4 content into its gutter toolbar. */
const HIDE_AFTER_LEAVE_MS = 420;

/**
 * @param {{exclusiveKey:string,eligible:boolean,triggerIds:string[]}} options
 * @returns {{
 *   visible:boolean,
 *   pinned:boolean,
 *   menuOpen:boolean,
 *   toolbarPointerProps:object,
 *   hide:() => void,
 *   openMenu:() => void,
 *   closeMenu:() => void,
 * }}
 */
export function useCanvasHoverToolbar({ exclusiveKey, eligible, triggerIds }) {
  const [state, dispatch] = useReducer(
    reduceCanvasHoverToolbarState,
    CANVAS_TOOLBAR_INITIAL_STATE,
  );
  const stateRef = useRef(state);
  const hideTimerRef = useRef(null);
  const { isExclusiveActive, claimExclusive, releaseExclusive } = useHoverPlusExclusive(
    exclusiveKey,
  );
  // Editor element ids use the Nano ID URL alphabet, so `|` is a safe local
  // separator. The derived primitive keeps listener effects stable when a
  // caller creates an equivalent trigger array during render.
  const triggerKey = [...new Set(triggerIds)].join("|");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current == null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const show = useCallback(() => {
    if (!eligible) return;
    clearHideTimer();
    claimExclusive();
    dispatch({ type: "SHOW" });
  }, [claimExclusive, clearHideTimer, eligible]);

  const pin = useCallback(() => {
    if (!eligible) return;
    clearHideTimer();
    claimExclusive();
    dispatch({ type: "PIN" });
  }, [claimExclusive, clearHideTimer, eligible]);

  const hide = useCallback(() => {
    clearHideTimer();
    dispatch({ type: "RESET" });
    releaseExclusive();
  }, [clearHideTimer, releaseExclusive]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (stateRef.current.pinned || stateRef.current.menuOpen) return;
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      dispatch({ type: "HIDE_IF_TRANSIENT" });
      if (!stateRef.current.pinned && !stateRef.current.menuOpen) {
        releaseExclusive();
      }
    }, HIDE_AFTER_LEAVE_MS);
  }, [clearHideTimer, releaseExclusive]);

  const openMenu = useCallback(() => {
    if (!eligible) return;
    clearHideTimer();
    claimExclusive();
    dispatch({ type: "OPEN_MENU" });
  }, [claimExclusive, clearHideTimer, eligible]);

  const closeMenu = useCallback(() => {
    dispatch({ type: "CLOSE_MENU" });
  }, []);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    if (!eligible) hide();
  }, [eligible, hide]);

  // Another structural control claimed the single canvas slot. Clear both the
  // transient and pinned states so two toolbars never compete around the page.
  useEffect(() => {
    if (!isExclusiveActive && state.visible) {
      clearHideTimer();
      dispatch({ type: "RESET" });
    }
  }, [clearHideTimer, isExclusiveActive, state.visible]);

  useEffect(() => {
    if (!eligible) return undefined;
    const nodes = triggerKey.split("|").filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (nodes.length === 0) return undefined;

    const onEnter = () => show();
    const onLeave = () => scheduleHide();
    const onClick = () => pin();
    // A text-edit double click hands control to the contentEditable surface;
    // structural chrome must disappear before the edit toolbar takes over.
    const onDoubleClick = () => hide();

    nodes.forEach((node) => {
      node.addEventListener("pointerenter", onEnter);
      node.addEventListener("pointerleave", onLeave);
      node.addEventListener("click", onClick);
      node.addEventListener("dblclick", onDoubleClick);
    });
    return () => {
      nodes.forEach((node) => {
        node.removeEventListener("pointerenter", onEnter);
        node.removeEventListener("pointerleave", onLeave);
        node.removeEventListener("click", onClick);
        node.removeEventListener("dblclick", onDoubleClick);
      });
    };
  }, [eligible, hide, pin, scheduleHide, show, triggerKey]);

  useEffect(() => {
    if (!state.pinned) return undefined;
    const onOutsidePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[data-canvas-toolbar-key="${exclusiveKey}"]`)) return;
      const targetIsTrigger = triggerKey.split("|").filter(Boolean)
        .some((id) => document.getElementById(id)?.contains(target));
      if (targetIsTrigger) return;
      hide();
    };
    document.addEventListener("pointerdown", onOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", onOutsidePointerDown);
  }, [exclusiveKey, hide, state.pinned, triggerKey]);

  return {
    visible: state.visible && isExclusiveActive,
    pinned: state.pinned,
    menuOpen: state.menuOpen,
    toolbarPointerProps: {
      onPointerEnter: show,
      onPointerLeave: scheduleHide,
    },
    hide,
    openMenu,
    closeMenu,
  };
}
