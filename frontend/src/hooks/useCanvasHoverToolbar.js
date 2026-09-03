/**
 * Shared hover/menu lifecycle for structural controls painted around the A4.
 *
 * The hook deliberately listens to the rendered canvas nodes instead of
 * changing their component contracts. This keeps the PDF element DOM stable
 * while section and record affordances share identical timing and exclusivity.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useHoverPlusExclusive } from "./useHoverPlusExclusive";
import {
  CANVAS_TOOLBAR_HIDE_DELAY_MS,
  CANVAS_TOOLBAR_INITIAL_STATE,
  reduceCanvasHoverToolbarState,
} from "../utils/canvasHoverToolbarState";

/**
 * @param {{
 *   exclusiveKey:string,
 *   eligible:boolean,
 *   triggerIds:string[],
 *   triggerRevision?:string,
 * }} options
 * @returns {{
 *   visible:boolean,
 *   pinned:boolean,
 *   menuOpen:boolean,
 *   hoveredTriggerId:string|null,
 *   toolbarPointerProps:object,
 *   hide:() => void,
 *   openMenu:() => void,
 *   closeMenu:() => void,
 * }}
 */
export function useCanvasHoverToolbar({
  exclusiveKey,
  eligible,
  triggerIds,
  triggerRevision = "",
}) {
  const [state, dispatch] = useReducer(
    reduceCanvasHoverToolbarState,
    CANVAS_TOOLBAR_INITIAL_STATE,
  );
  // The hovered element is transient editor chrome only. Keeping its id out of
  // A4_Elements prevents hover from opening the inspector, entering history,
  // or disturbing a real multi-selection.
  const [hoveredTriggerId, setHoveredTriggerId] = useState(null);
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
    }, CANVAS_TOOLBAR_HIDE_DELAY_MS);
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

    const listeners = nodes.map((node) => {
      const elementId = node.id;
      const onPointerEnter = () => {
        setHoveredTriggerId(elementId);
        show();
      };
      const onPointerLeave = () => {
        setHoveredTriggerId((current) => (current === elementId ? null : current));
        scheduleHide();
      };
      // Keyboard focus reveals the structural context too. The focused node's
      // Native focus-visible outline remains blue, so the pointer-hover depth
      // cue is intentionally not duplicated for keyboard users.
      const onFocusIn = () => show();
      const onFocusOut = () => scheduleHide();
      node.addEventListener("pointerenter", onPointerEnter);
      node.addEventListener("pointerleave", onPointerLeave);
      node.addEventListener("focusin", onFocusIn);
      node.addEventListener("focusout", onFocusOut);
      return { node, onPointerEnter, onPointerLeave, onFocusIn, onFocusOut };
    });
    return () => {
      listeners.forEach(({ node, onPointerEnter, onPointerLeave, onFocusIn, onFocusOut }) => {
        node.removeEventListener("pointerenter", onPointerEnter);
        node.removeEventListener("pointerleave", onPointerLeave);
        node.removeEventListener("focusin", onFocusIn);
        node.removeEventListener("focusout", onFocusOut);
      });
    };
    // Textarea swaps its display node for a distinct contentEditable node when
    // selection enters edit mode. `triggerRevision` makes this effect detach
    // from the retired node and bind the same id on the newly committed node,
    // so selecting a field cannot silently disable record/section hover.
  }, [eligible, scheduleHide, show, triggerKey, triggerRevision]);

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
    hoveredTriggerId: eligible && isExclusiveActive && state.visible
      ? hoveredTriggerId
      : null,
    toolbarPointerProps: {
      onPointerEnter: show,
      onPointerLeave: scheduleHide,
      onFocusCapture: show,
      onBlurCapture: scheduleHide,
    },
    hide,
    openMenu,
    closeMenu,
  };
}
