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
    isMove,
    category,
    bold,
    italic,
    underline,
    zIndex }) {

    const { moveElement, selectElement, selectMoveElement } = use(PdfContext);

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

    return <p
        id={elementId}
        onDoubleClick={() => selectElement(elementId)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); selectMoveElement(elementId); }}
        onPointerUp={() => selectMoveElement(elementId)}
        onPointerMove={(e) => moveElement(e, elementId)}
        className={`${classes.textElement} ${isSelected ? classes.selectedElement : ""}`}
        style={style}
    >
        {content}
    </p>
}

export default memo(Text)