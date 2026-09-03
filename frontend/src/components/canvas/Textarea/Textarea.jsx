/**
 * Multi-line textarea block with optional auto-height and bullet layout.
 * Edit mode uses a contentEditable surface; display mode mirrors PDF wrap
 * metrics. Plain-text blank paragraphs are preserved as authored spacing.
 * Bare bullet placeholders are trimmed on blur / display so they cannot
 * accidentally inflate section rhythm. `fixedToPage` is inert chrome.
 */
import classes from "./Textarea.module.css";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import Resize from "../../common/Resize/Resize";
import {
    measureNaturalScrollHeight,
    shouldShrinkPreservedLayout,
    trimTrailingEmptyTextareaPayload,
} from "../../../utils/textareaHeight";
import {
    hasTextareaDragIntent,
    resolveTextClickIntent,
} from "../../../utils/textareaEditing";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { sanitizeTextContent } from "../../../utils/sanitizeTextContent";
import { canvasFontFamily } from "../../../utils/canvasFont";
import { hasRuns, sliceRuns } from "../../../utils/textRuns";
import { renderStyledText } from "../../../utils/renderStyledText";
import {
    bulletRunsToEditableHtml,
    createTextareaBackspaceEdit,
    createTextareaEnterEdit,
    getSelectionOffsets,
    runsToHtml,
    serializeEditable,
    setSelectionOffsets,
} from "../../../utils/editableSerialize";
import {
    endTextSpacingHold,
    startTextSpacingHold,
} from "../../../utils/textSpacingHold";
import {
    isCanvasEnterReflowSuppressed,
    onCanvasEnterReflowResume,
} from "../../../utils/canvasEnter";
import { MASTHEAD_TITLE_PLACEHOLDER } from "../../../utils/mastheadBands";

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
            // Intentional blank paragraphs (e.g. between a heading line and a
            // following bullet group) must keep one line box. An empty <div>
            // collapses to 0 height and eats the gap the user typed.
            if (line.length === 0) {
                return <div key={i}>{"\u00A0"}</div>;
            }
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
// mirror that holds exactly the serialized content (flat run spans for ordinary
// text, deterministic marker/body paragraphs for bullets) yields the same height
// as the display <div>. The mirror is cloned from the live node so it inherits
// the identical box width and typography, then sizes itself to the content.
function measureEditableContentHeight(node, content, runs, { bulletList = false } = {}) {
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
    // Bullet mirrors need the same paragraph grid as the live editor; ordinary
    // textareas retain their flat run-span structure.
    mirror.innerHTML = bulletList
        ? bulletRunsToEditableHtml(content, runs)
        : runsToHtml(content, runs);
    // Append inside the same parent so inherited styles and the containing block
    // width match the live edit box exactly.
    (node.parentNode ?? document.body).appendChild(mirror);
    const height = mirror.scrollHeight;
    mirror.remove();
    return Number.isFinite(height) && height > 0 ? height : measureNaturalScrollHeight(node);
}

