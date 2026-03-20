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
    zIndex }) {

    const { moveElement, selectElement, selectMoveElement } = use(PdfContext);

    const style = {
        fontSize: fontSize,
        color: color,
        fontFamily: fontFamily,
        position: "absolute",
        left: left,
        top: top,
        zIndex: zIndex,
        width: width,
        height: height,
    }

    return <p
        id={elementId}
        onDoubleClick={() => selectElement(elementId)}
        onMouseDown={() => selectMoveElement(elementId)}
       // onMouseLeave={() => selectMoveElement(elementId)}
        onMouseUp={() => selectMoveElement(elementId)}
        onMouseMove={(e) => moveElement(e, elementId)}
        className={isSelected ? classes.selectedElement : ""}
        style={style}
    >
        {content}
    </p>
}

export default memo(Text)