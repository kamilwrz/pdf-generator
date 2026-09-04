/**
 * Shared structural toolbar rendered in the editing gutter beside an A4 page.
 *
 * Layout metrics are screen pixels. The toolbar never enters export. Its pointer-
 * inert highlight may render independently, while actions stay outside the
 * authored content column and can never be mistaken for PDF content.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiChevronUp, FiMoreHorizontal, FiPlus, FiCpu } from "react-icons/fi";
import { useScopedAi } from "../../../store/scoped-ai-context";
import { SCOPED_AI_ACTIONS } from "../../../utils/scopedAi";
import classes from "./CanvasHoverToolbar.module.css";

/**
 * @param {{
 *   toolbarKey:string,
 *   visible:boolean,
 *   highlightVisible?:boolean,
 *   side?:"left"|"right",
 *   placement?:"gutter"|"below",
 *   anchorX?:number|null,
 *   top:number,
 *   pageWidth:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 *   highlightLevel?:"section"|"entry"|"element"|"skills",
 *   elementHighlight?:{left:number,top:number,width:number,height:number}|null,
 *   elementHighlightSelected?:boolean,
 *   layout:{buttonSize:number,iconSize:number,gap:number,labelWidth:number,fontSize:number,menuWidth:number,offset:number,borderWidth:number},
 *   addLabel?:string,
 *   addTooltip?:string,
 *   onAdd?:() => void,
 *   canMoveUp?:boolean,
 *   canMoveDown?:boolean,
 *   onMoveUp?:() => void,
 *   onMoveDown?:() => void,
 *   menuOpen?:boolean,
 *   onOpenMenu?:() => void,
 *   onCloseMenu?:() => void,
 *   menuItems?:{key:string,label:string,icon?:import("react").ReactNode,danger?:boolean,disabled?:boolean,onSelect:() => void}[],
 *   directActions?:{key:string,label:string,icon:import("react").ReactNode,danger?:boolean,disabled?:boolean,onSelect:() => void}[],
 *   panelContent?:import("react").ReactNode,
 *   collisionAware?:boolean,
 *   toolbarPointerProps?:object,
 *   aiTarget?:{kind:"section"|"entry",headingId?:string,elementId?:string,groupId?:string,memberIds?:string[]},
 * }} props
 */