// Rebuild only when Enter/paste/delete changed the logical paragraph shape.
// Normal character input stays in the live DOM so Chromium keeps its native
// caret, IME composition, and undo history. A rebuild gives every bullet line
// the same marker/body grid used by display mode and the PDF renderer.
function normalizeBulletEditableDom(node, content, runs) {
    if (!node) return;
    const lines = String(content ?? "").split("\n");
    const paragraphs = Array.from(node.children || []).filter(
        (child) => child.hasAttribute?.("data-editable-paragraph"),
    );
    const structureMatches = paragraphs.length === lines.length
        && lines.every((line, index) => {
            const expected = /^\s*•/.test(line) ? "bullet" : "plain";
            return paragraphs[index]?.getAttribute("data-editable-paragraph") === expected;
        });
    if (structureMatches) return;

    const selection = getSelectionOffsets(node);
    node.innerHTML = bulletRunsToEditableHtml(content, runs);
    if (selection) {
        setSelectionOffsets(node, selection.start, selection.end);
    }
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
    textTransform,
    mastheadRole,
    placeholder,
    starterPlaceholder,
    editorHoverOutline,
}) {
    const {
        moveElement,
        selectMoveElement,
        resizeElement,
        editElementValues,
        A4_Elements,
        selectElement,
        setTextareaEditing,
        requestTextEdit,
        fitTextareaToContent,
        setSpacingHoldId,
        editZoomSpreadTransitionRef,
        editorMode,
    } = useCanvasContext();

    const [isResizeable, setIsResizeable] = useState(false);
    const blockRef = useRef(null);
    const editingRef = useRef(null);
    const pointerStartRef = useRef(null);
    const spacingHoldTimerRef = useRef(null);
    // Tracks whether the current pointer sequence turned into a drag, so the
    // trailing click (fired on pointerup) can be told apart from a plain click.
    // Without this a drag-release could select the block or enter editing.
    const didDragRef = useRef(false);
    // Placeholder metadata is not required for persistence: mastheadRole is a
    // durable semantic marker, so saved/reloaded empty job titles keep the same
    // editor hint while the PDF renderer continues to receive empty content.
    const editorPlaceholder = placeholder
        || (mastheadRole === "title" ? MASTHEAD_TITLE_PLACEHOLDER : undefined);
    const initialLayoutPreservedRef = useRef(false);
    // The editable surface commits an authoritative measured height on every
    // input and again on blur. Do not let the display node immediately perform
    // a second background measurement after edit exit: it can observe a
    // transient post-zoom layout and move later flow elements without any
    // content change.
    const skipPostEditAutoMeasureRef = useRef(false);
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
        // Display-only casing (Phase 3 masthead identity). Atrium builds
        // the masthead name/title as a textarea block; CSS transforms the drawn
        // glyphs while the stored content stays original-case, so the name-case
        // toggle is reversible here too.
        textTransform: textTransform || "none",
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
        if (!autoHeight) return undefined;
        if (isEditing) {
            // `commitEditable` owns measurement while editing. Keep a single
            // skip token for the matching display render after blur.
            skipPostEditAutoMeasureRef.current = true;
            return undefined;
        }
        if (skipPostEditAutoMeasureRef.current) {
            skipPostEditAutoMeasureRef.current = false;
            return undefined;
        }

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
            if (mastheadRole) {
                // Masthead name/title boxes are a self-contained identity block
                // (see `mastheadIdentityOps.js`'s "position-preserving, no
                // reflow" contract for the case/title toggles). `fitTextareaToContent`
                // runs the generic record-flow cascade (`reflowTextareaHeight`),
                // which reasons about section/record lanes the masthead does not
                // belong to. On a split-column masthead this produced a
                // stray shifted line under the job title when a case toggle
                // caused the name to wrap onto two lines. Grow/shrink the box in
                // place instead so the fix for clipped text cannot itself
                // misplace unrelated masthead elements.
                editElementValues({ height: measuredHeight }, elementId);
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
        editElementValues,
        elementId,
        fitTextareaToContent,
        fontFamily,
        fontSize,
        isEditing,
        letterSpacing,
        lineHeight,
        mastheadRole,
        preserveInitialLayout,
        // Uppercasing glyphs are wider than mixed case at the same width, so a
        // masthead name-case toggle (`applyNameCaseToggle`) can change the
        // browser's wrap point without touching `content`/`width`/`fontSize`.
        // Without this dependency the effect never re-runs, the stored height
        // stays sized for the previous casing, and `overflow: hidden` (see
        // Textarea.module.css) clips any newly-wrapped line — the "toggling
        // case cuts off the surname" bug.
        textTransform,
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
        // Enter edit on the display-normalized payload. Plain trailing blank
        // paragraphs survive; only bullet-list placeholders are trimmed.
        const seededPayload = trimTrailingEmptyTextareaPayload(
            sanitizeTextContent(content) ?? "",
            runs,
            { bulletList: !!bulletList },
        );
        const seeded = seededPayload.content;
        if (bulletList) {
            node.innerHTML = bulletRunsToEditableHtml(seeded, seededPayload.runs);
        } else if (hasRuns(seededPayload.runs)) {
            node.innerHTML = runsToHtml(seeded, seededPayload.runs);
        } else {
            node.textContent = seeded;
        }

        // A record can enter edit mode before its display node ever performs
        // the auto-height mount pass (newly inserted records are the common
        // case). Measure the seeded edit DOM immediately; otherwise the box
        // keeps its generator/copied height until the first `input` event and
        // users have to create and Backspace a throwaway blank row just to
        // collapse the stale empty space.
        //
        // Keep the generator contract on the first preserved-layout pass:
        // browser metrics may remove overshoot, but must not grow the authored
        // stack before the user changes content. Later typing still uses
        // `commitEditable`, whose measurement can grow or shrink normally.
        const shrinkOnlyFirstPass = preserveInitialLayout
            && !initialLayoutPreservedRef.current;
        if (shrinkOnlyFirstPass) {
            initialLayoutPreservedRef.current = true;
        }
        let cancelled = false;
        const measureSeededEditable = () => {
            const target = editingRef.current;
            if (cancelled || !autoHeight || !target) return;
            const current = serializeEditable(target);
            const measuredHeight = measureEditableContentHeight(
                target,
                current.content,
                current.runs,
                { bulletList: !!bulletList },
            );
            if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
            if (
                shrinkOnlyFirstPass
                && !shouldShrinkPreservedLayout(heightRef.current, measuredHeight)
            ) {
                return;
            }
            target.style.height = `${measuredHeight}px`;
            // Entry-time normalization is background layout work. Keep it out
            // of undo history; only subsequent authored input is a user step.
            fitTextareaToContent(elementId, measuredHeight, { quiet: true });
        };

        measureSeededEditable();
        const unsubscribeResume = onCanvasEnterReflowResume(measureSeededEditable);
        if (typeof document !== "undefined" && document.fonts?.ready) {
            document.fonts.ready.then(measureSeededEditable);
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
            // The replacement edit node now owns the seeded content. Only now
            // release the guard that blocks the old spread node's unmount blur.
            if (editZoomSpreadTransitionRef?.current === elementId) {
                editZoomSpreadTransitionRef.current = null;
            }
        });
        return () => {
            cancelled = true;
            unsubscribeResume();
            window.cancelAnimationFrame(focusFrame);
        };
        // Seed only when entering edit; content/runs changes during editing come
        // from the DOM itself, so they must not re-seed and move the caret.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing]);

    useLayoutEffect(() => () => {
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
        // Mark the replacement synchronously so two-page restoration cannot
        // run between this completed click and the edit-state update.
        requestTextEdit(elementId);
        // This handler runs after pointerup, so the original drag/click
        // interaction has already finished. Enter synchronously to avoid a
        // transient no-edit state that could restore two-page view before a
        // replacement element becomes active.
        setTextareaEditing(elementId, true);
    }

    // Display preserves plain authored blank rows. Bullet-list placeholders
    // remain excluded because they are editor chrome, not document content.
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
        // While typing, keep every newline so Enter can open a blank paragraph.
        // On blur, plain textarea newlines remain authored spacing; bullet-list
        // placeholders alone are removed so section rhythm follows real copy.
        const commitEditable = (node, { finalize = false } = {}) => {
            const serialized = serializeEditable(node);
            const { content: nextContent, runs: nextRuns } = finalize
                ? trimTrailingEmptyTextareaPayload(
                    serialized.content,
                    serialized.runs,
                    { bulletList: !!bulletList },
                )
                : { content: serialized.content, runs: serialized.runs };

            // On blur, collapse trimmed bullet placeholders before exit so the
            // last paint matches stored height. Plain textarea blank rows never
            // enter this branch. During bullet editing, rebuild only after a
            // structural change such as Enter/paste; ordinary typing keeps the
            // live DOM intact so the browser owns caret and undo behaviour.
            if (finalize && nextContent !== serialized.content) {
                if (bulletList) {
                    node.innerHTML = bulletRunsToEditableHtml(nextContent, nextRuns);
                } else if (hasRuns(nextRuns)) {
                    node.innerHTML = runsToHtml(nextContent, nextRuns);
                } else {
                    node.textContent = nextContent;
                }
            } else if (bulletList) {
                normalizeBulletEditableDom(node, nextContent, nextRuns);
            }

            // Measure from the serialized content, not the live editable DOM,
            // so browser-inserted block wrappers cannot inflate height.
            const measuredHeight = measureEditableContentHeight(
                node,
                nextContent,
                nextRuns,
                { bulletList: !!bulletList },
            );
            node.style.height = `${measuredHeight}px`;
            if (autoHeight) {
                editElementValues({
                    content: nextContent,
                    runs: nextRuns,
                    ...(starterPlaceholder && nextContent.trim() ? { starterPlaceholder: false } : {}),
                }, elementId);
                // This is a user edit, not a background settle: keep it as a real
                // undo step (quiet: false) so the content change can be undone.
                fitTextareaToContent(elementId, measuredHeight, { quiet: false });
            } else {
                editElementValues({
                    content: nextContent,
                    runs: nextRuns,
                    height: measuredHeight,
                    ...(starterPlaceholder && nextContent.trim() ? { starterPlaceholder: false } : {}),
                }, elementId);
            }
        };
        return (
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
                    data-placeholder={editorPlaceholder || "Wpisz swój tekst…"}
                    data-editor-hover-outline={editorHoverOutline ? "true" : undefined}
                    onInput={(e) => commitEditable(e.currentTarget)}
                    onBlur={() => {
                        // The 2-page → focused-page edit zoom unmounts this
                        // surface. Ignore that synthetic blur so its transient
                        // empty DOM cannot overwrite the element's real content.
                        if (editZoomSpreadTransitionRef?.current === elementId) return;
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
                        // Chromium sometimes reports Backspace on an empty
                        // explicit paragraph without removing that paragraph.
                        // Handle only structural bullet-list boundaries here;
                        // ordinary character deletion stays native.
                        if (e.key === "Backspace" && bulletList) {
                            const node = e.currentTarget;
                            const serialized = serializeEditable(node);
                            const selection = getSelectionOffsets(node);
                            const edit = createTextareaBackspaceEdit({
                                content: serialized.content,
                                runs: serialized.runs,
                                selection,
                                bulletList: true,
                            });
                            if (edit) {
                                e.preventDefault();
                                node.innerHTML = bulletRunsToEditableHtml(edit.content, edit.runs);
                                setSelectionOffsets(node, edit.caret, edit.caret);
                                commitEditable(node);
                            }
                            return;
                        }
                        // Build Enter from stored-text offsets rather than the
                        // deprecated execCommand path. Bullet paragraphs have a
                        // marker/body DOM grid; native insertion followed by an
                        // immediate grid rebuild could restore the caret to the
                        // previous item, making the new line look impossible.
                        // The pure edit operation keeps runs aligned and gives the
                        // rebuilt paragraph one explicit caret offset.
                        if (e.key === "Enter") {
                            e.preventDefault();
                            const node = e.currentTarget;
                            const serialized = serializeEditable(node);
                            const selection = getSelectionOffsets(node);
                            const edit = createTextareaEnterEdit({
                                content: serialized.content,
                                runs: serialized.runs,
                                selection,
                                bulletList: !!bulletList,
                            });
                            node.innerHTML = bulletList
                                ? bulletRunsToEditableHtml(edit.content, edit.runs)
                                : runsToHtml(edit.content, edit.runs);
                            setSelectionOffsets(node, edit.caret, edit.caret);
                            commitEditable(node);
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
            data-placeholder={editorPlaceholder}
            // Semantic masthead/contact metadata opts this field into a hover
            // outline. The attribute is editor chrome only and never enters
            // the serialized document or exported PDF.
            data-editor-hover-outline={editorHoverOutline ? "true" : undefined}
            data-empty-hint={editorMode === EDITOR_MODE_TEMPLATE
                ? "Kliknij, aby edytować"
                : "Kliknij dwukrotnie, aby edytować"}
            tabIndex={0}
            className={`${classes.block} ${editorHoverOutline ? classes.editorHoverOutline : ""} ${isSelected ? classes.selected : ""}`}
            style={{ ...boxStyle, ...textStyle }}
            onClick={(e) => {
                const intent = resolveTextClickIntent({
                    didDrag: didDragRef.current,
                    additive: e.ctrlKey || e.metaKey,
                    templateMode: editorMode === EDITOR_MODE_TEMPLATE,
                });
                if (intent === "ignore") {
                    didDragRef.current = false;
                    return;
                }
                if (intent === "select-additive") {
                    selectElement(elementId, true);
                    return;
                }
                if (intent === "edit") {
                    startEditing(e);
                    return;
                }
                selectElement(elementId, false);
            }}
            onDoubleClick={(e) => {
                // Freeform textareas need their first click for resize/position
                // selection. Template textareas enter edit on that first click.
                if (editorMode === EDITOR_MODE_TEMPLATE || didDragRef.current) return;
                startEditing(e);
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "F2") {
                    startEditing(e);
                }
            }}
            onPointerDown={(e) => {
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
