import classes from "./Resize.module.css";

export default function Resize({ selectedElement, isResizeable, handleIsResizable, resizeElement, category, elementId, elementRef }) {
    return (
        <div className={classes.resizeWrapper} style={{
            width: selectedElement.width,
            height: selectedElement.height,
            left: selectedElement.left,
            top: selectedElement.top,
            position: "absolute"
        }}>

            <button className={`${classes.roundBottomRight} ${classes.resizeButtons}`}
                onMouseMove={isResizeable ? (e) => resizeElement(e, "bottom-right", category, elementId, elementRef) : undefined}
                onMouseDown={handleIsResizable}
                onMouseUp={handleIsResizable}

            >

            </button>
            <button className={`${classes.roundTopLeft} ${classes.resizeButtons}`}
                onMouseMove={isResizeable ? (e) => resizeElement(e, "top-left", category, elementId, elementRef) : undefined}
                onMouseDown={handleIsResizable}
                onMouseUp={handleIsResizable}
            >

            </button>
            <button className={`${classes.roundTopRight} ${classes.resizeButtons}`}
                onMouseMove={isResizeable ? (e) => resizeElement(e, "top-right", category, elementId, elementRef) : undefined}
                onMouseDown={handleIsResizable}
                onMouseUp={handleIsResizable}
            >

            </button>
            <button className={`${classes.roundBottomLeft} ${classes.resizeButtons}`}
                onMouseMove={isResizeable ? (e) => resizeElement(e, "bottom-left", category, elementId, elementRef) : undefined}
                onMouseDown={handleIsResizable}
                onMouseUp={handleIsResizable}
            >

            </button>

            {(selectedElement.category === "line" || selectedElement.category === "rectangle") &&
                <> <button className={`${classes.roundCenterLeft} ${classes.resizeButtons}`}
                    onMouseMove={isResizeable ? (e) => resizeElement(e, "center-left", category, elementId, elementRef) : undefined}
                    onMouseDown={handleIsResizable}
                    onMouseUp={handleIsResizable}
                >

                </button>

                    <button className={`${classes.roundCenterRight} ${classes.resizeButtons}`}
                        onMouseMove={isResizeable ? (e) => resizeElement(e, "center-right", category, elementId, elementRef) : undefined}
                        onMouseDown={handleIsResizable}
                        onMouseUp={handleIsResizable}
                    >

                    </button></>

            }

        </div>
    )

}