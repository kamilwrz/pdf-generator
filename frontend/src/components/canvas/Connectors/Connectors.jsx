import classes from "./Connectors.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { computeConnectorPath } from "./connectorPath";

// Single SVG layer over one A4 page that draws its page-local connectors.
// Geometry is derived live from the two linked elements, so a connector stays
// glued as they move. The layer is pointer-transparent except for each line's
// hit area, so it never blocks dragging the elements underneath.
export default function Connectors({ elements, page }) {
    const { A4_Elements, currentPage, selectElement, pageSize } = use(PdfContext);
    const canvasElements = elements ?? A4_Elements;
    const A4_WIDTH = pageSize?.width ?? 595;
    const A4_HEIGHT = pageSize?.height ?? 842;

    const displayedPage = page ?? currentPage;
    const onPage = (el) => (el.page ?? 1) === displayedPage;
    const connectors = canvasElements.filter((el) => el.category === "connector" && onPage(el));
    if (connectors.length === 0) return null;

    const byId = {};
    canvasElements.forEach((el) => { byId[el.element_id] = el; });

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
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            selectElement(conn.element_id, e.ctrlKey || e.metaKey);
                        }}
                    >
                        {/* fat transparent stroke = easy click target */}
                        <polyline points={d} fill="none" stroke="transparent" strokeWidth={Math.max(8, w + 6)} strokeLinejoin="round" />
                        {conn.isSelected && (
                            <polyline
                                points={d}
                                fill="none"
                                stroke="var(--accent)"
                                strokeWidth={Math.max(w + 4, 6)}
                                strokeLinejoin="round"
                                opacity={0.28}
                            />
                        )}
                        <polyline
                            points={d}
                            fill="none"
                            stroke={conn.isSelected ? "var(--accent)" : color}
                            strokeWidth={conn.isSelected ? Math.max(w, 2) : w}
                            strokeLinejoin="round"
                        />
                        {arrow && (
                            <polygon
                                points={arrow}
                                fill={conn.isSelected ? "var(--accent)" : color}
                            />
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
