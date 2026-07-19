import classes from "./Line.module.css";
import { memo } from 'react';
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use, useState } from "react";
import Resize from "../../common/Resize/Resize";

function Line({
    width,
    height,
    backgroundColor,
    left,
    top,
    isSelected,
    category,
    elementId,
    zIndex }) {

    const { moveElement, selectElement, selectMoveElement, A4_Elements, resizeElement } = use(PdfContext);

    const [isResizeable, setIsResizeable] = useState(false);

    function handleIsResizeable() {
        setIsResizeable(bool => !bool);
    }

    const style = {
        width: width,
        height: height,
        backgroundColor: backgroundColor,
        left: left,
        top: top,
        position: "absolute",
        zIndex: zIndex
    }

    if (isSelected) {
        const selectedElement = A4_Elements.find(element => element.element_id === elementId);

        return (
            <>
                <Resize
                    selectedElement={selectedElement}
                    isResizeable={isResizeable}
                    handleIsResizable={handleIsResizeable}
                    resizeElement={resizeElement}
                    category={selectedElement.category}
                    elementId={elementId}
                />

                <div
                    onDoubleClick={() => selectElement(elementId)}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); selectMoveElement(elementId, true); }}
                    onPointerMove={(e) => moveElement(e, elementId)}
                    onPointerUp={() => selectMoveElement(elementId, false)}
                    className={isSelected ? classes.selectedElement : ""}
                    style={style}>
                </div>
            </>
        )
    }
    else {
        return (
            <div
                onDoubleClick={() => selectElement(elementId)}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); selectMoveElement(elementId, true); }}
                onPointerMove={(e) => moveElement(e, elementId, category)}
                onPointerUp={() => selectMoveElement(elementId, false)}
                className={isSelected ? classes.selectedElement : ""}
                style={style}>
            </div>
        )
    }
}

export default memo(Line);