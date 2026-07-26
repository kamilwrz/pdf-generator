import classes from "./Text.module.css";
import { memo } from 'react';
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";

function Text({
    elementId,
    content,
    fontSize,
    color,
    fontFamily,
    left,
    top,
    width,
    height,
    isSelected,
    isEditing,
    isMove,
    category,
    bold,
    italic,
    underline,
    zIndex }) {

    const {
        moveElement,
        selectElement,
        selectMoveElement,
        editElementValues,
        setTextareaEditing,
    } = use(PdfContext);

    const style = {
        fontSize: `${fontSize}px`,
        color,
        fontFamily,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
        position: "absolute",
        left,
        top,
        zIndex,
        width,
        height,
    }

    if (isEditing) {
        return (
            <input
                id={elementId}
                autoFocus
                size={Math.max(1, String(content ?? "").length)}
                className={classes.editingInput}
                style={style}
                value={content ?? ""}
                onChange={(event) => editElementValues({ content: event.target.value }, elementId)}
                onBlur={() => setTextareaEditing(elementId, false)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                        event.preventDefault();
                        event.currentTarget.blur();
                    }
                }}
            />
        );
    }

    return <p
        id={elementId}
        onDoubleClick={(event) => {
            event.stopPropagation();
            setTextareaEditing(elementId, true);
        }}
        onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
        onPointerDown={(e) => {
            if (e.ctrlKey || e.metaKey) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            selectMoveElement(elementId, true);
        }}
        onPointerUp={() => selectMoveElement(elementId, false)}
        onPointerMove={(e) => moveElement(e, elementId)}
        className={`${classes.textElement} ${isSelected && !isMove ? classes.selectedElement : ""} ${isMove ? classes.movingElement : ""}`}
        style={style}
    >
        {content}
    </p>
}

export default memo(Text)