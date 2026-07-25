import classes from "./Textarea.module.css";
import { memo, useState } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import Resize from "../../common/Resize/Resize";

// Normalize a bullet's whitespace and render the marker in a dedicated grid
// column. The column's width is the actual rendered "• " width for the active
// font, so every bullet body and continuation line starts at one exact x value.
function renderBulletLines(content) {
    return content.split("\n").map((line, i) => {
        const bulletMatch = line.match(/^\s*•[ \t]*/);
        if (!bulletMatch) {
            return <div key={i}>{line}</div>;
        }

        return (
            <div key={i} className={classes.bulletLine}>
                <span className={classes.bulletMarker}>• </span>
                <span className={classes.bulletBody}>{line.slice(bulletMatch[0].length)}</span>
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
        selectElement,
        setTextareaEditing,
    } = use(PdfContext);

    const [isResizeable, setIsResizeable] = useState(false);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
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
                rows={1}
                className={classes.editing}
                style={{ ...boxStyle, ...textStyle }}
                value={content ?? ""}
                placeholder="Wpisz swój tekst…"
                onChange={(e) => {
                    const node = e.target;
                    node.style.height = "auto";
                    const measuredHeight = node.scrollHeight;
                    node.style.height = `${measuredHeight}px`;
                    editElementValues({ content: node.value, height: measuredHeight }, elementId);
                }}
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
            onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
            onDoubleClick={() => setTextareaEditing(elementId, true)}
            onPointerDown={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                selectMoveElement(elementId, true);
            }}
            onPointerUp={() => selectMoveElement(elementId, false)}
            onPointerMove={(e) => moveElement(e, elementId)}
        >
            {bulletList && content ? renderBulletLines(content) : content}
        </div>
    );

    if (isSelected && selectedCount === 1) {
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
