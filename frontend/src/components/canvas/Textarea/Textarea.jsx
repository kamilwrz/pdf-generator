import classes from "./Textarea.module.css";
import { memo, useState } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import Resize from "../../common/Resize/Resize";

function Textarea({
    elementId,
    content,
    fontSize,
    fontFamily,
    color,
    lineHeight,
    letterSpacing,
    left,
    top,
    width,
    height,
    isSelected,
    isEditing,
    zIndex,
}) {
    const {
        moveElement,
        selectMoveElement,
        resizeElement,
        editElementValues,
        A4_Elements,
        markSelected,
        setTextareaEditing,
    } = use(PdfContext);

    const [isResizeable, setIsResizeable] = useState(false);
    function handleIsResizeable() {
        setIsResizeable((bool) => !bool);
    }

    // Box geometry and text styling are applied IDENTICALLY to the editing
    // <textarea> and the display <p> so the browser wraps both the same way —
    // which is what the PDF renderer reproduces.
    const boxStyle = {
        position: "absolute",
        left,
        top,
        width,
        height,
        zIndex,
    };
    const textStyle = {
        fontFamily,
        fontSize: `${fontSize}px`,
        lineHeight: `${lineHeight}px`,
        letterSpacing: `${letterSpacing}px`,
        color,
    };

    if (isEditing) {
        return (
            <textarea
                id={elementId}
                autoFocus
                className={classes.editing}
                style={{ ...boxStyle, ...textStyle }}
                value={content ?? ""}
                placeholder="Type your text…"
                onChange={(e) => editElementValues({ content: e.target.value }, elementId)}
                onBlur={() => setTextareaEditing(elementId, false)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        e.currentTarget.blur();
                    }
                }}
            />
        );
    }

    const block = (
        <p
            id={elementId}
            className={`${classes.block} ${isSelected ? classes.selected : ""}`}
            style={{ ...boxStyle, ...textStyle }}
            onClick={() => markSelected(elementId)}
            onDoubleClick={() => setTextareaEditing(elementId, true)}
            onMouseDown={() => selectMoveElement(elementId)}
            onMouseUp={() => selectMoveElement(elementId)}
            onMouseMove={(e) => moveElement(e, elementId)}
        >
            {content}
        </p>
    );

    if (isSelected) {
        const selectedElement = A4_Elements.find((el) => el.element_id === elementId);
        return (
            <>
                <Resize
                    selectedElement={selectedElement}
                    isResizeable={isResizeable}
                    handleIsResizable={handleIsResizeable}
                    resizeElement={resizeElement}
                    category="textarea"
                    elementId={elementId}
                />
                {block}
            </>
        );
    }

    return block;
}

export default memo(Textarea);
