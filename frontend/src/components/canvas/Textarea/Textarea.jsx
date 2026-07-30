/**
 * Multi-line textarea block with optional auto-height and bullet layout.
 * Edit mode uses a native <textarea>; display mode mirrors PDF wrap metrics.
 * `fixedToPage` renders as inert chrome.
 */
import classes from "./Textarea.module.css";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import Resize from "../../common/Resize/Resize";
import { measureNaturalScrollHeight } from "../../../utils/textareaHeight";
import { deferTextareaEdit, hasTextareaDragIntent } from "../../../utils/textareaEditing";
import { sanitizeTextContent } from "../../../utils/sanitizeTextContent";
import {
    endTextSpacingHold,
    startTextSpacingHold,
} from "../../../utils/textSpacingHold";
import {
    isCanvasEnterReflowSuppressed,
    onCanvasEnterReflowResume,
} from "../../../utils/canvasEnter";

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
    isMove,
    bold,
    italic,
    underline,
    align,
    bulletList,
    autoHeight,
    zIndex,
    fixedToPage,
}) {
    const {
        moveElement,
        selectMoveElement,
        resizeElement,
        editElementValues,
        A4_Elements,
        selectElement,
        setTextareaEditing,
        fitTextareaToContent,
        setSpacingHoldId,
    } = use(PdfContext);

    const [isResizeable, setIsResizeable] = useState(false);
    const blockRef = useRef(null);
    const editingRef = useRef(null);
    const editFrameRef = useRef(null);
    const pointerStartRef = useRef(null);
    const spacingHoldTimerRef = useRef(null);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
    function handleIsResizeable(active) {
        setIsResizeable(Boolean(active));
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
        ...(fixedToPage ? { pointerEvents: "none" } : {}),
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

    // scrollHeight is the browser's actual line layout for this exact font,
    // width, spacing, and bullet rendering. It is more accurate than the
    // authoring-time estimate carried by a template spec.
    // While canvas enter holds content at opacity 0, reflow is suppressed —
    // remasure as soon as that hold ends so webfont metrics drive packing.
    useLayoutEffect(() => {
        if (!autoHeight || isEditing) return undefined;

        let cancelled = false;
        const measure = () => {
            if (cancelled || isCanvasEnterReflowSuppressed()) return;
            const measuredHeight = measureNaturalScrollHeight(blockRef.current);
            if (!cancelled && Number.isFinite(measuredHeight) && measuredHeight > 0) {
                fitTextareaToContent(elementId, measuredHeight);
            }
        };

        measure();
        const unsubscribeResume = onCanvasEnterReflowResume(measure);
        if (typeof document !== "undefined" && document.fonts?.ready) {
            document.fonts.ready.then(measure);
        }
        return () => {
            cancelled = true;
            unsubscribeResume();
        };
    }, [
        autoHeight,
        bold,
        bulletList,
        content,
        elementId,
        fitTextareaToContent,
        fontFamily,
        fontSize,
        isEditing,
        letterSpacing,
        lineHeight,
        width,
    ]);

    useLayoutEffect(() => {
        if (!isEditing || !editingRef.current) return undefined;

        const focusFrame = window.requestAnimationFrame(() => {
            editingRef.current?.focus();
        });
        return () => window.cancelAnimationFrame(focusFrame);
    }, [isEditing]);

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

    function startEditing(event) {
        event?.preventDefault();
        event?.stopPropagation();
        endTextSpacingHold({
            timerRef: spacingHoldTimerRef,
            elementId,
            setSpacingHoldId,
        });
        // Finish the double-click event sequence before replacing its target
        // with a native textarea. Entering edit state during pointerdown lets
        // the remaining click steal focus from the new input.
        deferTextareaEdit({
            requestFrame: window.requestAnimationFrame,
            cancelFrame: window.cancelAnimationFrame,
            pendingFrame: editFrameRef,
            startEditing: () => {
                setTextareaEditing(elementId, true);
            },
        });
    }

    const cleanContent = sanitizeTextContent(content) ?? "";

    if (fixedToPage) {
        return (
            <div
                id={elementId}
                ref={blockRef}
                className={classes.block}
                style={{ ...boxStyle, ...textStyle }}
            >
                {bulletList && cleanContent ? renderBulletLines(cleanContent) : cleanContent}
            </div>
        );
    }

    if (isEditing) {
        return (
            <textarea
                id={elementId}
                ref={editingRef}
                autoFocus
                rows={1}
                className={classes.editing}
                style={{ ...boxStyle, ...textStyle }}
                value={cleanContent}
                placeholder="Wpisz swój tekst…"
                onChange={(e) => {
                    const node = e.target;
                    const measuredHeight = measureNaturalScrollHeight(node);
                    node.style.height = `${measuredHeight}px`;
                    const nextContent = sanitizeTextContent(node.value) ?? "";
                    if (autoHeight) {
                        editElementValues({ content: nextContent }, elementId);
                        fitTextareaToContent(elementId, measuredHeight);
                    } else {
                        editElementValues({ content: nextContent, height: measuredHeight }, elementId);
                    }
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
            ref={blockRef}
            className={`${classes.block} ${isSelected ? classes.selected : ""}`}
            style={{ ...boxStyle, ...textStyle }}
            onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
            onDoubleClick={startEditing}
            onPointerDown={(e) => {
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
                const pointerStart = pointerStartRef.current;
                if (!pointerStart) return;
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
        >
            {bulletList && cleanContent ? renderBulletLines(cleanContent) : cleanContent}
        </div>
    );

    if (isSelected && selectedCount === 1 && !isMove) {
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
