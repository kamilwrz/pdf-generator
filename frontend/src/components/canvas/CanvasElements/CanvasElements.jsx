/**
 * Renders the live canvas element list by category.
 * Passes `fixedToPage` so decorative chrome stays pointer-inert.
 * Content enter fades come from ids marked via `markElementsEnter` /
 * `markContentElementsEnter`; decorative chrome is never animated.
 *
 * Template-mode section headings (main `section-chrome` and sidebar
 * `sidebar-chrome`) get a `SectionRecordAdd` affordance (hover trash/+ left,
 * reorder arrows right → add/delete/reorder section and re-pack within the
 * same lane). On Sterling (and other sidebar CVs once enabled) a left-right
 * transfer arrow also appears on the destination side of the heading. Each
 * multi-line record also gets one `RecordBlockAdd` on its title line (hover
 * anywhere on the upper block → insert, delete, or reorder a record, then
 * re-pack). Flat-list section bodies (Skills, Languages, flat custom sections
 * — exactly one textarea per section) get a `FlatSectionLayoutToggle` icon to
 * their left, centered on the block's height, instead — opening a modal to
 * switch between an inline mid-dot row and a bullet list.
 */
import { use, useMemo } from 'react';
import Text from '../Text/Text';
import Image from '../Image/Image';
import Line from '../Line/Line';
import Rectangle from '../Rectangle/Rectangle';
import Textarea from '../Textarea/Textarea';
import Ellipse from '../Ellipse/Ellipse';
import Polygon from '../Polygon/Polygon';
import Path from '../Path/Path';
import SectionRecordAdd from '../SectionRecordAdd/SectionRecordAdd';
import RecordBlockAdd from '../RecordBlockAdd/RecordBlockAdd';
import FlatSectionLayoutToggle from '../FlatSectionLayoutToggle/FlatSectionLayoutToggle';
import { useCanvasEnterIds } from '../../../hooks/useCanvasEnterIds';
import { PdfContext } from '../../../store/pdfgenerator-context';
import { EDITOR_MODE_TEMPLATE } from '../../../utils/editorMode';
import {
  listDocumentSections,
  listFlatSectionAnchors,
  listSidebarSections,
} from '../../../utils/sectionStructure';
import { listRecordBlockAddAnchors } from '../../../utils/sectionRecord';
import { resolveSectionLaneTransfer } from '../../../utils/transferSectionLane';
import classes from './CanvasElements.module.css';

/** Lane-transfer hover control is enabled for Sterling first; util is general. */
const LANE_TRANSFER_TEMPLATE_IDS = new Set(["sterling"]);

function enterClassName(elementId, heldIds, fadingIds) {
  if (fadingIds.has(elementId)) return classes.enter;
  if (heldIds.has(elementId)) return classes.enterHeld;
  return undefined;
}

/**
 * Map heading ids → ↑/↓ flags (and optional lane transfer) for one lane.
 * Indexes are lane-local so a sidebar kicker cannot reorder into the main column.
 */
function fillSectionAnchors(map, sections, documentElements, pageHeight, allowLaneTransfer) {
  sections.forEach((section, index) => {
    map.set(section.headingId, {
      canMoveUp: index > 0,
      canMoveDown: index < sections.length - 1,
      laneTransfer: allowLaneTransfer
        ? resolveSectionLaneTransfer(documentElements, section.headingId, pageHeight)
        : null,
    });
  });
}

