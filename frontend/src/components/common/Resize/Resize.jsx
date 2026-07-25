import classes from "./Resize.module.css";

export default function Resize({ selectedElement, isResizeable, handleIsResizable, resizeElement, category, elementId, elementRef }) {
    const isTextarea = selectedElement.category === "textarea";
    const resizeHandle = (direction, className) => (
        <button
            className={`${className} ${classes.resizeButtons}`}
            onMouseMove={isResizeable ? (event) => resizeElement(event, direction, category, elementId, elementRef) : undefined}
            onMouseDown={handleIsResizable}
            onMouseUp={handleIsResizable}
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

            {(selectedElement.category === "line" || selectedElement.category === "rectangle" || selectedElement.category === "ellipse") && (
                <>
                    {resizeHandle("center-left", classes.roundCenterLeft)}
                    {resizeHandle("center-right", classes.roundCenterRight)}
                </>
            )}
        </div>
    );
}