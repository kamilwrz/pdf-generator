/**
 * Renders the live canvas element list by category.
 * Passes `fixedToPage` so decorative chrome stays pointer-inert.
 * Content enter fades come from ids marked via `markElementsEnter` /
 * `markContentElementsEnter`; decorative chrome is never animated.
 *
 * Template-mode section headings get a `SectionRecordAdd` affordance
 * (hover trash/+ left, reorder arrows right → add/delete/reorder section and
 * re-pack). Each multi-line record also gets one `RecordBlockAdd` on its title
 * line (hover anywhere on the upper block → insert, delete, or reorder a
 * record, then re-pack).
 */
import { use, useMemo } from 'react';
import Text from '../Text/Text';
import Image from '../Image/Image';
import Line from '../Line/Line';
import Rectangle from '../Rectangle/Rectangle';
import Textarea from '../Textarea/Textarea';
import Ellipse from '../Ellipse/Ellipse';
import SectionRecordAdd from '../SectionRecordAdd/SectionRecordAdd';
import RecordBlockAdd from '../RecordBlockAdd/RecordBlockAdd';
import { useCanvasEnterIds } from '../../../hooks/useCanvasEnterIds';
import { PdfContext } from '../../../store/pdfgenerator-context';
import { EDITOR_MODE_TEMPLATE } from '../../../utils/editorMode';
import { listDocumentSections } from '../../../utils/sectionStructure';
import { listRecordBlockAddAnchors } from '../../../utils/sectionRecord';
import classes from './CanvasElements.module.css';

function enterClassName(elementId, heldIds, fadingIds) {
  if (fadingIds.has(elementId)) return classes.enter;
  if (heldIds.has(elementId)) return classes.enterHeld;
  return undefined;
}

export default function CanvasElements({ elements }) {
  const { heldIds, fadingIds } = useCanvasEnterIds(elements);
  // `elements` is page-filtered by PdfCanvas. Reorder ↑/↓ must use the full
  // document so a heading/record on page 2 still sees neighbours on page 1.
  const { editorMode, pageSize, A4_Elements } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;
  const documentElements = A4_Elements?.length ? A4_Elements : elements;

  // Heading id → reorder flags for the section hover affordance.
  const sectionAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    const sections = listDocumentSections(documentElements, pageHeight);
    sections.forEach((section, index) => {
      map.set(section.headingId, {
        canMoveUp: index > 0,
        canMoveDown: index < sections.length - 1,
      });
    });
    return map;
  }, [editorMode, documentElements, pageHeight]);

  const recordBlockAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    for (const anchor of listRecordBlockAddAnchors(documentElements, pageHeight)) {
      map.set(anchor.elementId, anchor);
    }
    return map;
  }, [editorMode, documentElements, pageHeight]);

  return elements.map((element) => {
    const enterClass = enterClassName(element.element_id, heldIds, fadingIds);
    let node = null;
    const blockAnchor = recordBlockAnchorsById.get(element.element_id);

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
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
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
    }

    if (!node) return null;

    return (
      <div key={element.element_id} className={enterClass}>
        {node}
      </div>
    );
  });
}
