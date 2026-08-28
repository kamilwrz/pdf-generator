/**
 * Shared structural toolbar rendered in the editing gutter beside an A4 page.
 *
 * The toolbar never participates in document layout or export. Its highlight
 * is pointer-inert, while actions live outside the authored content column so
 * they cannot cover text or be mistaken for PDF content.
 */
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
  if (!visible) return null;

  const anchorStyle = {
    left: side === "left" ? 0 : pageWidth,
    top,
    "--canvas-control-size": `${layout.buttonSize}px`,
    "--canvas-control-icon": `${layout.iconSize}px`,
    "--canvas-control-gap": `${layout.gap}px`,
    "--canvas-control-label-width": `${layout.labelWidth}px`,
    "--canvas-control-font": `${layout.fontSize}px`,
    "--canvas-control-menu-width": `${layout.menuWidth}px`,
    "--canvas-control-offset": `${layout.offset}px`,
    "--canvas-control-border": `${layout.borderWidth}px`,
  };

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

      <div
        className={classes.anchor}
        style={anchorStyle}
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
      </div>
    </>
  );
}
