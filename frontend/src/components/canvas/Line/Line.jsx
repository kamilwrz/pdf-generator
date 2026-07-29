/**
 * Filled-rect “line” primitive used for rules, bands, and solid panels.
 * `fixedToPage` chrome is pointer-inert.
 */
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

    const style = {
        width: width,
        height: height,
        backgroundColor: backgroundColor,
        left: left,
        top: top,
        position: "absolute",
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

export default memo(Line);
