import classes from "./Guides.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const THRESHOLD = 4; // px — how close counts as "aligned"

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

export default function Guides() {
    const { A4_Elements, currentPage } = use(PdfContext);

    const onPage = (el) => (el.page ?? 1) === currentPage;
    const moving = A4_Elements.find((el) => el.isMove && onPage(el));
    if (!moving) return null;

    const others = A4_Elements.filter(
        (el) => el.element_id !== moving.element_id && onPage(el)
    );
    if (others.length === 0) return null;

    const movX = xAnchors(moving);
    const movY = yAnchors(moving);

    // Dedupe lines by rounded coordinate so overlapping matches collapse.
    const vertical = new Set();
    const horizontal = new Set();

    others.forEach((el) => {
        const ox = xAnchors(el);
        const oy = yAnchors(el);
        movX.forEach((mx) =>
            ox.forEach((o) => {
                if (Math.abs(mx - o) <= THRESHOLD) vertical.add(Math.round(o));
            })
        );
        movY.forEach((my) =>
            oy.forEach((o) => {
                if (Math.abs(my - o) <= THRESHOLD) horizontal.add(Math.round(o));
            })
        );
    });

    if (vertical.size === 0 && horizontal.size === 0) return null;

    return (
        <>
            {[...vertical].map((x) => (
                <div key={`v${x}`} className={classes.vLine} style={{ left: Math.max(0, Math.min(x, A4_WIDTH)) }} />
            ))}
            {[...horizontal].map((y) => (
                <div key={`h${y}`} className={classes.hLine} style={{ top: Math.max(0, Math.min(y, A4_HEIGHT)) }} />
            ))}
        </>
    );
}
