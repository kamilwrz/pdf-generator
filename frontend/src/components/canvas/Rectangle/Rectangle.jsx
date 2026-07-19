import classes from "./Rectangle.module.css";
import { memo, useState } from 'react';
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";
import Resize from "../../common/Resize/Resize";

function Rectangle({
    width,
    height,
    backgroundColor,
    borderWidth,
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

    // Outline only: the border colour reuses backgroundColor (same as the line),
    // background stays transparent. border-box keeps the border inside width/
    // height so it matches the PDF (which insets the stroke by half its width).
    const style = {
        width: width,
        height: height,
        left: left,
        top: top,
        position: "absolute",
        boxSizing: "border-box",
        background: "transparent",
        border: `${borderWidth || 1}px solid ${backgroundColor}`,
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

export default memo(Rectangle);
