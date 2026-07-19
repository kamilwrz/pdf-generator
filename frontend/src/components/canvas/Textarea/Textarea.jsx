import classes from "./Textarea.module.css";
import { memo, useState } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import Resize from "../../common/Resize/Resize";

// Same factor as the backend's BULLET_INDENT_FACTOR (pdf_generator.py), so
// the canvas preview and the PDF hang-indent by the same amount.
const BULLET_INDENT_FACTOR = 1.1;

// Splits content into one node per line, applying a hanging indent (via
// negative text-indent) to lines that already start with "•" — so a
// wrapped bullet line's continuation text lines up under the bullet's
// text instead of under the bullet itself.
function renderBulletLines(content, fontSize) {
    const indent = fontSize * BULLET_INDENT_FACTOR;
    return content.split("\n").map((line, i) => {
        const isBullet = line.trimStart().startsWith("•");
        return (
            <div key={i} style={isBullet ? { paddingLeft: indent, textIndent: -indent } : undefined}>
                {line}
            </div>
        );
    });
}

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
    bold,
    italic,
    underline,
    align,
    bulletList,
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
    // <textarea> and the display <div> so the browser wraps both the same way —
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
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
        textAlign: align || "left",
    };

    if (isEditing) {
        return (
            <textarea
                id={elementId}
                autoFocus
                className={classes.editing}
                style={{ ...boxStyle, ...textStyle }}
                value={content ?? ""}
                placeholder="Wpisz swój tekst…"
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
        <div
            id={elementId}
            className={`${classes.block} ${isSelected ? classes.selected : ""}`}
            style={{ ...boxStyle, ...textStyle }}
            onClick={() => markSelected(elementId)}
            onDoubleClick={() => setTextareaEditing(elementId, true)}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); selectMoveElement(elementId, true); }}
            onPointerUp={() => selectMoveElement(elementId, false)}
            onPointerMove={(e) => moveElement(e, elementId)}
        >
            {bulletList && content ? renderBulletLines(content, fontSize) : content}
        </div>
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
