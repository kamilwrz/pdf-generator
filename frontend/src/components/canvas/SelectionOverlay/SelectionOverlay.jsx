import { useMemo } from "react";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { getElementBounds } from "../../../utils/elementBounds";
import classes from "./SelectionOverlay.module.css";

const PAD = 3;
const MIN_LINE_FRAME = 10;

function frameForElement(element) {
    const left = Number(element.left) || 0;
    const top = Number(element.top) || 0;
    let { width, height } = getElementBounds(element);

    // Thin lines need a taller frame so selection stays readable on the canvas.
    if (element.category === "line" && height < MIN_LINE_FRAME) {
        const extra = (MIN_LINE_FRAME - height) / 2;
        return {
            left: left - PAD,
            top: top - extra - PAD,
            width: Math.max(width, 1) + PAD * 2,
            height: MIN_LINE_FRAME + PAD * 2,
        };
    }

    return {
        left: left - PAD,
        top: top - PAD,
        width: Math.max(width, 1) + PAD * 2,
        height: Math.max(height, 1) + PAD * 2,
    };
}

export default function SelectionOverlay({ elements }) {
    const { A4_Elements, currentPage, groupMoveDelta } = use(PdfContext);
    const canvasElements = elements ?? A4_Elements;

    const selected = useMemo(
        () => canvasElements.filter((element) => (
            element.isSelected
            && element.category !== "connector"
            && (element.page ?? 1) === currentPage
        )),
        [canvasElements, currentPage]
    );

    // Text uses its own light background highlight — framing it caused jitter.
    const framed = selected.filter((element) => element.category !== "text");
    const isMulti = selected.length > 1;
    if (framed.length === 0 && !isMulti) return null;
    const frames = framed.map((element) => ({
        id: element.element_id,
        ...frameForElement(element),
    }));
    const groupFrames = (frames.length > 0 ? frames : selected.map((element) => ({
        id: element.element_id,
        ...frameForElement(element),
    })));

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
                    {isMulti && (
                        <>
                            <span className={`${classes.corner} ${classes.tl}`} />
                            <span className={`${classes.corner} ${classes.tr}`} />
                            <span className={`${classes.corner} ${classes.bl}`} />
                            <span className={`${classes.corner} ${classes.br}`} />
                        </>
                    )}
                </div>
            ))}

            {isMulti && (
                <div
                    className={classes.badge}
                    style={{ left: groupBox.left, top: groupBox.top }}
                >
                    <span className={classes.badgeDot} />
                    {selected.length} zaznaczone
                </div>
            )}
            {isMulti && groupMoveDelta && (
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
