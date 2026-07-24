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
    const { A4_Elements, currentPage } = use(PdfContext);
    const canvasElements = elements ?? A4_Elements;

    const selected = useMemo(
        () => canvasElements.filter((element) => (
            element.isSelected
            && element.category !== "connector"
            && (element.page ?? 1) === currentPage
        )),
        [canvasElements, currentPage]
    );

    if (selected.length === 0) return null;

    const isMulti = selected.length > 1;
    const frames = selected.map((element) => ({
        id: element.element_id,
        category: element.category,
        ...frameForElement(element),
    }));

    const groupBox = frames.reduce((box, frame) => ({
        left: Math.min(box.left, frame.left),
        top: Math.min(box.top, frame.top),
        right: Math.max(box.right, frame.left + frame.width),
        bottom: Math.max(box.bottom, frame.top + frame.height),
    }), {
        left: frames[0].left,
        top: frames[0].top,
        right: frames[0].left + frames[0].width,
        bottom: frames[0].top + frames[0].height,
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
                    {(isMulti || frame.category === "text") && (
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
        </div>
    );
}
