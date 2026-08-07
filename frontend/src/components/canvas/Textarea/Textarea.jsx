/**
 * Multi-line textarea block with optional auto-height and bullet layout.
 * Edit mode uses a contentEditable surface; display mode mirrors PDF wrap
 * metrics. Trailing blank / bare-bullet rows are trimmed so they cannot
 * inflate measured height or section rhythm. `fixedToPage` is inert chrome.
 */
import classes from "./Textarea.module.css";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import Resize from "../../common/Resize/Resize";
import {
    measureNaturalScrollHeight,
    shouldShrinkPreservedLayout,
    trimTrailingEmptyTextareaPayload,
} from "../../../utils/textareaHeight";
import { deferTextareaEdit, hasTextareaDragIntent } from "../../../utils/textareaEditing";
import { sanitizeTextContent } from "../../../utils/sanitizeTextContent";
import { canvasFontFamily } from "../../../utils/canvasFont";
import { hasRuns, sliceRuns } from "../../../utils/textRuns";
import { renderStyledText } from "../../../utils/renderStyledText";
import { runsToHtml, serializeEditable } from "../../../utils/editableSerialize";
import InlineFormatToolbar from "../InlineFormatToolbar/InlineFormatToolbar";
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
//
// `runs` are global character offsets over the whole content; each line slices
// the runs to its own window (and the bullet body to the post-marker window) so
// inline decoration is preserved per line. With no runs each line body renders
// as a plain string, identical to the pre-feature output.
function renderBulletLines(content, runs) {
    let offset = 0;
    return content.split("\n").map((line, i) => {
        const lineStart = offset;
        // Advance past this line plus the "\n" that split() removed.
        offset += line.length + 1;

        const bulletMatch = line.match(/^\s*•[ \t]*/);
        if (!bulletMatch) {
            const lineRuns = sliceRuns(runs, lineStart, lineStart + line.length);
            return <div key={i}>{renderStyledText(line, lineRuns)}</div>;
        }

        const bodyStart = lineStart + bulletMatch[0].length;
        const body = line.slice(bulletMatch[0].length);
        const bodyRuns = sliceRuns(runs, bodyStart, lineStart + line.length);
        return (
            <div key={i} className={classes.bulletLine}>
                <span className={classes.bulletMarker}>• </span>
                <span className={classes.bulletBody}>{renderStyledText(body, bodyRuns)}</span>
            </div>
        );
    });
}

// Choose display children for a textarea box: bullet layout, styled spans, or
// (fast path) the raw sanitized string when the element carries no inline runs.
function renderTextareaBody(content, runs, bulletList) {
    if (bulletList && content) return renderBulletLines(content, runs);
    if (hasRuns(runs)) return renderStyledText(content, runs);
    return content;
}

