/**
 * Contextual structural toolbar for a template-mode section heading.
 *
 * Heading hover or keyboard focus reveals a grouped toolbar above the text;
 * pointer hover also adds a tighter depth cue around the exact heading. Plain
 * body hover keeps the complete section lift visible without opening controls. Add/reorder remain
 * direct; layout, transfer, and destructive actions live in the overflow menu,
 * keeping editor chrome out of the CV content and exported document.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { LuArrowLeftRight, LuLayoutGrid } from "react-icons/lu";
import { useCanvasContext } from "../../../store/canvas-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import { useCanvasDeletionUndo } from "../../../hooks/useCanvasDeletionUndo";
import {
  STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX,
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
 *   contentHoverIds?:string[],
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
  contentHoverIds = [],
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
  } = useCanvasContext();
  const deleteWithUndo = useCanvasDeletionUndo();
  const heading = A4_Elements.find((element) => element.element_id === headingId);
  const nextHeading = nextHeadingId
    ? A4_Elements.find((element) => element.element_id === nextHeadingId)
    : null;
  // A selected heading remains a structural action target while it is edited.
  // Focus keeps the toolbar keyboard-accessible, while pointer state alone
  // controls the transient section and exact-heading depth shadows.
  const eligible = editorMode === EDITOR_MODE_TEMPLATE;
  const exclusiveKey = `heading:${headingId}`;
  const triggerRevision = [
    heading?.element_id,
    Boolean(heading?.isSelected),
    Boolean(heading?.isEditing),
  ].join(":");
  const {
    visible,
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
    triggerRevision,
  });
  const contentHoverKey = [...new Set(contentHoverIds)].join("|");
  const contentHoverRevision = contentHoverIds.map((elementId) => {
    const element = A4_Elements.find((candidate) => candidate.element_id === elementId);
    return `${elementId}:${Boolean(element?.isSelected)}:${Boolean(element?.isEditing)}`;
  }).join("|");
  const [contentHoverActive, setContentHoverActive] = useState(false);

  useEffect(() => {
    if (!eligible || !contentHoverKey) return undefined;
    const nodes = contentHoverKey.split("|")
      .map((elementId) => document.getElementById(elementId))
      .filter(Boolean);
    if (nodes.length === 0) return undefined;

    // This listener owns only the semantic section depth. More specific
    // record/grid controls retain the exclusive toolbar slot and are excluded
    // by CanvasElements before these ids arrive here.
    const showContext = () => setContentHoverActive(true);
    const hideContext = () => setContentHoverActive(false);
    nodes.forEach((node) => {
      node.addEventListener("pointerenter", showContext);
      node.addEventListener("pointerleave", hideContext);
    });
    return () => {
      nodes.forEach((node) => {
        node.removeEventListener("pointerenter", showContext);
        node.removeEventListener("pointerleave", hideContext);
      });
    };
  }, [contentHoverKey, contentHoverRevision, eligible]);

  const sectionHoverVisible = hoveredTriggerId === headingId || contentHoverActive;
  const sectionMeasurementVisible = visible || contentHoverActive;

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
    if (!sectionMeasurementVisible || !heading) return;
    // React has committed Text/Textarea coordinates by this point. Measuring
    // inside render would still see the previous reorder/transfer position and
    // is the root cause of neighbouring section highlights being merged.
    const headingBounds = getVisualBounds(heading);
    const nextHeadingBounds = nextHeading ? getVisualBounds(nextHeading) : null;
    // The synchronous layout-state update is intentional: React performs the
    // follow-up render before paint, so users never see the model-only fallback
    // cut through line-height:1 glyph ink. Moving this to a passive effect would
    // produce a one-frame shadow jump on every first hover.
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
  }, [heading, headingMeasurementKey, nextHeading, sectionMeasurementVisible]);

  if (!eligible) return null;

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
  const resolvedHighlight = sectionMeasurementVisible
    ? includeRenderedBounds(
      storedHighlight,
      currentMeasurement?.headingBounds,
      resolvedHighlightLimits,
    )
    : storedHighlight;
  // Anchor the toolbar's upper-layout edge to the rendered heading rather than
  // to the A4 page or complete semantic section. The portal renders the toolbar
  // 24 screen pixels above this point and aligns both left edges, which keeps
  // actions clear of the authored text at every zoom and after reflow.
  const toolbarHeadingBounds = currentMeasurement?.headingBounds || {
    left: Number(left) || 0,
    top: Number(top) || 0,
    width: headingWidth,
    height: Math.max(Number(heading?.height) || 0, headingHeight),
  };
  const toolbarAnchorX = toolbarHeadingBounds.left;
  const toolbarTop = toolbarHeadingBounds.top;
  const sectionLabel = String(heading?.content || "").trim();
  const hoveredHeading = hoveredTriggerId === headingId ? heading : null;
  const elementHighlight = hoveredHeading
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
      aiTarget={{ kind: "section", headingId }}
      toolbarKey={exclusiveKey}
      visible={visible}
      highlightVisible={sectionHoverVisible}
      placement="above"
      anchorX={toolbarAnchorX}
      top={toolbarTop}
      pageWidth={pageSize?.width ?? 595}
      highlight={resolvedHighlight}
      highlightLevel="section"
      elementHighlight={elementHighlight}
      elementHighlightSelected={Boolean(hoveredHeading?.isSelected)}
      layout={structuralToolbarLayoutSize(1, STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX)}
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
