/**
 * Renders the live canvas element list by category.
 * Passes `fixedToPage` so decorative chrome stays pointer-inert.
 * Content enter fades come from ids marked via `markElementsEnter` /
 * `markContentElementsEnter`; decorative chrome is never animated.
 *
 * Template-mode section headings that own a multi-line record body also get a
 * `SectionRecordAdd` affordance (hover "+" → append a placeholder record).
 * Each line of those records also gets `RecordBlockAdd` (hover "+" → insert a
 * generic text block below that record).
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
import {
  listRecordBlockAddElementIds,
  sectionSupportsRecordAdd,
} from '../../../utils/sectionRecord';
import classes from './CanvasElements.module.css';

function enterClassName(elementId, heldIds, fadingIds) {
  if (fadingIds.has(elementId)) return classes.enter;
  if (heldIds.has(elementId)) return classes.enterHeld;
  return undefined;
}

export default function CanvasElements({ elements }) {
  const { heldIds, fadingIds } = useCanvasEnterIds(elements);
  const { editorMode, pageSize } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;

  const recordHeadingIds = useMemo(() => {
    if (editorMode !== EDITOR_MODE_TEMPLATE) return new Set();
    const ids = new Set();
    for (const section of listDocumentSections(elements, pageHeight)) {
      if (sectionSupportsRecordAdd(elements, section.headingId, pageHeight)) {
        ids.add(section.headingId);
      }
    }
    return ids;
  }, [editorMode, elements, pageHeight]);

  const recordBlockElementIds = useMemo(() => {
    if (editorMode !== EDITOR_MODE_TEMPLATE) return new Set();
    return listRecordBlockAddElementIds(elements, pageHeight);
  }, [editorMode, elements, pageHeight]);

  return elements.map((element) => {
    const enterClass = enterClassName(element.element_id, heldIds, fadingIds);
    let node = null;
    const showBlockAdd = recordBlockElementIds.has(element.element_id);

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
            align={element.align}
            bulletList={element.bulletList}
            autoHeight={element.autoHeight}
            preserveInitialLayout={element.preserveInitialLayout}
            zIndex={element.zIndex}
            fixedToPage={element.fixedToPage}
          />
          {showBlockAdd ? (
            <RecordBlockAdd
              elementId={element.element_id}
              left={Number(element.left) || 0}
              top={Number(element.top) || 0}
              height={Number(element.height) || 0}
              fontSize={Number(element.fontSize) || 10}
            />
          ) : null}
        </>
      );
    } else if (element.category === "text") {
      const showRecordAdd = recordHeadingIds.has(element.element_id);
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
            zIndex={element.zIndex}
            fixedToPage={element.fixedToPage}
          />
          {showRecordAdd ? (
            <SectionRecordAdd
              headingId={element.element_id}
              left={Number(element.left) || 0}
              top={Number(element.top) || 0}
              fontSize={Number(element.fontSize) || 10}
            />
          ) : null}
          {showBlockAdd ? (
            <RecordBlockAdd
              elementId={element.element_id}
              left={Number(element.left) || 0}
              top={Number(element.top) || 0}
              height={Number(element.height) || 0}
              fontSize={Number(element.fontSize) || 10}
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
