/**
 * Contextual structural toolbar for a template-mode section heading.
 *
 * Hover or keyboard focus reveals one grouped toolbar in the A4 gutter and an
 * inner frame around the exact heading. Directly visible controls are
 * add/reorder, while layout, column-transfer, and destructive actions live in
 * the overflow menu. This keeps editor chrome out of the CV content without
 * introducing a separate properties panel.
 */
import { use, useLayoutEffect, useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { LuArrowLeftRight, LuLayoutGrid } from "react-icons/lu";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import { useCanvasDeletionUndo } from "../../../hooks/useCanvasDeletionUndo";
import {
  resolveStructuralToolbarSide,
  structuralToolbarLayoutSize,
} from "../recordPlusSize";
import {
  includeRenderedBounds,
  resolveRenderedHighlightLimits,
} from "../../../utils/canvasHighlightBounds";
import { getElementOutlineBounds, getVisualBounds } from "../../../utils/elementBounds";
import CanvasHoverToolbar from "../CanvasHoverToolbar/CanvasHoverToolbar";

function sameBounds(left, right) {
  if (!left || !right) return left === right;
  return left.left === right.left
    && left.top === right.top
    && left.width === right.width
    && left.height === right.height;
}

function measurementKeyPart(element) {
  return [
    element?.element_id,
    element?.page,
    element?.left,
    element?.top,
    element?.width,
    element?.height,
    element?.fontSize,
    element?.fontFamily,
    element?.bold,
    element?.italic,
    element?.content,
    element?.runs,
    element?.textTransform,
  ];
}

/**
 * @param {{
 *   headingId:string,
 *   nextHeadingId?:string|null,
 *   left:number,
 *   top:number,
 *   width?:number,
 *   fontSize?:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 *   highlightLimits?:{minTop?:number|null,maxBottom?:number|null},
 *   gutterSide?:"left"|"right",
 *   spreadSide?:"left"|"right"|null,
 *   canMoveUp?:boolean,
 *   canMoveDown?:boolean,
 *   laneTransfer?:"to-sidebar"|"to-main"|null,
 *   skillsMode?:"inline"|"bullet"|"chips"|null,
 * }} props
 */
export default function SectionRecordAdd({
  headingId,
  nextHeadingId = null,
  left,
  top,
  width = 0,
  fontSize = 10,
  highlight = null,
  highlightLimits = {},
  gutterSide = "right",
  spreadSide = null,
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
  const nextHeading = nextHeadingId
    ? A4_Elements.find((element) => element.element_id === nextHeadingId)
    : null;
  const eligible = editorMode === EDITOR_MODE_TEMPLATE && !heading?.isEditing;
  const exclusiveKey = `heading:${headingId}`;
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
    triggerIds: [headingId],
  });

  // A section can move while an open overflow menu keeps this toolbar pinned.
  // Key the post-commit measurement to the exact model geometry so a Range
  // captured for the old position is never reused by the next render.
  const headingMeasurementKey = JSON.stringify([
    measurementKeyPart(heading),
    measurementKeyPart(nextHeading),
    zoom,
  ]);
  const [renderedHeadingMeasurement, setRenderedHeadingMeasurement] = useState(null);

  useLayoutEffect(() => {
    if (!visible || !heading) return;
    // React has committed Text/Textarea coordinates by this point. Measuring
    // inside render would still see the previous reorder/transfer position and
    // is the root cause of neighbouring section outlines being merged.
    const headingBounds = getVisualBounds(heading);
    const nextHeadingBounds = nextHeading ? getVisualBounds(nextHeading) : null;
    // The synchronous layout-state update is intentional: React performs the
    // follow-up render before paint, so users never see the model-only fallback
    // cut through line-height:1 glyph ink. Moving this to a passive effect would
    // produce a one-frame border jump on every first hover.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderedHeadingMeasurement((current) => (
      current?.key === headingMeasurementKey
      && sameBounds(current.headingBounds, headingBounds)
      && sameBounds(current.nextHeadingBounds, nextHeadingBounds)
        ? current
        : {
          key: headingMeasurementKey,
          headingBounds,
          nextHeadingBounds,
        }
    ));
  }, [heading, headingMeasurementKey, nextHeading, visible]);

  if (!eligible) return null;

  const layout = structuralToolbarLayoutSize(zoom);
  const headingHeight = Number(fontSize) || 10;
  const headingWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : 120;
  const storedHighlight = highlight || {
    left: Number(left) || 0,
    top: Number(top) || 0,
    width: headingWidth,
    height: Math.max(headingHeight * 1.35, 12),
  };
  const currentMeasurement = renderedHeadingMeasurement?.key === headingMeasurementKey
    ? renderedHeadingMeasurement
    : null;
  const headingTopExtension = Math.max(4, (Number(heading?.fontSize) || headingHeight) * 0.75);
  const nextHeadingTopExtension = Math.max(
    4,
    (Number(nextHeading?.fontSize) || headingHeight) * 0.75,
  );
  const resolvedHighlightLimits = resolveRenderedHighlightLimits(
    highlightLimits,
    {
      headingBounds: currentMeasurement?.headingBounds,
      nextHeadingBounds: currentMeasurement?.nextHeadingBounds,
      headingTopExtension,
      nextHeadingTopExtension,
    },
  );
  // Merge only a measurement associated with the current committed geometry.
  // Reapply both lane-local limits after the union; the live heading may extend
  // the top slightly for line-height:1 ink, but it cannot absorb a neighbour.
  const resolvedHighlight = visible
    ? includeRenderedBounds(
      storedHighlight,
      currentMeasurement?.headingBounds,
      resolvedHighlightLimits,
    )
    : storedHighlight;
  // A single page follows its content lane. A spread instead uses the outer
  // edge of each sheet because the centre gap is narrower than the toolbar.
  const side = resolveStructuralToolbarSide(gutterSide, spreadSide);
  const toolbarTop = (Number(top) || 0) + headingHeight / 2 - layout.buttonSize / 2;
  const sectionLabel = String(heading?.content || "").trim();
  const hoveredHeading = hoveredTriggerId === headingId ? heading : null;
  const elementHighlight = hoveredHeading
    && !hoveredHeading.isSelected
    && !hoveredHeading.isEditing
    ? getElementOutlineBounds(hoveredHeading)
    : null;
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
      elementHighlight={elementHighlight}
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