export default function CanvasHoverToolbar({
  toolbarKey,
  visible: requestedVisible,
  highlightVisible: requestedHighlightVisible = requestedVisible,
  side = "right",
  placement = "gutter",
  anchorX = null,
  top,
  pageWidth,
  highlight = null,
  highlightLevel = "entry",
  elementHighlight = null,
  elementHighlightSelected = false,
  layout,
  addLabel = "",
  addTooltip = "",
  onAdd,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  menuOpen = false,
  onOpenMenu,
  onCloseMenu,
  menuItems = [],
  directActions = [],
  panelContent = null,
  collisionAware = false,
  toolbarPointerProps = {},
  aiTarget = null,
}) {
  const originRef = useRef(null);
  const toolbarRef = useRef(null);
  const [portalGeometry, setPortalGeometry] = useState(null);
  const scopedAi = useScopedAi();
  const visible = requestedVisible && !scopedAi?.isOpen;
  const highlightVisible = requestedHighlightVisible && !scopedAi?.isOpen;
  const [menuKind, setMenuKind] = useState("more");
  const aiTriggerRef = useRef(null);
  const moreTriggerRef = useRef(null);
  const menuRef = useRef(null);
  const activeTriggerRef = menuKind === "ai" ? aiTriggerRef : moreTriggerRef;

  useEffect(() => {
    if (!menuOpen || !visible) return undefined;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector("button:not(:disabled)")?.focus());
    const outside = (event) => {
      if (!toolbarRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) onCloseMenu?.();
    };
    document.addEventListener("pointerdown", outside);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); };
  }, [menuOpen, visible, menuKind, onCloseMenu]);

  // Both action menus use screen coordinates in the portal. Clamp against the
  // viewport independently from the gutter anchor, including at 200% zoom.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = activeTriggerRef.current;
    if (!menuOpen || !menu || !trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.right = "auto";
    menu.style.left = `${Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, anchor.bottom + box.height + 8 <= window.innerHeight
      ? anchor.bottom + 4 : anchor.top - box.height - 4)}px`;
  }, [menuOpen, menuKind, portalGeometry, activeTriggerRef]);

  // The highlight belongs to the scaled A4 page, but the actionable toolbar
  // must escape that page's transform stacking context. Measure a zero-size
  // page marker and reproduce its viewport position in a body portal.
  useLayoutEffect(() => {
    if (!visible) {
      return undefined;
    }

    function updatePortalGeometry() {
      const origin = originRef.current;
      const page = origin?.closest?.("[data-page-canvas]");
      if (!origin || !page) return;
      const originRect = origin.getBoundingClientRect();
      const toolbarRect = toolbarRef.current?.getBoundingClientRect?.();
      const toolbarWidth = toolbarRect?.width || 0;
      const toolbarHeight = toolbarRect?.height || 0;
      let portalLeft = originRect.left;
      let portalTop = originRect.top;
      if (placement === "below" && toolbarWidth > 0) {
        portalLeft -= toolbarWidth / 2;
        if (collisionAware) {
          const viewportInset = 8;
          portalLeft = Math.max(
            viewportInset,
            Math.min(portalLeft, window.innerWidth - toolbarWidth - viewportInset),
          );
          if (
            portalTop + toolbarHeight + viewportInset > window.innerHeight
            && originRect.top - toolbarHeight - 36 >= viewportInset
          ) {
            portalTop = originRect.top - toolbarHeight - 36;
          }
        }
      }
      const next = { left: portalLeft, top: portalTop };
      setPortalGeometry((previous) => (
        previous
          && previous.left === next.left
          && previous.top === next.top
          ? previous
          : next
      ));
    }

    updatePortalGeometry();
    // The first pass runs before the portal mounts. The next animation frame
    // can use the panel's real dimensions for exact centring and collision.
    const measurementFrame = window.requestAnimationFrame(updatePortalGeometry);
    const origin = originRef.current;
    const page = origin?.closest?.("[data-page-canvas]");
    const canvasArea = origin?.closest?.(".canvas-area") || document.querySelector(".canvas-area");
    const canvasHost = origin?.closest?.(".canvas-single, .canvas-spread");
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePortalGeometry)
      : null;
    let trackingFrame = null;
    const trackCanvasTransition = (event) => {
      if (![canvasHost, page].includes(event.target) || event.propertyName !== "transform") return;
      const updateUntilTransitionEnds = () => {
        updatePortalGeometry();
        trackingFrame = window.requestAnimationFrame(updateUntilTransitionEnds);
      };
      if (trackingFrame == null) updateUntilTransitionEnds();
    };
    const stopCanvasTransitionTracking = (event) => {
      if (![canvasHost, page].includes(event.target) || event.propertyName !== "transform") return;
      if (trackingFrame != null) window.cancelAnimationFrame(trackingFrame);
      trackingFrame = null;
      updatePortalGeometry();
    };
    if (page) resizeObserver?.observe(page);
    // Validation can grow an open form without changing its anchor. Recheck
    // its bounds so the submit action and error stay inside the viewport.
    if (toolbarRef.current) resizeObserver?.observe(toolbarRef.current);
    window.addEventListener("resize", updatePortalGeometry);
    window.addEventListener("scroll", updatePortalGeometry, true);
    canvasArea?.addEventListener("scroll", updatePortalGeometry, { passive: true });
    page?.addEventListener("transitionrun", trackCanvasTransition);
    page?.addEventListener("transitionend", stopCanvasTransitionTracking);
    page?.addEventListener("transitioncancel", stopCanvasTransitionTracking);
    // The toolbar is portalled to <body>, so it does not inherit the A4 host's
    // transform. Follow page zoom and assistant-open transitions frame by frame
    // so a pinned keyboard toolbar stays attached while retaining its size.
    canvasHost?.addEventListener("transitionrun", trackCanvasTransition);
    canvasHost?.addEventListener("transitionend", stopCanvasTransitionTracking);
    canvasHost?.addEventListener("transitioncancel", stopCanvasTransitionTracking);
    return () => {
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(measurementFrame);
      if (trackingFrame != null) window.cancelAnimationFrame(trackingFrame);
      window.removeEventListener("resize", updatePortalGeometry);
      window.removeEventListener("scroll", updatePortalGeometry, true);
      canvasArea?.removeEventListener("scroll", updatePortalGeometry);
      page?.removeEventListener("transitionrun", trackCanvasTransition);
      page?.removeEventListener("transitionend", stopCanvasTransitionTracking);
      page?.removeEventListener("transitioncancel", stopCanvasTransitionTracking);
      canvasHost?.removeEventListener("transitionrun", trackCanvasTransition);
      canvasHost?.removeEventListener("transitionend", stopCanvasTransitionTracking);
      canvasHost?.removeEventListener("transitioncancel", stopCanvasTransitionTracking);
    };
  }, [visible, side, placement, anchorX, top, pageWidth, layout, collisionAware]);

  if (!visible && !highlightVisible) return null;

  // Explicit page-local anchors let a structural toolbar follow its semantic
  // element. Callers without one retain the original A4-edge positioning.
  const resolvedAnchorX = anchorX != null && Number.isFinite(Number(anchorX))
    ? Number(anchorX)
    : (side === "left" ? 0 : pageWidth);
  const originStyle = { left: resolvedAnchorX, top };
  // Only the anchor follows A4. Multiplying inverse-zoom dimensions by a live
  // transform scale made controls shrink/grow during edit-zoom transitions.
  // Portals consume the shared metrics at zoom=1, including text and menus.
  const screenValue = (value) => `${value}px`;
  const portalStyle = portalGeometry ? {
    left: portalGeometry.left,
    top: portalGeometry.top,
    "--canvas-control-size": screenValue(layout.buttonSize),
    "--canvas-control-icon": screenValue(layout.iconSize),
    "--canvas-control-gap": screenValue(layout.gap),
    "--canvas-control-label-width": screenValue(layout.labelWidth),
    "--canvas-control-font": screenValue(layout.fontSize),
    "--canvas-control-menu-width": screenValue(layout.menuWidth),
    "--canvas-control-offset": screenValue(layout.offset),
    "--canvas-control-border": screenValue(layout.borderWidth),
  } : null;

  const runAction = (event, action) => {
    event.stopPropagation();
    event.preventDefault();
    action?.();
  };
  const hasDirectActions = directActions.length > 0;
  const aiButton = aiTarget && scopedAi?.isAvailable ? (
    <button ref={aiTriggerRef} type="button" className={classes.control}
      aria-label="AI dla wybranego zakresu" data-tooltip="AI dla wybranego zakresu"
      aria-expanded={menuOpen && menuKind === "ai"} aria-haspopup="menu"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => runAction(event, () => {
        if (menuOpen && menuKind === "ai") onCloseMenu?.();
        else { setMenuKind("ai"); onOpenMenu?.(); }
      })}><FiCpu aria-hidden="true" /></button>
  ) : null;
  const activeMenuItems = menuKind === "ai" ? SCOPED_AI_ACTIONS.map((action) => ({
    key: action.id, label: action.label, onSelect: () => {
      onCloseMenu?.();
      scopedAi?.open(aiTarget, action.id, aiTriggerRef.current);
    },
  })) : menuItems;
  const actionMenu = menuOpen && activeMenuItems.length > 0 && (menuKind !== "ai" || scopedAi?.isAvailable) ? (
    <div ref={menuRef} className={classes.menu} role="menu" aria-label={menuKind === "ai" ? "Operacje AI" : "Więcej działań"}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); onCloseMenu?.(); activeTriggerRef.current?.focus();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const items = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
          const current = items.indexOf(document.activeElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        } else if (event.key === "Tab") onCloseMenu?.();
      }}>
      {activeMenuItems.map((item) => <button key={item.key} type="button" role="menuitem"
        className={`${classes.menuItem}${item.danger ? ` ${classes.menuItemDanger}` : ""}`}
        disabled={item.disabled} onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => runAction(event, item.onSelect)}>
        {item.icon ? <span className={classes.menuIcon}>{item.icon}</span> : null}<span>{item.label}</span>
      </button>)}
    </div>
  ) : null;
  const highlightLevelClass = highlightLevel === "section"
    ? classes.highlightSection
    : highlightLevel === "skills"
      ? classes.highlightSkills
    : highlightLevel === "element"
      ? classes.highlightElement
      : classes.highlightEntry;

  return (
    <>
      {highlightVisible && highlight ? (
        <div
          className={`${classes.highlight} ${highlightLevelClass}`}
          data-canvas-highlight-level={highlightLevel}
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
          }}
          aria-hidden="true"
        />
      ) : null}

      {elementHighlight ? (
        <div
          className={`${classes.elementHighlight}${elementHighlightSelected
            ? ` ${classes.elementHighlightSelected}`
            : ""}`}
          style={{
            left: elementHighlight.left,
            top: elementHighlight.top,
            width: elementHighlight.width,
            height: elementHighlight.height,
          }}
          aria-hidden="true"
        />
      ) : null}

      {visible ? (
        <span ref={originRef} className={classes.origin} style={originStyle} aria-hidden="true" />
      ) : null}

      {visible && portalStyle && typeof document !== "undefined" ? createPortal(
        <div
          className={`${classes.portalAnchor}${placement === "below" ? ` ${classes.portalAnchorBelow}` : ""}`}
          style={portalStyle}
          data-editor-control="true"
          data-canvas-toolbar-key={toolbarKey}
          {...toolbarPointerProps}
        >
          <div ref={toolbarRef} className={`${classes.toolbar}${panelContent ? ` ${classes.panelToolbar}` : ""} ${placement === "below"
            ? classes.below
            : side === "left"
              ? classes.left
              : classes.right}`}>
            {panelContent || (hasDirectActions ? <>{directActions.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${classes.control}${item.danger ? ` ${classes.directActionDanger}` : ""}`}
                data-tooltip={item.label}
                aria-label={item.label}
                disabled={item.disabled}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => runAction(event, item.onSelect)}
              >
                {item.icon}
              </button>
            ))}{aiButton}</> : (
              <>
                <button
                  type="button"
                  className={`${classes.control} ${classes.addControl}`}
                  data-tooltip={addTooltip}
                  aria-label={addTooltip}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => runAction(event, onAdd)}
                >
                  <FiPlus aria-hidden="true" />
                  <span>{addLabel}</span>
                </button>

                <span className={classes.separator} aria-hidden="true" />

                <button
                  type="button"
                  className={classes.control}
                  data-tooltip="Przenieś wyżej"
                  aria-label="Przenieś wyżej"
                  disabled={!canMoveUp}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => runAction(event, onMoveUp)}
                >
                  <FiChevronUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={classes.control}
                  data-tooltip="Przenieś niżej"
                  aria-label="Przenieś niżej"
                  disabled={!canMoveDown}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => runAction(event, onMoveDown)}
                >
                  <FiChevronDown aria-hidden="true" />
                </button>

                {aiButton}
                <button
                  ref={moreTriggerRef}
                  type="button"
                  className={classes.control}
                  data-tooltip="Więcej działań"
                  aria-label="Więcej działań"
                  aria-expanded={menuOpen && menuKind === "more"}
                  aria-haspopup="menu"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => runAction(event, () => {
                    if (menuOpen && menuKind === "more") onCloseMenu?.();
                    else { setMenuKind("more"); onOpenMenu?.(); }
                  })}
                >
                  <FiMoreHorizontal aria-hidden="true" />
                </button>

              </>
            ))}
          </div>
          {actionMenu}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
