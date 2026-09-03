/**
 * Selection hairlines drawn above elements (tight glyph bounds for single-line text).
 * Keeps resize chrome off the element DOM so remounts do not break pointer capture.
 */
import { useMemo } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import { getElementOutlineBounds } from "../../../utils/elementBounds";
import classes from "./SelectionOverlay.module.css";

export default function SelectionOverlay({ elements, page }) {
    const { A4_Elements, currentPage, groupMoveDelta } = useCanvasContext();
    const canvasElements = elements ?? A4_Elements;
    const displayedPage = page ?? currentPage;

    const selected = useMemo(
        () => canvasElements.filter((element) => (
            element.isSelected
            // Inline text and textarea edit surfaces own their thin focus
            // outline. Hiding the selection frame avoids a doubled border and
            // ensures an active edit never retains selection-only chrome.
            && !(element.isEditing && ["text", "textarea"].includes(element.category))
            && element.category !== "connector"
            && (element.page ?? 1) === displayedPage
        )),
        [canvasElements, displayedPage]
    );
    const moving = useMemo(
        () => canvasElements.filter((element) => (
            element.isMove
            && element.category !== "connector"
            && (element.page ?? 1) === displayedPage
        )),
        [canvasElements, displayedPage]
    );
    const displayed = selected.length > 0 ? selected : moving;
    const framed = displayed;
    const isMulti = displayed.length > 1;
    if (displayed.length === 0) return null;
    const frames = framed.map((element) => ({
        id: element.element_id,
        ...getElementOutlineBounds(element),
    }));
    const groupFrames = displayed.map((element) => ({
        id: element.element_id,
        ...getElementOutlineBounds(element),
    }));

    const groupBox = groupFrames.reduce((box, frame) => ({
        left: Math.min(box.left, frame.left),
        top: Math.min(box.top, frame.top),
        right: Math.max(box.right, frame.left + frame.width),
        bottom: Math.max(box.bottom, frame.top + frame.height),
    }), {
        left: groupFrames[0].left,
        top: groupFrames[0].top,
        right: groupFrames[0].left + groupFrames[0].width,
        bottom: groupFrames[0].top + groupFrames[0].height,
    });

    return (
        <div className={classes.layer} aria-hidden="true">
            {frames.map((frame) => (
                <div
                    key={frame.id}
                    className={`${classes.frame} ${isMulti ? classes.frameMulti : ""}`}
                    style={{
                        left: frame.left,
                        top: frame.top,
                        width: frame.width,
                        height: frame.height,
                    }}
                >
                </div>
            ))}

            {isMulti && (
                <>
                    <div
                        className={classes.groupFrame}
                        style={{
                            left: groupBox.left,
                            top: groupBox.top,
                            width: groupBox.right - groupBox.left,
                            height: groupBox.bottom - groupBox.top,
                        }}
                    />
                    <div
                        className={classes.badge}
                        style={{ left: groupBox.left, top: groupBox.top }}
                    >
                        <span className={classes.badgeDot} />
                        {`${displayed.length} zaznaczone`}
                    </div>
                </>
            )}
            {groupMoveDelta && groupMoveDelta.page === displayedPage && (
                <div
                    className={classes.deltaBadge}
                    style={{ left: groupBox.left, top: groupBox.bottom }}
                >
                    ΔX {groupMoveDelta.x >= 0 ? "+" : ""}{groupMoveDelta.x}px
                    <span>·</span>
                    ΔY {groupMoveDelta.y >= 0 ? "+" : ""}{groupMoveDelta.y}px
                </div>
            )}
        </div>
    );
}