// Measure the true rendered height of the edit box's CONTENT, independent of the
// live contentEditable DOM.
//
// A contentEditable div can accumulate browser-inserted block wrappers (e.g. on
// Enter or paste). Under white-space: pre-wrap those wrappers coexist with the
// original "\n" text nodes, so every line is counted twice and the element's own
// scrollHeight returns roughly double the real height. Measuring a detached
// mirror that holds exactly the serialized content (flat text + inline run spans,
// never block wrappers) yields the same height the display <div> and the former
// <textarea> produced. The mirror is cloned from the live node so it inherits the
// identical box width and typography, then sized to content.
function measureEditableContentHeight(node, content, runs) {
    if (!node?.cloneNode || typeof document === "undefined") {
        return measureNaturalScrollHeight(node);
    }
    const mirror = node.cloneNode(false);
    mirror.removeAttribute("id");
    mirror.contentEditable = "false";
    mirror.style.height = "auto";
    mirror.style.visibility = "hidden";
    mirror.style.position = "absolute";
    mirror.style.left = "-99999px";
    mirror.style.top = "0";
    // runsToHtml produces the same flat structure the edit surface should hold.
    mirror.innerHTML = runsToHtml(content, runs);
    // Append inside the same parent so inherited styles and the containing block
    // width match the live edit box exactly.
    (node.parentNode ?? document.body).appendChild(mirror);
    const height = mirror.scrollHeight;
    mirror.remove();
    return Number.isFinite(height) && height > 0 ? height : measureNaturalScrollHeight(node);
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
    runs,
    align,
    bulletList,
    autoHeight,
    preserveInitialLayout,
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
    const initialLayoutPreservedRef = useRef(false);
    // Keep the latest authored height for shrink comparisons without re-running
    // the mount effect whenever fitTextareaToContent updates `height`.
    const heightRef = useRef(height);
    heightRef.current = height;
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
        // Same face the PDF embeds (Helvetica/Courier → Inter).
        fontFamily: canvasFontFamily(fontFamily),
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
    //
    // preserveInitialLayout (generator-filled CVs): skip *growth* on the first
    // mount so independent expands cannot race and stretch section gaps, but
    // still shrink when ReportLab overshoots browser metrics. Empty slack at
    // the bottom of a box makes SPACE_SECTION look uneven across templates.
    // User edits and later font/width changes use the full measure path.
    useLayoutEffect(() => {
        if (!autoHeight || isEditing) return undefined;

        let cancelled = false;
        const applyMeasuredHeight = (measuredHeight, { allowGrow }) => {
            if (cancelled || isCanvasEnterReflowSuppressed()) return;
            if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
            if (
                !allowGrow
                && !shouldShrinkPreservedLayout(heightRef.current, measuredHeight)
            ) {
                return;
            }
            fitTextareaToContent(elementId, measuredHeight);
        };

        const measure = ({ allowGrow }) => {
            applyMeasuredHeight(
                measureNaturalScrollHeight(blockRef.current),
                { allowGrow },
            );
        };

        // First mount on generator-filled CVs: shrink-only for this effect's
        // lifetime (including fonts.ready / enter-resume). Later content or
        // typography changes remount the effect with allowGrow=true.
        const shrinkOnlyFirstPass = preserveInitialLayout && !initialLayoutPreservedRef.current;
        if (shrinkOnlyFirstPass) {
            initialLayoutPreservedRef.current = true;
        }
        const allowGrow = !shrinkOnlyFirstPass;

        measure({ allowGrow });
        const unsubscribeResume = onCanvasEnterReflowResume(() => measure({ allowGrow }));
        if (typeof document !== "undefined" && document.fonts?.ready) {
            document.fonts.ready.then(() => measure({ allowGrow }));
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
        preserveInitialLayout,
        width,
    ]);

    // Seed the contentEditable edit surface with the current content, then
    // focus it with the caret at the end. Plain content is written as a text
    // node (byte-identical editing to the former <textarea>); decorated content
    // is written as styled spans so inline marks are visible and editable.
    // The DOM is authoritative while editing; React must not re-render children
    // of the editable, so this runs once per edit-enter.
    useLayoutEffect(() => {
        if (!isEditing || !editingRef.current) return undefined;

        const node = editingRef.current;
        // Enter edit on already-trimmed copy so a prior session's trailing
        // empties cannot reopen a tall orange outline on the first paint.
        const seededPayload = trimTrailingEmptyTextareaPayload(
            sanitizeTextContent(content) ?? "",
            runs,
            { bulletList: !!bulletList },
        );
        const seeded = seededPayload.content;
        if (hasRuns(seededPayload.runs)) {
            node.innerHTML = runsToHtml(seeded, seededPayload.runs);
        } else {
            node.textContent = seeded;
        }

        const focusFrame = window.requestAnimationFrame(() => {
            const target = editingRef.current;
            if (!target) return;
            target.focus({ preventScroll: true });
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.selectNodeContents(target);
            range.collapse(false); // caret at end, matching the old textarea
            selection.removeAllRanges();
            selection.addRange(range);
        });
        return () => window.cancelAnimationFrame(focusFrame);
        // Seed only when entering edit; content/runs changes during editing come
        // from the DOM itself, so they must not re-seed and move the caret.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Display never paints trailing blank / bare-bullet rows — those inflate
    // scrollHeight and break template rhythm under the next record.
    const {
        content: cleanContent,
        runs: cleanRuns,
    } = trimTrailingEmptyTextareaPayload(
        sanitizeTextContent(content) ?? "",
        runs,
        { bulletList: !!bulletList },
    );

    if (fixedToPage) {
        return (
            <div
                id={elementId}
                ref={blockRef}
                className={classes.block}
                style={{ ...boxStyle, ...textStyle }}
            >
                {renderTextareaBody(cleanContent, cleanRuns, bulletList)}
            </div>
        );
    }

    if (isEditing) {
        // Commit the edit surface's DOM as { content, runs } and keep the box
        // height in sync. Extracted so both typing and toolbar mark changes
        // (which can shift wrap width) run the identical measure + commit path.
        //
        // Trailing empties: while typing keep at most one blank row (room for
        // the next bullet after Enter). On blur drop every trailing empty so
        // stored height matches visible copy.
        const commitEditable = (node, { finalize = false } = {}) => {
            const serialized = serializeEditable(node);
            const { content: nextContent, runs: nextRuns } = trimTrailingEmptyTextareaPayload(
                serialized.content,
                serialized.runs,
                {
                    bulletList: !!bulletList,
                    keepTrailingEmptyLines: finalize ? 0 : 1,
                },
            );

            // Collapse surplus trailing empties in the live DOM so the caret
            // cannot sit below the measured (trimmed) height with overflow hidden.
            if (nextContent !== serialized.content) {
                if (hasRuns(nextRuns)) {
                    node.innerHTML = runsToHtml(nextContent, nextRuns);
                } else {
                    node.textContent = nextContent;
                }
                const selection = window.getSelection();
                if (selection) {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }

            // Measure from the serialized/trimmed content, not the live editable
            // DOM, so browser-inserted block wrappers cannot inflate height.
            const measuredHeight = measureEditableContentHeight(node, nextContent, nextRuns);
            node.style.height = `${measuredHeight}px`;
            if (autoHeight) {
                editElementValues({ content: nextContent, runs: nextRuns }, elementId);
                fitTextareaToContent(elementId, measuredHeight);
            } else {
                editElementValues({ content: nextContent, runs: nextRuns, height: measuredHeight }, elementId);
            }
        };
        return (
            <>
                <InlineFormatToolbar
                    nodeRef={editingRef}
                    isEditing={isEditing}
                    onApply={() => {
                        // The toolbar has already rewritten the DOM; re-measure
                        // and commit so the run change is persisted with height.
                        if (editingRef.current) commitEditable(editingRef.current);
                    }}
                />
                <div
                    // Distinct key from the display block below. The edit surface
                    // and the display block are both <div id={elementId}> at the
                    // same fragment position, so without different keys React
                    // reuses ONE DOM node across the edit↔display transition. The
                    // edit box is seeded imperatively (node.textContent / innerHTML),
                    // content React does not track; on exit React would append the
                    // display grid WITHOUT removing that orphaned text node, leaving
                    // the content — and the measured height — doubled. Distinct keys
                    // force a clean unmount/remount, matching the old <textarea>
                    // (whose element-type change did this implicitly).
                    key="textarea-edit"
                    id={elementId}
                    ref={editingRef}
                    className={classes.editing}
                    style={{ ...boxStyle, ...textStyle }}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    data-placeholder="Wpisz swój tekst…"
                    onInput={(e) => commitEditable(e.currentTarget)}
                    onBlur={() => {
                        if (editingRef.current) {
                            commitEditable(editingRef.current, { finalize: true });
                        }
                        setTextareaEditing(elementId, false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            e.preventDefault();
                            e.currentTarget.blur();
                            return;
                        }
                        // Insert newlines as a plain "\n" text character instead of
                        // letting the browser wrap lines in <div> blocks. Under
                        // white-space: pre-wrap a block wrapper leaves the original
                        // "\n" text node in place, so each line is counted twice and
                        // measureNaturalScrollHeight returns ~2x the real height. A
                        // flat "\n"-only structure keeps the edit surface as reliable
                        // to measure as the former <textarea>. insertText fires a
                        // native input event, so commitEditable still runs.
                        if (e.key === "Enter") {
                            e.preventDefault();
                            document.execCommand("insertText", false, "\n");
                        }
                    }}
                    onPaste={(e) => {
                        // Paste as plain text so clipboard HTML cannot introduce the
                        // block wrappers that corrupt height measurement (and would
                        // also carry foreign inline styles into the content).
                        e.preventDefault();
                        const text = e.clipboardData?.getData("text/plain") ?? "";
                        document.execCommand("insertText", false, text);
                    }}
                />
            </>
        );
    }

    const block = (
        <div
            // Distinct key from the edit surface — see the note on the edit
            // <div> above. Prevents React from reusing the contentEditable DOM
            // node (with its imperatively-seeded, untracked text) as this block.
            key="textarea-display"
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
            {renderTextareaBody(cleanContent, cleanRuns, bulletList)}
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
