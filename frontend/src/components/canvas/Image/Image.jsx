import classes from "./Image.module.css";
import { memo, useState } from 'react';
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use, useRef } from "react";
import Resize from "../../common/Resize/Resize";

function Image({
    src,
    width,
    height,
    left,
    top,
    elementId,
    isSelected,
    zIndex }) {

    const { moveElement, selectElement, A4_Elements, selectMoveElement, resizeElement } = use(PdfContext)

    const [isResizeable, setIsResizeable] = useState(false);

    const image = useRef();

    function handleIsResizeable() {
        setIsResizeable(bool => !bool);
    }

    const style = {
        width: width,
        height: height,
        left: left,
        top: top,
        position: "absolute",
        zIndex: zIndex
    }


    if (isSelected) {

        const selectedElement = A4_Elements.find(element => element.element_id === elementId);

        return <>

            <Resize
                selectedElement={selectedElement}
                isResizeable={isResizeable}
                handleIsResizable={handleIsResizeable}
                resizeElement={resizeElement}
                category={selectedElement.category}
                elementId={elementId}
                elementRef={image}
            />
            <img
                ref={image}
                id={elementId}
                draggable={false}
                src={src}
                style={style}
                onDoubleClick={() => selectElement(elementId)}
                onMouseMove={(e) => moveElement(e, elementId)}
                onMouseDown={() => selectMoveElement(elementId)}
                onMouseLeave={() => selectMoveElement(elementId)}
                onMouseUp={() => selectMoveElement(elementId)}
                className={isSelected ? classes.selectedElement : ""}
            /></>

    } else {
        return <img
            ref={image}
            id={elementId}
            draggable={false}
            src={src}
            style={style}
            onDoubleClick={() => selectElement(elementId)}
            onMouseMove={(e) => moveElement(e, elementId)}
            onMouseDown={() => selectMoveElement(elementId)}
            onMouseUp={() => selectMoveElement(elementId)}
            className={isSelected ? classes.selectedElement : ""}
        />
    }
}

export default memo(Image);
