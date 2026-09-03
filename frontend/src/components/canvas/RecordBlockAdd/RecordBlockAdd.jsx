/**
 * Contextual structural toolbar for one template-mode record.
 *
 * Hovering any current-page record field reveals a grouped toolbar in the
 * nearest A4 gutter plus an inner frame around the exact title, metadata, or
 * description field. A single click edits text, while description/record
 * removals remain recoverable through the global toast.
 */
import { FiFileMinus, FiFilePlus, FiTrash2 } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { elementSupportsRecordBlockAdd } from "../../../utils/sectionRecord";
import { getElementOutlineBounds } from "../../../utils/elementBounds";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import { useCanvasDeletionUndo } from "../../../hooks/useCanvasDeletionUndo";
import {
  RECORD_TOOLBAR_OFFSET_SCREEN_PX,
  resolveStructuralToolbarSide,
  structuralToolbarLayoutSize,
} from "../recordPlusSize";
import CanvasHoverToolbar from "../CanvasHoverToolbar/CanvasHoverToolbar";

/**
 * @param {{
 *   elementId:string,
 *   hoverIds?:string[],
 *   left:number,
 *   top:number,
 *   height?:number,
 *   width?:number,
 *   fontSize?:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 *   spreadSide?:"left"|"right"|null,
 *   canMoveUp?:boolean,
 *   canMoveDown?:boolean,
 *   descriptionAction?:"add"|"remove"|null,
 * }} props
 */
export default function RecordBlockAdd({
  elementId,
  hoverIds,
  left,
  top,
  height,
  width = 0,
  fontSize = 10,
  highlight = null,
  spreadSide = null,
  canMoveUp = false,
  canMoveDown = false,
  descriptionAction = null,
}) {
  const {
    A4_Elements,
    pageSize,
    editorMode,
    addRecordBlock,
    addRecordDescription,
    removeRecordBlock,
    removeRecordDescription,
    reorderRecordBlock,
    zoom = 1,
  } = useCanvasContext();
  const deleteWithUndo = useCanvasDeletionUndo();
  const pageHeight = pageSize?.height ?? 842;
  const anchorElement = A4_Elements.find((element) => element.element_id === elementId);
  const triggerIds = hoverIds?.length ? hoverIds : [elementId];
  const triggerElements = triggerIds
    .map((triggerId) => A4_Elements.find((element) => element.element_id === triggerId))
    .filter(Boolean);
  // Selection and inline editing are independent from structural hover. In
  // template mode one click starts editing, so excluding an editing field here
  // would remove the complete record outline exactly when the user selects it.
  const eligible = editorMode === EDITOR_MODE_TEMPLATE
    && elementSupportsRecordBlockAdd(A4_Elements, elementId, pageHeight);
  const exclusiveKey = `record:${elementId}`;
  const triggerRevision = triggerElements.map((element) => (
    `${element.element_id}:${Boolean(element.isSelected)}:${Boolean(element.isEditing)}`
  )).join("|");
  const {
    visible,
    pinned,
    menuOpen,
    hoveredTriggerId,
    toolbarPointerProps,
    hide,
    openMenu,
    closeMenu,
  } = useCanvasHoverToolbar({
    exclusiveKey,
    eligible,
    triggerIds,
    triggerRevision,
  });

  if (!eligible) return null;

  const layout = structuralToolbarLayoutSize(zoom, RECORD_TOOLBAR_OFFSET_SCREEN_PX);
  const boxHeight = Number.isFinite(Number(height)) && Number(height) > 0
    ? Number(height)
    : (Number(fontSize) || 10);
  const boxWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : 120;
  const resolvedHighlight = highlight || {
    left: Number(left) || 0,
    top: Number(top) || 0,
    width: boxWidth,
    height: Math.max(boxHeight, Number(fontSize) || 10),
  };
  // Structural actions belong to the record, but their visual anchor is the
  // first (title) element. Using that element's own box avoids drifting toward
  // the centre as descriptions add more lines to the record outline.
  const toolbarTop = (Number(top) || 0) + boxHeight / 2 - layout.buttonSize / 2;
  const preferredSide = (Number(left) || 0) < (pageSize?.width ?? 595) * 0.38
    ? "left"
    : "right";
  const side = resolveStructuralToolbarSide(preferredSide, spreadSide);
  const recordLabel = String(anchorElement?.content || "").trim();
  const hoveredElement = triggerElements.find((element) => (
    element.element_id === hoveredTriggerId
  ));
  const elementHighlight = hoveredElement
    ? getElementOutlineBounds(hoveredElement)
    : null;
  const menuItems = [
    ...(descriptionAction ? [{
      key: "description",
      label: descriptionAction === "add" ? "Dodaj opis" : "Usuń opis",
      icon: descriptionAction === "add"
        ? <FiFilePlus aria-hidden="true" />
        : <FiFileMinus aria-hidden="true" />,
      danger: descriptionAction === "remove",
      onSelect: () => {
        if (descriptionAction === "add") {
          addRecordDescription?.(elementId);
        } else {
          deleteWithUndo({
            title: recordLabel
              ? `Usunięto opis z wpisu „${recordLabel}”`
              : "Usunięto opis wpisu",
            msg: "Możesz natychmiast przywrócić opis wraz z jego treścią.",
            remove: () => removeRecordDescription?.(elementId),
          });
        }
        hide();
      },
    }] : []),
    {
      key: "delete",
      label: "Usuń wpis",
      icon: <FiTrash2 aria-hidden="true" />,
      danger: true,
      onSelect: () => {
        deleteWithUndo({
          title: recordLabel ? `Usunięto wpis „${recordLabel}”` : "Usunięto wpis",
          msg: "Możesz natychmiast przywrócić wpis wraz z jego treścią.",
          remove: () => removeRecordBlock?.(elementId),
        });
        hide();
      },
    },
  ];

  return (
    <CanvasHoverToolbar
      toolbarKey={exclusiveKey}
      visible={visible}
      pinned={pinned}
      side={side}
      top={toolbarTop}
      pageWidth={pageSize?.width ?? 595}
      highlight={resolvedHighlight}
      elementHighlight={elementHighlight}
      elementHighlightSelected={Boolean(hoveredElement?.isSelected)}
      layout={layout}
      addLabel="Wpis"
      addTooltip="Dodaj wpis poniżej"
      onAdd={() => {
        addRecordBlock?.(elementId);
        hide();
      }}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMoveUp={() => reorderRecordBlock?.(elementId, "up")}
      onMoveDown={() => reorderRecordBlock?.(elementId, "down")}
      menuOpen={menuOpen}
      onOpenMenu={openMenu}
      onCloseMenu={closeMenu}
      menuItems={menuItems}
      toolbarPointerProps={toolbarPointerProps}
    />
  );
}
