/**
 * Renders the live canvas element list by category.
 * Passes `fixedToPage` so decorative chrome stays pointer-inert.
 * Content enter fades come from ids marked via `markElementsEnter` /
 * `markContentElementsEnter`; decorative chrome is never animated.
 */
import Text from '../Text/Text';
import Image from '../Image/Image';
import Line from '../Line/Line';
import Rectangle from '../Rectangle/Rectangle';
import Textarea from '../Textarea/Textarea';
import Ellipse from '../Ellipse/Ellipse';
import { useCanvasEnterIds } from '../../../hooks/useCanvasEnterIds';
import classes from './CanvasElements.module.css';

function enterClassName(elementId, heldIds, fadingIds) {
  if (fadingIds.has(elementId)) return classes.enter;
  if (heldIds.has(elementId)) return classes.enterHeld;
  return undefined;
}

export default function CanvasElements({ elements }) {
  const { heldIds, fadingIds } = useCanvasEnterIds(elements);

  return elements.map((element) => {
    const enterClass = enterClassName(element.element_id, heldIds, fadingIds);
    let node = null;

    if (element.category === "textarea") {
      node = (
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
      );
    } else if (element.category === "text") {
      node = (
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
