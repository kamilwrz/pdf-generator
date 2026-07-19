import classes from "./Guides.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";

const THRESHOLD = 4; // px — how close counts as "aligned"
const PAD = 8;       // px — how far the guide extends past the outermost element

// Left / center / right x-coordinates of an element.
function xAnchors(el) {
    const w = parseFloat(el.width) || 0;
    return [el.left, el.left + w / 2, el.left + w];
}
// Top / middle / bottom y-coordinates of an element.
function yAnchors(el) {
    const h = parseFloat(el.height) || 0;
    return [el.top, el.top + h / 2, el.top + h];
}
const boundsX = (el) => [el.left, el.left + (parseFloat(el.width) || 0)];
const boundsY = (el) => [el.top, el.top + (parseFloat(el.height) || 0)];
const clamp = (v, max) => Math.max(0, Math.min(v, max));

// Pick the single closest alignment on one axis: compare each moving anchor to
// each other-element anchor, keep the coordinate with the smallest gap. Returns
// the guide coordinate or null when nothing is within THRESHOLD.
function closestCoord(movAnchors, others, anchorsOf) {
    let best = null;
    others.forEach((el) => {
        anchorsOf(el).forEach((o) => {
            movAnchors.forEach((m) => {
                const d = Math.abs(m - o);
                if (d <= THRESHOLD && (best === null || d < best.delta)) {
                    best = { delta: d, coord: o };
                }
            });
        });
    });
    return best ? best.coord : null;
}

export default function Guides() {
    const { A4_Elements, currentPage, pageSize } = use(PdfContext);
    const A4_WIDTH = pageSize?.width ?? 595;
    const A4_HEIGHT = pageSize?.height ?? 842;

    const onPage = (el) => (el.page ?? 1) === currentPage;
    const moving = A4_Elements.find((el) => el.isMove && onPage(el));
    if (!moving) return null;

    const others = A4_Elements.filter(
        (el) => el.element_id !== moving.element_id && onPage(el)
    );
    if (others.length === 0) return null;

    // ---- One vertical guide: the nearest x-alignment, drawn only across the
    // moving element and the elements it lines up with. ----
    let vGuide = null;
    const vx = closestCoord(xAnchors(moving), others, xAnchors);
    if (vx !== null) {
        const aligned = others.filter((el) =>
            xAnchors(el).some((o) => Math.abs(o - vx) <= THRESHOLD)
        );
        const tops = [moving, ...aligned].flatMap(boundsY);
        vGuide = {
            x: clamp(Math.round(vx), A4_WIDTH),
            y1: clamp(Math.min(...tops) - PAD, A4_HEIGHT),
            y2: clamp(Math.max(...tops) + PAD, A4_HEIGHT),
        };
    }

    // ---- One horizontal guide: the nearest y-alignment. ----
    let hGuide = null;
    const hy = closestCoord(yAnchors(moving), others, yAnchors);
    if (hy !== null) {
        const aligned = others.filter((el) =>
            yAnchors(el).some((o) => Math.abs(o - hy) <= THRESHOLD)
        );
        const sides = [moving, ...aligned].flatMap(boundsX);
        hGuide = {
            y: clamp(Math.round(hy), A4_HEIGHT),
            x1: clamp(Math.min(...sides) - PAD, A4_WIDTH),
            x2: clamp(Math.max(...sides) + PAD, A4_WIDTH),
        };
    }

    if (!vGuide && !hGuide) return null;

    return (
        <>
            {vGuide && (
                <div
                    className={classes.vLine}
                    style={{ left: vGuide.x, top: vGuide.y1, height: vGuide.y2 - vGuide.y1 }}
                />
            )}
            {hGuide && (
                <div
                    className={classes.hLine}
                    style={{ top: hGuide.y, left: hGuide.x1, width: hGuide.x2 - hGuide.x1 }}
                />
            )}
        </>
    );
}
