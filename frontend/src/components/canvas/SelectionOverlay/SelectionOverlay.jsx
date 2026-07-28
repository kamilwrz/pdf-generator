import { useMemo } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { getElementBounds } from "../../../utils/elementBounds";
import classes from "./SelectionOverlay.module.css";

function frameForElement(element) {
    const left = Number(element.left) || 0;
    const top = Number(element.top) || 0;

    // Use the element's own box for every category — including text — so the
    // selection frame does not jump when a <p> swaps to an <input> on edit.
    const { width, height } = getElementBounds(element);
    const fontSize = Number(element.fontSize) || 12;
    const minW = element.category === "text" ? fontSize * 0.5 : 1;
    const minH = element.category === "text" ? fontSize * 0.8 : 1;
    return {
        left,
        top,
        width: Math.max(width, minW, 1),
        height: Math.max(height, minH, 1),
    };
}

export default function SelectionOverlay({ elements, page }) {
    const { A4_Elements, currentPage, groupMoveDelta } = use(PdfContext);
    const canvasElements = elements ?? A4_Elements;
    const displayedPage = page ?? currentPage;

    const selected = useMemo(
        () => canvasElements.filter((element) => (
            element.isSelected
            // Textarea draws its own accent outline while editing; text keeps
            // the shared selection frame so chrome does not jump on dbl-click.
            && !(element.isEditing && element.category === "textarea")
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
    const isMoving = displayed.some((element) => element.isMove);
    const framed = displayed;
    const isMulti = displayed.length > 1;
    if (displayed.length === 0) return null;
    const frames = framed.map((element) => ({
        id: element.element_id,
        ...frameForElement(element),
    }));
    const groupFrames = displayed.map((element) => ({
        id: element.element_id,
        ...frameForElement(element),
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
                        className={`${classes.frame} ${isMulti ? classes.frameMulti : ""} ${isMoving ? classes.frameMoving : ""}`}
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