export default function CanvasElements({ elements }) {
  const { heldIds, fadingIds } = useCanvasEnterIds(elements);
  // `elements` is page-filtered by PdfCanvas. Reorder ↑/↓ must use the full
  // document so a heading/record on page 2 still sees neighbours on page 1.
  const { editorMode, pageSize, A4_Elements, activeTemplateId } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;
  const documentElements = A4_Elements?.length ? A4_Elements : elements;
  const allowLaneTransfer = LANE_TRANSFER_TEMPLATE_IDS.has(activeTemplateId);

  // Heading id → reorder / lane-transfer flags for the section hover affordance.
  const sectionAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    fillSectionAnchors(
      map,
      listDocumentSections(documentElements, pageHeight),
      documentElements,
      pageHeight,
      allowLaneTransfer,
    );
    fillSectionAnchors(
      map,
      listSidebarSections(documentElements, pageHeight),
      documentElements,
      pageHeight,
      allowLaneTransfer,
    );
    return map;
  }, [editorMode, documentElements, pageHeight, allowLaneTransfer]);

  const recordBlockAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    for (const anchor of listRecordBlockAddAnchors(documentElements, pageHeight)) {
      map.set(anchor.elementId, anchor);
    }
    return map;
  }, [editorMode, documentElements, pageHeight]);

  // Content-element id → flat-list layout-toggle anchor (Skills, Languages,
  // flat custom sections). A section can only be either record-shaped
  // (recordBlockAnchorsById) or flat (exactly one body textarea), so the two
  // maps never target the same element in practice.
  const flatSectionAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    for (const anchor of listFlatSectionAnchors(documentElements, pageHeight)) {
      map.set(anchor.contentElementId, anchor);
    }
    return map;
  }, [editorMode, documentElements, pageHeight]);

  return elements.map((element) => {
    const enterClass = enterClassName(element.element_id, heldIds, fadingIds);
    let node = null;
    const blockAnchor = recordBlockAnchorsById.get(element.element_id);
    const flatAnchor = flatSectionAnchorsById.get(element.element_id);

    if (element.category === "textarea") {
      node = (
        <>
          <Textarea
            elementId={element.element_id}
            content={element.content}
            fontSize={element.fontSize}
            fontFamily={element.fontFamily}
            color={element.color}
            lineHeight={element.lineHeight}
            letterSpacing={element.letterSpacing}
            left={element.left}
            top={element.top}
            width={parseFloat(element.width)}
            height={parseFloat(element.height)}
            isSelected={element.isSelected}
            isEditing={element.isEditing}
            isMove={element.isMove}
            bold={element.bold}
            italic={element.italic}
            underline={element.underline}
            runs={element.runs}
            align={element.align}
            bulletList={element.bulletList}
            autoHeight={element.autoHeight}
            preserveInitialLayout={element.preserveInitialLayout}
            zIndex={element.zIndex}
            fixedToPage={element.fixedToPage}
          />
          {blockAnchor ? (
            <RecordBlockAdd
              elementId={blockAnchor.elementId}
              hoverIds={blockAnchor.hoverIds}
              left={blockAnchor.left}
              top={blockAnchor.top}
              height={blockAnchor.height}
              width={blockAnchor.width}
              fontSize={blockAnchor.fontSize}
              canMoveUp={blockAnchor.canMoveUp}
              canMoveDown={blockAnchor.canMoveDown}
            />
          ) : null}
          {flatAnchor ? (
            <FlatSectionLayoutToggle
              contentElementId={flatAnchor.contentElementId}
              left={Number(element.left) || 0}
              top={Number(element.top) || 0}
              height={Number(element.height) || 0}
              fontSize={Number(element.fontSize) || 10}
            />
          ) : null}
        </>
      );
    } else if (element.category === "text") {
      const sectionAnchor = sectionAnchorsById.get(element.element_id);
      node = (
        <>
          <Text
            elementId={element.element_id}
            fontSize={element.fontSize}
            fontFamily={element.fontFamily}
            color={element.color}
            content={element.content}
            left={element.left}
            top={element.top}
            width={element.width}
            height={element.height}
            isSelected={element.isSelected}
            isEditing={element.isEditing}
            isMove={element.isMove}
            category={element.category}
            bold={element.bold}
            italic={element.italic}
            underline={element.underline}
            runs={element.runs}
            zIndex={element.zIndex}
            fixedToPage={element.fixedToPage}
          />
          {sectionAnchor ? (
            <SectionRecordAdd
              headingId={element.element_id}
              left={Number(element.left) || 0}
              top={Number(element.top) || 0}
              width={Number(element.width) || 0}
              fontSize={Number(element.fontSize) || 10}
              canMoveUp={sectionAnchor.canMoveUp}
              canMoveDown={sectionAnchor.canMoveDown}
              laneTransfer={sectionAnchor.laneTransfer}
            />
          ) : null}
          {blockAnchor ? (
            <RecordBlockAdd
              elementId={blockAnchor.elementId}
              hoverIds={blockAnchor.hoverIds}
              left={blockAnchor.left}
              top={blockAnchor.top}
              height={blockAnchor.height}
              width={blockAnchor.width}
              fontSize={blockAnchor.fontSize}
              canMoveUp={blockAnchor.canMoveUp}
              canMoveDown={blockAnchor.canMoveDown}
            />
          ) : null}
        </>
      );
    } else if (element.category === "image") {
      node = (
        <Image
          img_id={element.img_id}
          elementId={element.element_id}
          height={parseFloat(element.height)}
          width={parseFloat(element.width)}
          src={element.src}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
          alignWithText={element.alignWithText}
          borderRadius={element.borderRadius}
          objectFit={element.objectFit}
          photoSlot={element.photoSlot}
        />
      );
    } else if (element.category === "line") {
      node = (
        <Line
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    } else if (element.category === "rectangle") {
      node = (
        <Rectangle
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          borderRadius={element.borderRadius}
          filled={element.filled}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
          photoSlot={element.photoSlot}
          id={element.id}
        />
      );
    } else if (element.category === "circle" || element.category === "ellipse") {
      node = (
        <Ellipse
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          filled={element.filled}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    } else if (element.category === "polygon") {
      node = (
        <Polygon
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          filled={element.filled}
          points={element.points}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    } else if (element.category === "path") {
      node = (
        <Path
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          curves={element.curves}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    }

    if (!node) return null;

    return (
      <div key={element.element_id} className={enterClass}>
        {node}
      </div>
    );
  });
}
