import classes from "./Connectors.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { computeConnectorPath } from "./connectorPath";

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

// Single SVG layer over the A4 that draws every connector on the current page.
// Geometry is derived live from the two linked elements, so a connector stays
// glued as they move. The layer is pointer-transparent except for each line's
// hit area, so it never blocks dragging the elements underneath.
export default function Connectors() {
    const { A4_Elements, currentPage, selectElement } = use(PdfContext);

    const onPage = (el) => (el.page ?? 1) === currentPage;
    const connectors = A4_Elements.filter((el) => el.category === "connector" && onPage(el));
    if (connectors.length === 0) return null;

    const byId = {};
    A4_Elements.forEach((el) => { byId[el.element_id] = el; });

    return (
        <svg
            className={classes.layer}
            width={A4_WIDTH}
            height={A4_HEIGHT}
            viewBox={`0 0 ${A4_WIDTH} ${A4_HEIGHT}`}
        >
            {connectors.map((conn) => {
                const s = byId[conn.source_id];
                const t = byId[conn.target_id];
                if (!s || !t) return null;

                const { points, arrow } = computeConnectorPath(s, t, conn.arrow);
                const d = points.map((p) => `${p.x},${p.y}`).join(" ");
                const color = conn.backgroundColor || "#000000";
                const w = conn.borderWidth || 1;

                return (
                    <g
                        key={conn.element_id}
                        className={classes.hit}
                        onPointerDown={(e) => { e.stopPropagation(); selectElement(conn.element_id); }}
                    >
                        {/* fat transparent stroke = easy click target */}
                        <polyline points={d} fill="none" stroke="transparent" strokeWidth={Math.max(8, w + 6)} strokeLinejoin="round" />
                        <polyline
                            points={d}
                            fill="none"
                            stroke={color}
                            strokeWidth={w}
                            strokeLinejoin="round"
                            opacity={conn.isSelected ? 0.6 : 1}
                        />
                        {arrow && <polygon points={arrow} fill={color} opacity={conn.isSelected ? 0.6 : 1} />}
                    </g>
                );
            })}
        </svg>
    );
}
