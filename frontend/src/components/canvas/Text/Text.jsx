/**
 * Single-line text element: select, drag, contentEditable edit.
 * `fixedToPage` chrome (e.g. page numbers) is non-interactive.
 *
 * Unlike Textarea, this component uses one <p> for display and edit and does
 * not render React children. Content is written imperatively. Edit-zoom from a
 * two-page spread remounts that <p> while `isEditing` is already true, so the
 * node must be re-seeded from stored content on edit enter.
 */
import classes from "./Text.module.css";
import { memo, useLayoutEffect, useRef } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { deferTextareaEdit, hasTextareaDragIntent } from "../../../utils/textareaEditing";
import { sanitizeTextContent } from "../../../utils/sanitizeTextContent";
import { canvasFontFamily } from "../../../utils/canvasFont";
import { hasRuns } from "../../../utils/textRuns";
import { runsToHtml, serializeEditable } from "../../../utils/editableSerialize";
import {
    clearTextSpacingHoldTimer,
    endTextSpacingHold,
    startTextSpacingHold,
} from "../../../utils/textSpacingHold";
import { seedTextEditNode, shouldCommitTextEditBlur } from "../../../utils/textEditSurface";

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
    runs,
    zIndex,
    fixedToPage,
    placeholder,
    selectAllOnEdit,
    textTransform,
}) {
    const {
        moveElement,
        selectElement,
        selectMoveElement,
        editElementValues,
        setTextareaEditing,
        setSpacingHoldId,
        editZoomSpreadTransitionRef,
    } = use(PdfContext);

    const nodeRef = useRef(null);
    const editFrameRef = useRef(null);
    const pointerStartRef = useRef(null);
    const spacingHoldTimerRef = useRef(null);
    // Tracks whether the current pointer sequence turned into a drag, so the
    // trailing click (fired on pointerup) can be told apart from a plain
    // click-to-edit tap. Without this a drag-release would immediately flip
    // the element into edit mode.
    const didDragRef = useRef(false);

    const style = {
        fontSize: `${fontSize}px`,
        color,
        // Resolve Helvetica/Courier → Inter so wrap matches the PDF alias.
        fontFamily: canvasFontFamily(fontFamily),
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
        // Display-only casing (Phase 3 masthead identity). CSS transforms the
        // rendered glyphs while the contentEditable value stays original-case, so
        // the name-case toggle is reversible and serialization is unchanged.
        textTransform: textTransform || "none",
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

    // Keep the DOM in sync when not editing. While contentEditable is on, the
    // browser owns the node — React must not rewrite children.
    // With inline runs the node is painted as styled spans (innerHTML); without
    // runs it stays a plain text node, byte-identical to the pre-feature path.
    // Either way the sanitized form is used so NULL/NBSP junk never shows.
    useLayoutEffect(() => {
        const node = nodeRef.current;
        if (!node || isEditing) return;
        const next = sanitizeTextContent(content) ?? "";
        if (hasRuns(runs)) {
            const html = runsToHtml(next, runs);
            if (node.innerHTML !== html) {
                node.innerHTML = html;
            }
        } else if (node.textContent !== next) {
            node.textContent = next;
        }
    }, [content, runs, isEditing]);

    useLayoutEffect(() => {
        const node = nodeRef.current;
        if (!isEditing || !node) return;
        // Seed from authored state before focusing. Required when edit-zoom
        // remounts this node (two-page spread → focused page): the new <p>
        // starts empty, and the display-sync effect above skips while
        // `isEditing` is already true. Textarea never hits this because it
        // has a dedicated edit surface that always writes `content` on enter.
        seedTextEditNode(node, content, runs);
        clearTextSpacingHoldTimer(spacingHoldTimerRef);
        node.focus({ preventScroll: true });
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        // Freshly added contact labels open with their seed text selected (no
        // collapse) so the first keystroke replaces it; every other element
        // collapses to the end for append-style editing.
        if (!selectAllOnEdit) range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        // The spread's old node can blur during this render commit. Release the
        // transition guard only on the next frame, after this replacement node
        // has received its authored content and focus.
        const releaseFrame = window.requestAnimationFrame(() => {
            if (editZoomSpreadTransitionRef?.current === elementId) {
                editZoomSpreadTransitionRef.current = null;
            }
        });
        return () => window.cancelAnimationFrame(releaseFrame);
        // Seed only when entering edit or remounting already-editing. Content
        // changes during typing come from the DOM; re-seeding would move the
        // caret.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editZoomSpreadTransitionRef, elementId, isEditing, selectAllOnEdit]);

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
            // Serialize captures both the text and any inline decoration spans.
            const { content: next, runs: nextRuns } = serializeEditable(node);
            editElementValues({ content: next, runs: nextRuns }, elementId);
        }
        setTextareaEditing(elementId, false);
    }

    return (
        <p
            id={elementId}
            ref={nodeRef}
            // A labelled empty contact label reserves a hit area and shows a
            // hint via CSS (see Text.module.css). The attribute is omitted when
            // there is no placeholder so every other text element is unaffected.
            data-placeholder={placeholder || undefined}
            contentEditable={isEditing && !fixedToPage}
            suppressContentEditableWarning
            spellCheck={false}
            className={`${classes.textElement} ${isEditing ? classes.editing : ""} ${isSelected && !isMove ? classes.selectedElement : ""} ${isMove ? classes.movingElement : ""}`}
            style={style}
            onClick={(e) => {
                if (fixedToPage) return;
                if (isEditing) {
                    e.stopPropagation();
                    // The element can be flagged editing before the browser has
                    // placed the caret in it (e.g. auto-edit on a just-added
                    // contact). Ensure the click focuses the node so typing lands.
                    if (nodeRef.current && document.activeElement !== nodeRef.current) {
                        nodeRef.current.focus({ preventScroll: true });
                    }
                    return;
                }
                // A drag release also dispatches a trailing click; ignore it so
                // the element does not jump into edit mode right after a move.
                if (didDragRef.current) {
                    didDragRef.current = false;
                    return;
                }
                if (e.ctrlKey || e.metaKey) {
                    selectElement(elementId, true);
                    return;
                }
                // Single click enters edit mode directly (previously required a
                // double click); ctrl/meta-click above still only multi-selects.
                startEditing(e);
            }}
            onInput={(e) => {
                if (fixedToPage) return;
                const { content: next, runs: nextRuns } = serializeEditable(e.currentTarget);
                editElementValues({ content: next, runs: nextRuns }, elementId);
            }}
            onBlur={() => {
                // The two-page edit zoom unmounts the old contentEditable
                // surface. That browser blur must not serialize the transient
                // empty node or clear `isEditing` before the replacement
                // node is seeded from stored content.
                if (!shouldCommitTextEditBlur({
                    node: nodeRef.current,
                    elementId,
                    spreadTransitionId: editZoomSpreadTransitionRef?.current,
                })) {
                    return;
                }
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
                didDragRef.current = false;
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
                    didDragRef.current = true;
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
