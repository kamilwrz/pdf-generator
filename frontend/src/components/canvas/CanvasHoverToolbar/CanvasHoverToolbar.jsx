/**
 * Shared structural toolbar rendered in the editing gutter beside an A4 page.
 *
 * The toolbar never participates in document layout or export. Its pointer-
 * inert highlight may render independently, while actions stay outside the
 * authored content column and can never be mistaken for PDF content.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiChevronUp, FiMoreHorizontal, FiPlus } from "react-icons/fi";
import classes from "./CanvasHoverToolbar.module.css";

/**
 * @param {{
 *   toolbarKey:string,
 *   visible:boolean,
 *   highlightVisible?:boolean,
 *   side?:"left"|"right",
 *   anchorX?:number|null,
 *   top:number,
 *   pageWidth:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 *   highlightLevel?:"section"|"entry"|"element",
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
 *   toolbarPointerProps?:object,
 * }} props
 */
export default function CanvasHoverToolbar({
  toolbarKey,
  visible,
  highlightVisible = visible,
  side = "right",
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
  toolbarPointerProps = {},
}) {
  const originRef = useRef(null);
  const [portalGeometry, setPortalGeometry] = useState(null);

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
      const pageRect = page.getBoundingClientRect();
      const pageWidthInLayout = page.offsetWidth || pageRect.width;
      const scale = pageWidthInLayout > 0 ? pageRect.width / pageWidthInLayout : 1;
      const next = { left: originRect.left, top: originRect.top, scale };
      setPortalGeometry((previous) => (
        previous
          && previous.left === next.left
          && previous.top === next.top
          && previous.scale === next.scale
          ? previous
          : next
      ));
    }

    updatePortalGeometry();
    const origin = originRef.current;
    const page = origin?.closest?.("[data-page-canvas]");
    const canvasArea = origin?.closest?.(".canvas-area") || document.querySelector(".canvas-area");
    const canvasHost = origin?.closest?.(".canvas-single, .canvas-spread");
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePortalGeometry)
      : null;
    let trackingFrame = null;
    const trackCanvasTransition = (event) => {
      if (event.target !== canvasHost || event.propertyName !== "transform") return;
      const updateUntilTransitionEnds = () => {
        updatePortalGeometry();
        trackingFrame = window.requestAnimationFrame(updateUntilTransitionEnds);
      };
      if (trackingFrame == null) updateUntilTransitionEnds();
    };
    const stopCanvasTransitionTracking = (event) => {
      if (event.target !== canvasHost || event.propertyName !== "transform") return;
      if (trackingFrame != null) window.cancelAnimationFrame(trackingFrame);
      trackingFrame = null;
      updatePortalGeometry();
    };
    if (page) resizeObserver?.observe(page);
    window.addEventListener("resize", updatePortalGeometry);
    window.addEventListener("scroll", updatePortalGeometry, true);
    canvasArea?.addEventListener("scroll", updatePortalGeometry, { passive: true });
    page?.addEventListener("transitionend", updatePortalGeometry);
    // The toolbar is portalled to <body>, so it does not inherit the A4 host's
    // transform. Follow the short assistant-open transition frame-by-frame;
    // otherwise a pinned keyboard toolbar would briefly remain at stale X.
    canvasHost?.addEventListener("transitionrun", trackCanvasTransition);
    canvasHost?.addEventListener("transitionend", stopCanvasTransitionTracking);
    canvasHost?.addEventListener("transitioncancel", stopCanvasTransitionTracking);
    return () => {
      resizeObserver?.disconnect();
      if (trackingFrame != null) window.cancelAnimationFrame(trackingFrame);
      window.removeEventListener("resize", updatePortalGeometry);
      window.removeEventListener("scroll", updatePortalGeometry, true);
      canvasArea?.removeEventListener("scroll", updatePortalGeometry);
      page?.removeEventListener("transitionend", updatePortalGeometry);
      canvasHost?.removeEventListener("transitionrun", trackCanvasTransition);
      canvasHost?.removeEventListener("transitionend", stopCanvasTransitionTracking);
      canvasHost?.removeEventListener("transitioncancel", stopCanvasTransitionTracking);
    };
  }, [visible, side, anchorX, top, pageWidth, layout]);

  if (!visible && !highlightVisible) return null;

  // Explicit page-local anchors let a structural toolbar follow its semantic
  // element. Callers without one retain the original A4-edge positioning.
  const resolvedAnchorX = anchorX != null && Number.isFinite(Number(anchorX))
    ? Number(anchorX)
    : (side === "left" ? 0 : pageWidth);
  const originStyle = { left: resolvedAnchorX, top };
  const screenValue = (value) => `${value * (portalGeometry?.scale ?? 1)}px`;
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
  const highlightLevelClass = highlightLevel === "section"
    ? classes.highlightSection
    : highlightLevel === "element"
      ? classes.highlightElement
      : classes.highlightEntry;

  return (
    <>
      {highlightVisible && highlight ? (
        <div
          className={`${classes.highlight} ${highlightLevelClass}`}
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
          className={classes.portalAnchor}
          style={portalStyle}
          data-editor-control="true"
          data-canvas-toolbar-key={toolbarKey}
          {...toolbarPointerProps}
        >
          <div className={`${classes.toolbar} ${side === "left" ? classes.left : classes.right}`}>
            {hasDirectActions ? directActions.map((item) => (
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
            )) : (
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

                <button
                  type="button"
                  className={`${classes.control}${menuOpen ? ` ${classes.controlActive}` : ""}`}
                  data-tooltip="Więcej działań"
                  aria-label="Więcej działań"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => runAction(event, menuOpen ? onCloseMenu : onOpenMenu)}
                >
                  <FiMoreHorizontal aria-hidden="true" />
                </button>

                {menuOpen ? (
                  <div className={classes.menu} role="menu">
                    {menuItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        className={`${classes.menuItem}${item.danger ? ` ${classes.menuItemDanger}` : ""}`}
                        disabled={item.disabled}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => runAction(event, item.onSelect)}
                      >
                        {item.icon ? <span className={classes.menuIcon}>{item.icon}</span> : null}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
