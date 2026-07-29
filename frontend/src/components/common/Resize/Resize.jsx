/**
 * Corner/edge resize handles for the currently selected element.
 * Listens for global pointerup so a drag ending outside the handle still stops.
 */
import classes from "./Resize.module.css";
import { useEffect } from "react";

export default function Resize({ selectedElement, isResizeable, handleIsResizable, resizeElement, category, elementId, elementRef }) {
    const isTextarea = selectedElement.category === "textarea";
    const stopResizing = () => handleIsResizable(false);

    useEffect(() => {
        window.addEventListener("pointerup", stopResizing);
        window.addEventListener("pointercancel", stopResizing);
        return () => {
            window.removeEventListener("pointerup", stopResizing);
            window.removeEventListener("pointercancel", stopResizing);
        };
    }, [handleIsResizable]);

    const resizeHandle = (direction, className) => (
        <button
            type="button"
            className={`${className} ${classes.resizeButtons}`}
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                handleIsResizable(true);
            }}
            onPointerMove={(event) => {
                if (!isResizeable) return;
                if ((event.buttons & 1) !== 1) {
                    stopResizing();
                    return;
                }
                resizeElement(event, direction, category, elementId, elementRef);
            }}
            onPointerLeave={stopResizing}
            onPointerUp={stopResizing}
            onPointerCancel={stopResizing}
        />
    );

    return (
        <div className={classes.resizeWrapper} style={{
            width: selectedElement.width,
            height: selectedElement.height,
            left: selectedElement.left,
            top: selectedElement.top,
            position: "absolute",
        }}>
            {isTextarea ? (
                <>
                    {resizeHandle("center-left", classes.roundTextareaLeft)}
                    {resizeHandle("center-right", classes.roundTextareaRight)}
                </>
            ) : (
                <>
                    {resizeHandle("bottom-right", classes.roundBottomRight)}
                    {resizeHandle("top-left", classes.roundTopLeft)}
                    {resizeHandle("top-right", classes.roundTopRight)}
                    {resizeHandle("bottom-left", classes.roundBottomLeft)}
                </>
            )}

            {/* Mid-edge handles for box shapes — same set for line / rect / ellipse / circle. */}
            {!isTextarea && (
                selectedElement.category === "line"
                || selectedElement.category === "rectangle"
                || selectedElement.category === "ellipse"
                || selectedElement.category === "circle"
            ) && (
                <>
                    {resizeHandle("center-left", classes.roundCenterLeft)}
                    {resizeHandle("center-right", classes.roundCenterRight)}
                    {resizeHandle("center-top", classes.roundCenterTop)}
                    {resizeHandle("center-bottom", classes.roundCenterBottom)}
                </>
            )}
        </div>
    );
}