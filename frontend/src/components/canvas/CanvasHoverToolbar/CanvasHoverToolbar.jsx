/**
 * Shared structural toolbar rendered in the editing gutter beside an A4 page.
 *
 * The toolbar never participates in document layout or export. Its highlight
 * is pointer-inert, while actions live outside the authored content column so
 * they cannot cover text or be mistaken for PDF content.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiChevronUp, FiMoreHorizontal, FiPlus } from "react-icons/fi";
import classes from "./CanvasHoverToolbar.module.css";

/**
 * @param {{
 *   toolbarKey:string,
 *   visible:boolean,
 *   pinned:boolean,
 *   side?:"left"|"right",
 *   top:number,
 *   pageWidth:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 *   elementHighlight?:{left:number,top:number,width:number,height:number}|null,
 *   layout:{buttonSize:number,iconSize:number,gap:number,labelWidth:number,fontSize:number,menuWidth:number,offset:number,borderWidth:number},
 *   addLabel:string,
 *   addTooltip:string,
 *   onAdd:() => void,
 *   canMoveUp?:boolean,
 *   canMoveDown?:boolean,
 *   onMoveUp?:() => void,
 *   onMoveDown?:() => void,
 *   menuOpen:boolean,
 *   onOpenMenu:() => void,
 *   onCloseMenu:() => void,
 *   menuItems?:{key:string,label:string,icon?:import("react").ReactNode,danger?:boolean,disabled?:boolean,onSelect:() => void}[],
 *   toolbarPointerProps?:object,
 * }} props
 */
export default function CanvasHoverToolbar({
  toolbarKey,
  visible,
  pinned,
  side = "right",
  top,
  pageWidth,
  highlight = null,
  elementHighlight = null,
  layout,
  addLabel,
  addTooltip,
  onAdd,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  menuItems = [],
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
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePortalGeometry)
      : null;
    if (page) resizeObserver?.observe(page);
    window.addEventListener("resize", updatePortalGeometry);
    window.addEventListener("scroll", updatePortalGeometry, true);
    canvasArea?.addEventListener("scroll", updatePortalGeometry, { passive: true });
    page?.addEventListener("transitionend", updatePortalGeometry);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePortalGeometry);
      window.removeEventListener("scroll", updatePortalGeometry, true);
      canvasArea?.removeEventListener("scroll", updatePortalGeometry);
      page?.removeEventListener("transitionend", updatePortalGeometry);
    };
  }, [visible, side, top, pageWidth, layout]);

  if (!visible) return null;

  const originStyle = { left: side === "left" ? 0 : pageWidth, top };
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

  return (
    <>
      {highlight ? (
        <div
          className={`${classes.highlight}${pinned ? ` ${classes.highlightPinned}` : ""}`}
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
            borderWidth: layout.borderWidth,
          }}
          aria-hidden="true"
        />
      ) : null}

      {elementHighlight ? (
        <div
          className={classes.elementHighlight}
          style={{
            left: elementHighlight.left,
            top: elementHighlight.top,
            width: elementHighlight.width,
            height: elementHighlight.height,
            borderWidth: layout.borderWidth,
          }}
          aria-hidden="true"
        />
      ) : null}

      <span ref={originRef} className={classes.origin} style={originStyle} aria-hidden="true" />

      {portalStyle && typeof document !== "undefined" ? createPortal(
        <div
          className={classes.portalAnchor}
          style={portalStyle}
          data-editor-control="true"
          data-canvas-toolbar-key={toolbarKey}
          {...toolbarPointerProps}
        >
          <div className={`${classes.toolbar} ${side === "left" ? classes.left : classes.right}`}>
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
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
