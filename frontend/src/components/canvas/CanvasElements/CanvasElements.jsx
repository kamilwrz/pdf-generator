import Text from '../Text/Text';
import Image from '../Image/Image';
import Line from '../Line/Line';
import Textarea from '../Textarea/Textarea';

export default function CanvasElements({ elements }) {
    return elements.map((element) => {
      if (element.category === "textarea") {
        return (
          <Textarea
            key={element.element_id}
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
            bold={element.bold}
            italic={element.italic}
            underline={element.underline}
            zIndex={element.zIndex}
          />
        );
      }
      if (element.category === "text") {
        return (
          <Text
            key={element.element_id}
            elementId={element.element_id}
            fontSize={element.fontSize}
            fontFamily={element.fontFamily}
            color={element.color}
            content={element.content}
            left={element.left}
            top={element.top}
            isSelected={element.isSelected}
            category={element.category}
            bold={element.bold}
            italic={element.italic}
            underline={element.underline}
            zIndex={element.zIndex}
          />
        );
      }
      if (element.category === "image") {
        return (
          <Image
            key={element.element_id}
            img_id = {element.img_id}
            elementId={element.element_id}
            height={parseFloat(element.height)}
            width={parseFloat(element.width)}
            src={element.src}
            left={element.left}
            top={element.top}
            isSelected={element.isSelected}
            category={element.category}
            zIndex={element.zIndex}
          />
        );
      }
      if (element.category === "line") {
        return (
          <Line
            key={element.element_id}
            elementId={element.element_id}
            width={parseFloat(element.width)}
            height={parseFloat(element.height)}
            backgroundColor={element.backgroundColor}
            left={element.left}
            top={element.top}
            isSelected={element.isSelected}
            category={element.category}
            zIndex={element.zIndex}
          />
        );
      }
      return null;
    });
  }