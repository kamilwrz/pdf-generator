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
    isMove,
    category,
    elementId,
    zIndex,
    fixedToPage,
}) {

    const { moveElement, selectElement, selectMoveElement, A4_Elements, resizeElement } = use(PdfContext);

    const [isResizeable, setIsResizeable] = useState(false);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;

    function handleIsResizeable(active) {
        setIsResizeable(Boolean(active));
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
        zIndex: zIndex,
        ...(fixedToPage ? { pointerEvents: "none" } : {}),
    }

    if (fixedToPage) {
        return <div id={elementId} style={style} />;
    }

    if (isSelected && selectedCount === 1 && !isMove) {
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
                    id={elementId}
                    onDoubleClick={() => selectElement(elementId)}
                    onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
                    onPointerDown={(e) => {
                        if (e.ctrlKey || e.metaKey) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        selectMoveElement(elementId, true);
                    }}
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
                id={elementId}
                onDoubleClick={() => selectElement(elementId)}
                onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
                onPointerDown={(e) => {
                    if (e.ctrlKey || e.metaKey) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    selectMoveElement(elementId, true);
                }}
                onPointerMove={(e) => moveElement(e, elementId, category)}
                onPointerUp={() => selectMoveElement(elementId, false)}
                className={isSelected ? classes.selectedElement : ""}
                style={style}>
            </div>
        )
    }
}

export default memo(Rectangle);
