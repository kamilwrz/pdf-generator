/**
 * Contextual structural toolbar for a template-mode section heading.
 *
 * Hover reveals one grouped toolbar in the A4 gutter; clicking the heading
 * pins it. The directly visible controls are add/reorder, while layout,
 * column-transfer, and destructive actions live in the overflow menu. This
 * keeps editor chrome out of the CV content without introducing a separate
 * properties panel.
 */
import { use } from "react";
import { FiTrash2 } from "react-icons/fi";
import { LuArrowLeftRight, LuLayoutGrid } from "react-icons/lu";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import { useCanvasDeletionUndo } from "../../../hooks/useCanvasDeletionUndo";
import { structuralToolbarLayoutSize } from "../recordPlusSize";
import CanvasHoverToolbar from "../CanvasHoverToolbar/CanvasHoverToolbar";

/**
 * @param {{
 *   headingId:string,
 *   left:number,
 *   top:number,
 *   width?:number,
 *   fontSize?:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 *   gutterSide?:"left"|"right",
 *   canMoveUp?:boolean,
 *   canMoveDown?:boolean,
 *   laneTransfer?:"to-sidebar"|"to-main"|null,
 *   skillsMode?:"inline"|"bullet"|"chips"|null,
 * }} props
 */
export default function SectionRecordAdd({
  headingId,
  left,
  top,
  width = 0,
  fontSize = 10,
  highlight = null,
  gutterSide = "right",
  canMoveUp = false,
  canMoveDown = false,
  laneTransfer = null,
  skillsMode = null,
}) {
  const {
    A4_Elements,
    editorMode,
    openAddSectionModal,
    openSkillsLayoutModal,
    removeSection,
    reorderSection,
    transferSectionLane,
    pageSize,
    zoom = 1,
  } = use(PdfContext);
  const deleteWithUndo = useCanvasDeletionUndo();
  const heading = A4_Elements.find((element) => element.element_id === headingId);
  const eligible = editorMode === EDITOR_MODE_TEMPLATE && !heading?.isEditing;
  const exclusiveKey = `heading:${headingId}`;
  const {
    visible,
    pinned,
    menuOpen,
    toolbarPointerProps,
    hide,
    openMenu,
    closeMenu,
  } = useCanvasHoverToolbar({
    exclusiveKey,
    eligible,
    triggerIds: [headingId],
  });

  if (!eligible) return null;

  const layout = structuralToolbarLayoutSize(zoom);
  const headingHeight = Number(fontSize) || 10;
  const headingWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : 120;
  const resolvedHighlight = highlight || {
    left: Number(left) || 0,
    top: Number(top) || 0,
    width: headingWidth,
    height: Math.max(headingHeight * 1.35, 12),
  };
  // Sidebar sections use the left editing gutter; main-column sections use
  // the right. The toolbar therefore never covers the authored column.
  const side = gutterSide;
  const toolbarTop = (Number(top) || 0) + headingHeight / 2 - layout.buttonSize / 2;
  const sectionLabel = String(heading?.content || "").trim();
  const skillsModeLabel = {
    inline: "w linii",
    bullet: "lista",
    chips: "etykiety",
  }[skillsMode] || "";

  const menuItems = [
    ...(laneTransfer ? [{
      key: "transfer",
      label: laneTransfer === "to-sidebar"
        ? "Przenieś do sidebara"
        : "Przenieś do kolumny głównej",
      icon: <LuArrowLeftRight aria-hidden="true" />,
      onSelect: () => {
        transferSectionLane?.(headingId);
        hide();
      },
    }] : []),
    ...(skillsMode ? [{
      key: "skills-layout",
      label: `Styl umiejętności: ${skillsModeLabel}`,
      icon: <LuLayoutGrid aria-hidden="true" />,
      onSelect: () => {
        openSkillsLayoutModal?.(headingId);
        hide();
      },
    }] : []),
    {
      key: "delete",
      label: "Usuń sekcję",
      icon: <FiTrash2 aria-hidden="true" />,
      danger: true,
      onSelect: () => {
        deleteWithUndo({
          title: sectionLabel ? `Usunięto sekcję „${sectionLabel}”` : "Usunięto sekcję",
          msg: "Możesz natychmiast przywrócić sekcję wraz z jej treścią.",
          remove: () => removeSection?.(headingId),
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
      addLabel="Sekcja"
      addTooltip="Dodaj sekcję poniżej"
      onAdd={() => {
        openAddSectionModal?.(headingId);
        hide();
      }}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMoveUp={() => reorderSection?.(headingId, "up")}
      onMoveDown={() => reorderSection?.(headingId, "down")}
      menuOpen={menuOpen}
      onOpenMenu={openMenu}
      onCloseMenu={closeMenu}
      menuItems={menuItems}
      toolbarPointerProps={toolbarPointerProps}
    />
  );
}
