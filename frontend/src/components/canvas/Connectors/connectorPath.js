// Orthogonal (right-angle) route between two element boxes. Endpoints sit at
// the midpoint of each box's facing side; the path bends at the midway line.
// This MUST stay in sync with the backend's _connector_geometry in
// pdf_generator.py so the canvas preview matches the generated PDF.

function box(el) {
    const w = parseFloat(el.width) || 0;
    const h = parseFloat(el.height) || 0;
    const left = el.left || 0;
    const top = el.top || 0;
    return {
        left, top, w, h,
        cx: left + w / 2, cy: top + h / 2,
        right: left + w, bottom: top + h,
    };
}

// Returns { points: [{x,y}...], end: {x,y}, lastDir, arrow } where `arrow` is
// an SVG points string for the arrowhead triangle (or null when withArrow is
// false). Coordinates are in canvas space (top-left origin, px).
export function computeConnectorPath(source, target, withArrow) {
    const s = box(source);
    const t = box(target);
    const dx = t.cx - s.cx;
    const dy = t.cy - s.cy;

    let points;
    let end;
    let lastDir;

    if (Math.abs(dx) >= Math.abs(dy)) {
        const sx = dx >= 0 ? s.right : s.left;
        const tx = dx >= 0 ? t.left : t.right;
        const mx = (sx + tx) / 2;
        points = [
            { x: sx, y: s.cy },
            { x: mx, y: s.cy },
            { x: mx, y: t.cy },
            { x: tx, y: t.cy },
        ];
        end = { x: tx, y: t.cy };
        lastDir = dx >= 0 ? "right" : "left";
    } else {
        const sy = dy >= 0 ? s.bottom : s.top;
        const ty = dy >= 0 ? t.top : t.bottom;
        const my = (sy + ty) / 2;
        points = [
            { x: s.cx, y: sy },
            { x: s.cx, y: my },
            { x: t.cx, y: my },
            { x: t.cx, y: ty },
        ];
        end = { x: t.cx, y: ty };
        lastDir = dy >= 0 ? "down" : "up";
    }

    let arrow = null;
    if (withArrow) {
        const A = 7;
        const { x, y } = end;
        if (lastDir === "right") arrow = `${x},${y} ${x - A},${y - A} ${x - A},${y + A}`;
        else if (lastDir === "left") arrow = `${x},${y} ${x + A},${y - A} ${x + A},${y + A}`;
        else if (lastDir === "down") arrow = `${x},${y} ${x - A},${y - A} ${x + A},${y - A}`;
        else arrow = `${x},${y} ${x - A},${y + A} ${x + A},${y + A}`;
    }

    return { points, end, lastDir, arrow };
}
