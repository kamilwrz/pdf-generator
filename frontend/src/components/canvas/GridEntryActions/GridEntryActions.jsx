/**
 * Direct structural actions for one editable cell in a repeatable grid section.
 *
 * The cell itself remains authored CV content. Hovering it, focusing it, or
 * pressing Shift+F10 reveals exactly two application-only controls in the A4
 * gutter: insert a sibling after this cell and remove this cell. The shared
 * toolbar portal keeps those controls out of document layout and PDF export.
 */
import { useEffect } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { useCanvasDeletionUndo } from "../../../hooks/useCanvasDeletionUndo";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import {
  resolveStructuralToolbarSide,
  structuralToolbarLayoutSize,
} from "../recordPlusSize";
import CanvasHoverToolbar from "../CanvasHoverToolbar/CanvasHoverToolbar";

/**
 * @param {{
 *   elementId:string,
 *   left:number,
 *   top:number,
 *   width?:number,
 *   height?:number,
 *   fontSize?:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 *   gutterSide?:"left"|"right"|null,
 *   spreadSide?:"left"|"right"|null,
 *   canDelete?:boolean,
 * }} props
 */
export default function GridEntryActions({
  elementId,
  left,
  top,
  width = 0,
  height = 0,
  fontSize = 10,
  highlight = null,
  gutterSide = null,
  spreadSide = null,
  canDelete = true,
}) {
  const {
    A4_Elements,
    pageSize,
    editorMode,
    addGridSectionEntry,
    removeGridSectionEntry,
    zoom = 1,
  } = useCanvasContext();
  const deleteWithUndo = useCanvasDeletionUndo();
  const entry = A4_Elements.find((element) => element.element_id === elementId);
  // Textarea grid members are repeatable short entries (Languages and custom
  // grid sections). Skill chips also use `grid-member`, but their text labels
  // are paired with rectangles and must keep their dedicated layout controls.
  const eligible = editorMode === EDITOR_MODE_TEMPLATE
    && entry?.category === "textarea"
    && entry?.flowRole === "grid-member";
  const exclusiveKey = `grid-entry:${elementId}`;
  const triggerRevision = [
    entry?.element_id,
    Boolean(entry?.isSelected),
    Boolean(entry?.isEditing),
  ].join(":");
  const {
    visible,
    hoveredTriggerId,
    toolbarPointerProps,
    hide,
    openMenu,
  } = useCanvasHoverToolbar({
    exclusiveKey,
    eligible,
    triggerIds: [elementId],
    triggerRevision,
  });

  // A portalled toolbar is not adjacent to the cell in DOM tab order. Expose
  // the standard context-action shortcut and move focus into its first button,
  // giving keyboard users the same two actions available on pointer hover.
  useEffect(() => {
    if (!eligible) return undefined;
    const trigger = document.getElementById(elementId);
    if (!trigger) return undefined;
    const previousShortcut = trigger.getAttribute("aria-keyshortcuts");
    trigger.setAttribute("aria-keyshortcuts", "Shift+F10");

    const focusDirectActions = (event) => {
      const requestsActions = event.key === "ContextMenu"
        || (event.key === "F10" && event.shiftKey);
      if (!requestsActions) return;
      event.preventDefault();
      openMenu();
      window.requestAnimationFrame(() => {
        document.querySelector(
          `[data-canvas-toolbar-key="${exclusiveKey}"] button:not(:disabled)`,
        )?.focus({ preventScroll: true });
      });
    };
    trigger.addEventListener("keydown", focusDirectActions);
    return () => {
      trigger.removeEventListener("keydown", focusDirectActions);
      if (previousShortcut == null) trigger.removeAttribute("aria-keyshortcuts");
      else trigger.setAttribute("aria-keyshortcuts", previousShortcut);
    };
  }, [eligible, elementId, exclusiveKey, openMenu, triggerRevision]);

  if (!eligible) return null;

  const layout = structuralToolbarLayoutSize(zoom);
  const boxWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : 120;
  const boxHeight = Number.isFinite(Number(height)) && Number(height) > 0
    ? Number(height)
    : Math.max(Number(fontSize) || 10, 12);
  const resolvedHighlight = highlight || {
    left: Number(left) || 0,
    top: Number(top) || 0,
    width: boxWidth,
    height: boxHeight,
  };
  const toolbarTop = (Number(top) || 0) + boxHeight / 2 - layout.buttonSize / 2;
  // Keep every cell in one section on its lane's outer edge. Choosing by the
  // individual cell midpoint would make the toolbar jump from left to right
  // while the pointer crosses columns in the same grid.
  const preferredSide = gutterSide === "left" || gutterSide === "right"
    ? gutterSide
    : ((Number(left) || 0) < (pageSize?.width ?? 595) / 2 ? "left" : "right");
  const side = resolveStructuralToolbarSide(preferredSide, spreadSide);
  const entryLabel = String(entry?.content || "").trim();
  // A grid cell is both the structural target and the exact edited element, so
  // the section/record pattern of painting two nested depth cues would draw
  // the same boundary twice. SelectionOverlay and the editable textarea own
  // selected/editing states; keyboard focus keeps the thin edit outline. Paint
  // this one context shadow only while the pointer is over the entry.
  const hasPersistentStateFrame = Boolean(entry?.isSelected || entry?.isEditing);
  const hoverHighlight = !hasPersistentStateFrame
    && hoveredTriggerId === elementId
    ? resolvedHighlight
    : null;
  const directActions = [
    {
      key: "add",
      label: "Dodaj wpis",
      icon: <FiPlus aria-hidden="true" />,
      disabled: typeof addGridSectionEntry !== "function",
      onSelect: () => {
        addGridSectionEntry?.(elementId);
        hide();
      },
    },
    {
      key: "delete",
      label: "Usuń wpis",
      icon: <FiTrash2 aria-hidden="true" />,
      danger: true,
      disabled: !canDelete || typeof removeGridSectionEntry !== "function",
      onSelect: () => {
        deleteWithUndo({
          title: entryLabel ? `Usunięto wpis „${entryLabel}”` : "Usunięto wpis",
          msg: "Możesz natychmiast przywrócić wpis wraz z jego treścią.",
          remove: () => removeGridSectionEntry?.(elementId),
        });
        hide();
      },
    },
  ];
  const directToolbarPointerProps = {
    ...toolbarPointerProps,
    onKeyDownCapture: (event) => {
      toolbarPointerProps.onKeyDownCapture?.(event);
      if (event.key !== "Escape") return;
      event.preventDefault();
      hide();
      document.getElementById(elementId)?.focus({ preventScroll: true });
    },
  };

  return (
    <CanvasHoverToolbar
      toolbarKey={exclusiveKey}
      visible={visible}
      side={side}
      top={toolbarTop}
      pageWidth={pageSize?.width ?? 595}
      highlight={hoverHighlight}
      highlightLevel="entry"
      layout={layout}
      directActions={directActions}
      toolbarPointerProps={directToolbarPointerProps}
    />
  );
}
