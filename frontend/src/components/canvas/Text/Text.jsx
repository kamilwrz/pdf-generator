import classes from "./Text.module.css";
import { memo, useLayoutEffect, useRef } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { deferTextareaEdit, hasTextareaDragIntent } from "../../../utils/textareaEditing";

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
    bold,
    italic,
    underline,
    zIndex,
}) {
    const {
        moveElement,
        selectElement,
        selectMoveElement,
        editElementValues,
        setTextareaEditing,
    } = use(PdfContext);

    const editFrameRef = useRef(null);
    const pointerStartRef = useRef(null);
    const editingRef = useRef(null);

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
    };

    useLayoutEffect(() => () => {
        if (editFrameRef.current) {
            window.cancelAnimationFrame(editFrameRef.current);
        }
    }, []);

    // Keep caret at end after entering edit — avoids a mid-glyph selection
    // chrome flash that looks like a broken border handle.
    useLayoutEffect(() => {
        if (!isEditing || !editingRef.current) return;
        const node = editingRef.current;
        const len = node.value?.length ?? 0;
        try {
            node.setSelectionRange(len, len);
        } catch {
            // Some browsers reject setSelectionRange while the input is hidden.
        }
    }, [isEditing]);

    function startEditing(event) {
        event?.preventDefault();
        event?.stopPropagation();
        // Finish the double-click sequence before replacing <p> with <input>,
        // otherwise the leftover click steals focus / leaves stale selection chrome.
        deferTextareaEdit({
            requestFrame: window.requestAnimationFrame,
            cancelFrame: window.cancelAnimationFrame,
            pendingFrame: editFrameRef,
            startEditing: () => {
                setTextareaEditing(elementId, true);
            },
        });
    }

    if (isEditing) {
        return (
            <input
                id={elementId}
                ref={editingRef}
                autoFocus
                size={Math.max(1, String(content ?? "").length || 1)}
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
                onPointerDown={(event) => event.stopPropagation()}
            />
        );
    }

    return (
        <p
            id={elementId}
            onDoubleClick={startEditing}
            onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
            onPointerDown={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                pointerStartRef.current = {
                    pointerId: e.pointerId,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    dragging: false,
                };
            }}
            onPointerUp={(e) => {
                if (pointerStartRef.current?.dragging) {
                    selectMoveElement(elementId, false);
                }
                pointerStartRef.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }
            }}
            onPointerCancel={() => {
                if (pointerStartRef.current?.dragging) {
                    selectMoveElement(elementId, false);
                }
                pointerStartRef.current = null;
            }}
            onPointerMove={(e) => {
                const pointerStart = pointerStartRef.current;
                if (!pointerStart || pointerStart.pointerId !== e.pointerId) return;
                if (!pointerStart.dragging) {
                    if (!hasTextareaDragIntent(pointerStart, e)) return;
                    pointerStart.dragging = true;
                    selectMoveElement(elementId, true);
                }
                moveElement(e, elementId);
            }}
            className={`${classes.textElement} ${isSelected && !isMove ? classes.selectedElement : ""} ${isMove ? classes.movingElement : ""}`}
            style={style}
        >
            {content}
        </p>
    );
}

export default memo(Text);
