/**
 * Renders the live canvas element list by category.
 * Passes `fixedToPage` so decorative chrome stays pointer-inert.
 * Enter animations come from ids marked via `markElementsEnter`.
 */
import Text from '../Text/Text';
import Image from '../Image/Image';
import Line from '../Line/Line';
import Rectangle from '../Rectangle/Rectangle';
import Textarea from '../Textarea/Textarea';
import Ellipse from '../Ellipse/Ellipse';
import { useCanvasEnterIds } from '../../../hooks/useCanvasEnterIds';
import classes from './CanvasElements.module.css';

export default function CanvasElements({ elements }) {
  const enteringIds = useCanvasEnterIds(elements);

  return elements.map((element) => {
    const enterClass = enteringIds.has(element.element_id) ? classes.enter : undefined;
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
