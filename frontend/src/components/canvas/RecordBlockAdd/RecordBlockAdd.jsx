/**
 * Contextual structural toolbar for one template-mode record.
 *
 * Hovering the record title/meta reveals a grouped toolbar in the nearest A4
 * gutter. Clicking pins it, a double click hands control to text editing, and
 * description/record removals remain recoverable through the global toast.
 */
import { use } from "react";
import { FiFileMinus, FiFilePlus, FiTrash2 } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { elementSupportsRecordBlockAdd } from "../../../utils/sectionRecord";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import { useCanvasDeletionUndo } from "../../../hooks/useCanvasDeletionUndo";
import {
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
  } = use(PdfContext);
  const deleteWithUndo = useCanvasDeletionUndo();
  const pageHeight = pageSize?.height ?? 842;
  const anchorElement = A4_Elements.find((element) => element.element_id === elementId);
  const triggerIds = hoverIds?.length ? hoverIds : [elementId];
  const eligible = editorMode === EDITOR_MODE_TEMPLATE
    && !anchorElement?.isEditing
    && elementSupportsRecordBlockAdd(A4_Elements, elementId, pageHeight);
  const exclusiveKey = `record:${elementId}`;
  const {
    visible,
    pinned,
    menuOpen,
    toolbarPointerProps,
    hide,
    openMenu,
    closeMenu,
  } = useCanvasHoverToolbar({ exclusiveKey, eligible, triggerIds });

  if (!eligible) return null;

  const layout = structuralToolbarLayoutSize(zoom);
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
  const toolbarTop = (Number(top) || 0) + boxHeight / 2 - layout.buttonSize / 2;
  const preferredSide = (Number(left) || 0) < (pageSize?.width ?? 595) * 0.38
    ? "left"
    : "right";
  const side = resolveStructuralToolbarSide(preferredSide, spreadSide);
  const recordLabel = String(anchorElement?.content || "").trim();
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
