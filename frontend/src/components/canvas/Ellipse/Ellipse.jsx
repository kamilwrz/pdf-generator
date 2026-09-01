/**
 * Circle/ellipse shape; filled or stroked. Used for markers and chrome.
 */
import { memo, useState } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import Resize from "../../common/Resize/Resize";

function Ellipse({
    width,
    height,
    backgroundColor,
    borderWidth,
    filled,
    left,
    top,
    isSelected,
    isMove,
    category,
    elementId,
    zIndex,
    fixedToPage,
}) {
    const {
        moveElement,
        selectElement,
        selectMoveElement,
        A4_Elements,
        resizeElement,
    } = useCanvasContext();
    const [isResizeable, setIsResizeable] = useState(false);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
    const selectedElement = A4_Elements.find((element) => element.element_id === elementId);

    const style = {
        position: "absolute",
        width,
        height,
        left,
        top,
        boxSizing: "border-box",
        borderRadius: "50%",
        background: filled ? backgroundColor : "transparent",
        border: filled ? "none" : `${borderWidth || 1}px solid ${backgroundColor}`,
        zIndex,
        ...(fixedToPage ? { pointerEvents: "none" } : {}),
    };

    if (fixedToPage) {
        return <div id={elementId} style={style} />;
    }

    const shape = (
        <div
            id={elementId}
            style={style}
            onDoubleClick={() => selectElement(elementId)}
            onClick={(event) => selectElement(elementId, event.ctrlKey || event.metaKey)}
            onPointerDown={(event) => {
                if (event.ctrlKey || event.metaKey) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                selectMoveElement(elementId, true);
            }}
            onPointerMove={(event) => moveElement(event, elementId, category)}
            onPointerUp={() => selectMoveElement(elementId, false)}
        />
    );

    if (isSelected && selectedCount === 1 && !isMove && selectedElement) {
        return (
            <>
                <Resize
                    selectedElement={selectedElement}
                    isResizeable={isResizeable}
                    handleIsResizable={(active) => setIsResizeable(Boolean(active))}
                    resizeElement={resizeElement}
                    category={category}
                    elementId={elementId}
                />
                {shape}
            </>
        );
    }

    return shape;
}

export default memo(Ellipse);
