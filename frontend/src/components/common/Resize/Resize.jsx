/**
 * Corner/edge resize handles for the currently selected element.
 * Listens for global pointerup so a drag ending outside the handle still stops.
 * Hidden entirely in template (structural) mode — layout owns width/height.
 */
import classes from "./Resize.module.css";
import { useCallback, useEffect } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import { canResizeElement } from "../../../utils/editorMode";

export default function Resize({ selectedElement, isResizeable, handleIsResizable, resizeElement, category, elementId, elementRef, displayTop }) {
    const { editorMode } = useCanvasContext();
    const allowResize = canResizeElement(selectedElement, editorMode);
    const isTextarea = selectedElement.category === "textarea";
    // Text-aligned icons render their glyph above the stored top; the handles
    // must follow that shifted position, not the logical top, or the resize box
    // detaches from the icon.
    const frameTop = displayTop ?? selectedElement.top;
    const stopResizing = useCallback(() => handleIsResizable(false), [handleIsResizable]);

    useEffect(() => {
        if (!allowResize) return undefined;
        window.addEventListener("pointerup", stopResizing);
        window.addEventListener("pointercancel", stopResizing);
        return () => {
            window.removeEventListener("pointerup", stopResizing);
            window.removeEventListener("pointercancel", stopResizing);
        };
    }, [allowResize, stopResizing]);

    if (!allowResize) return null;

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
            top: frameTop,
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
                || selectedElement.category === "polygon"
                || selectedElement.category === "path"
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
