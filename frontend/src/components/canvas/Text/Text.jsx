import classes from "./Text.module.css";
import { memo, useLayoutEffect, useRef } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { deferTextareaEdit, hasTextareaDragIntent } from "../../../utils/textareaEditing";
import { sanitizeTextContent } from "../../../utils/sanitizeTextContent";
import {
    clearTextSpacingHoldTimer,
    endTextSpacingHold,
    startTextSpacingHold,
} from "../../../utils/textSpacingHold";

function Text({
    elementId,
    content,
    fontSize,
    color,
    fontFamily,
    left,
    top,
    isSelected,
    isEditing,
    isMove,
    bold,
    italic,
    underline,
    zIndex,
    fixedToPage,
}) {
    const {
        moveElement,
        selectElement,
        selectMoveElement,
        editElementValues,
        setTextareaEditing,
        setSpacingHoldId,
    } = use(PdfContext);

    const nodeRef = useRef(null);
    const editFrameRef = useRef(null);
    const pointerStartRef = useRef(null);
    const spacingHoldTimerRef = useRef(null);

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
        ...(fixedToPage ? { pointerEvents: "none" } : {}),
    };

    useLayoutEffect(() => () => {
        if (editFrameRef.current) {
            window.cancelAnimationFrame(editFrameRef.current);
        }
        endTextSpacingHold({
            timerRef: spacingHoldTimerRef,
            elementId,
            setSpacingHoldId,
        });
    }, [elementId, setSpacingHoldId]);

    // Keep the DOM text in sync when not editing. While contentEditable is on,
    // the browser owns the text node — React must not rewrite children.
    // Paint the sanitized form so NULL/NBSP junk never shows as boxes.
    useLayoutEffect(() => {
        const node = nodeRef.current;
        if (!node || isEditing) return;
        const next = sanitizeTextContent(content) ?? "";
        if (node.textContent !== next) {
            node.textContent = next;
        }
    }, [content, isEditing]);

    useLayoutEffect(() => {
        const node = nodeRef.current;
        if (!isEditing || !node) return;
        clearTextSpacingHoldTimer(spacingHoldTimerRef);
        node.focus({ preventScroll: true });
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }, [isEditing]);

    function startEditing(event) {
        event?.preventDefault();
        event?.stopPropagation();
        endTextSpacingHold({
            timerRef: spacingHoldTimerRef,
            elementId,
            setSpacingHoldId,
        });
        // Let the double-click finish before flipping contentEditable, otherwise
        // the leftover click can start a drag or steal the caret.
        deferTextareaEdit({
            requestFrame: window.requestAnimationFrame,
            cancelFrame: window.cancelAnimationFrame,
            pendingFrame: editFrameRef,
            startEditing: () => {
                setTextareaEditing(elementId, true);
            },
        });
    }

    function finishEditing() {
        const node = nodeRef.current;
        if (node) {
            const next = sanitizeTextContent(node.textContent ?? "") ?? "";
            if (next !== (content ?? "")) {
                editElementValues({ content: next }, elementId);
            }
        }
        setTextareaEditing(elementId, false);
    }

    return (
        <p
            id={elementId}
            ref={nodeRef}
            contentEditable={isEditing && !fixedToPage}
            suppressContentEditableWarning
            spellCheck={false}
            className={`${classes.textElement} ${isEditing ? classes.editing : ""} ${isSelected && !isMove ? classes.selectedElement : ""} ${isMove ? classes.movingElement : ""}`}
            style={style}
            onDoubleClick={isEditing || fixedToPage ? undefined : startEditing}
            onClick={(e) => {
                if (fixedToPage) return;
                if (isEditing) {
                    e.stopPropagation();
                    return;
                }
                selectElement(elementId, e.ctrlKey || e.metaKey);
            }}
            onInput={(e) => {
                if (fixedToPage) return;
                editElementValues(
                    { content: sanitizeTextContent(e.currentTarget.textContent ?? "") ?? "" },
                    elementId,
                );
            }}
            onBlur={() => {
                if (isEditing) finishEditing();
            }}
            onKeyDown={(e) => {
                if (!isEditing) return;
                if (e.key === "Enter" || e.key === "Escape") {
                    e.preventDefault();
                    e.currentTarget.blur();
                }
            }}
            onPointerDown={(e) => {
                if (fixedToPage) return;
                if (isEditing) {
                    e.stopPropagation();
                    return;
                }
                if (e.ctrlKey || e.metaKey) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                pointerStartRef.current = {
                    pointerId: e.pointerId,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    dragging: false,
                };
                startTextSpacingHold({
                    timerRef: spacingHoldTimerRef,
                    elementId,
                    setSpacingHoldId,
                });
            }}
            onPointerUp={(e) => {
                if (fixedToPage) return;
                endTextSpacingHold({
                    timerRef: spacingHoldTimerRef,
                    elementId,
                    setSpacingHoldId,
                });
                if (pointerStartRef.current?.dragging) {
                    selectMoveElement(elementId, false);
                }
                pointerStartRef.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }
            }}
            onPointerCancel={() => {
                if (fixedToPage) return;
                endTextSpacingHold({
                    timerRef: spacingHoldTimerRef,
                    elementId,
                    setSpacingHoldId,
                });
                if (pointerStartRef.current?.dragging) {
                    selectMoveElement(elementId, false);
                }
                pointerStartRef.current = null;
            }}
            onPointerMove={(e) => {
                if (fixedToPage || isEditing) return;
                const pointerStart = pointerStartRef.current;
                if (!pointerStart || pointerStart.pointerId !== e.pointerId) return;
                if (!pointerStart.dragging) {
                    if (!hasTextareaDragIntent(pointerStart, e)) return;
                    pointerStart.dragging = true;
                    endTextSpacingHold({
                        timerRef: spacingHoldTimerRef,
                        elementId,
                        setSpacingHoldId,
                    });
                    selectMoveElement(elementId, true);
                }
                moveElement(e, elementId);
            }}
        />
    );
}

export default memo(Text);
