/**
 * Alignment and spacing guide overlays while dragging or long-pressing text.
 * Spacing maths live in utils/spacingGuides; this component only paints them.
 */
import { useEffect, useState } from "react";
import classes from "./Guides.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { getElementBounds, getVisualBounds } from "../../../utils/elementBounds";
import {
    findAllHorizontalSpacingGuides,
    findAllVerticalSpacingGuides,
    findHorizontalSpacingGuides,
    findPageEdgeGuides,
    findVerticalSpacingGuides,
} from "../../../utils/spacingGuides";
import {
    resolveSpacingLabelLayouts,
    spacingGuideKey,
} from "../../../utils/spacingLabelLayout";

const THRESHOLD = 4; // px — how close counts as "aligned"
const PAD = 8;       // px — how far the guide extends past the outermost element

// Left / center / right x-coordinates of an element.
function xAnchors(el) {
    const left = Number(el.left) || 0;
    const { width } = getElementBounds(el);
    return [left, left + width / 2, left + width];
}
// Top / middle / bottom y-coordinates of an element.
function yAnchors(el) {
    const top = Number(el.top) || 0;
    const { height } = getElementBounds(el);
    return [top, top + height / 2, top + height];
}
const boundsX = (el) => {
    const left = Number(el.left) || 0;
    return [left, left + getElementBounds(el).width];
};
const boundsY = (el) => {
    const top = Number(el.top) || 0;
    return [top, top + getElementBounds(el).height];
};
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

/** Orange vertical distance marker (Y gap between neighbors). */
function SpacingMarkerY({ guide, pageWidth, pageHeight, layout }) {
    if (!guide) return null;

    const x = clamp(Math.round(guide.x), pageWidth);
    const y1 = clamp(Math.round(guide.y1), pageHeight);
    const y2 = clamp(Math.round(guide.y2), pageHeight);
    const height = Math.max(0, y2 - y1);
    const label = `${Math.round(guide.gap)} px`;
    const side = layout?.side || "right";
    const nudge = layout?.nudge || 0;

    return (
        <div
            className={classes.spacingY}
            style={{ left: x, top: y1, height }}
            data-direction={guide.direction}
            data-label-side={side}
        >
            <span className={classes.spacingCapYStart} />
            <span className={classes.spacingRailY} />
            <span className={classes.spacingCapYEnd} />
            <span
                className={classes.spacingLabelY}
                style={nudge ? { marginTop: nudge } : undefined}
            >
                {label}
            </span>
        </div>
    );
}

/** Green horizontal distance marker (X gap between neighbors or page edge). */
function SpacingMarkerX({ guide, pageWidth, pageHeight, layout }) {
    if (!guide) return null;

    const y = clamp(Math.round(guide.y), pageHeight);
    const x1 = clamp(Math.round(guide.x1), pageWidth);
    const x2 = clamp(Math.round(guide.x2), pageWidth);
    const width = Math.max(0, x2 - x1);
    const label = `${Math.round(guide.gap)} px`;
    const side = layout?.side || "below";
    const nudge = layout?.nudge || 0;

    return (
        <div
            className={classes.spacingX}
            style={{ top: y, left: x1, width }}
            data-direction={guide.direction}
            data-kind={guide.kind || "neighbor"}
            data-label-side={side}
        >
            <span className={classes.spacingCapXStart} />
            <span className={classes.spacingRailX} />
            <span className={classes.spacingCapXEnd} />
            <span
                className={classes.spacingLabelX}
                style={nudge ? { marginLeft: nudge } : undefined}
            >
                {label}
            </span>
        </div>
    );
}

/** True while both Shift and Alt are held — spacing inspect mode. */
function useShiftAltHeld() {
    const [held, setHeld] = useState(false);

    useEffect(() => {
        const sync = (event) => {
            setHeld(Boolean(event.shiftKey && event.altKey));
        };
        const clear = () => setHeld(false);
        const onVisibility = () => {
            if (document.hidden) clear();
        };

        window.addEventListener("keydown", sync);
        window.addEventListener("keyup", sync);
        window.addEventListener("blur", clear);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            window.removeEventListener("keydown", sync);
            window.removeEventListener("keyup", sync);
            window.removeEventListener("blur", clear);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    return held;
}

function SpacingGuidesForElement({ focus, others, pageWidth, pageHeight, includeAlignment }) {
    const spacingY = findVerticalSpacingGuides(focus, others, getVisualBounds);
    const spacingX = findHorizontalSpacingGuides(focus, others, getVisualBounds);
    const pageEdges = findPageEdgeGuides(focus, pageWidth, getVisualBounds);

    const yGuides = [spacingY.above, spacingY.below].filter(Boolean);
    const xGuides = [
        spacingX.left,
        spacingX.right,
        pageEdges.left,
        pageEdges.right,
    ].filter(Boolean);
    const layouts = resolveSpacingLabelLayouts({ y: yGuides, x: xGuides });

    let vGuide = null;
    let hGuide = null;
    if (includeAlignment) {
        const vx = closestCoord(xAnchors(focus), others, xAnchors);
        if (vx !== null) {
            const aligned = others.filter((el) =>
                xAnchors(el).some((o) => Math.abs(o - vx) <= THRESHOLD)
            );
            const tops = [focus, ...aligned].flatMap(boundsY);
            vGuide = {
                x: clamp(Math.round(vx), pageWidth),
                y1: clamp(Math.min(...tops) - PAD, pageHeight),
                y2: clamp(Math.max(...tops) + PAD, pageHeight),
            };
        }

        const hy = closestCoord(yAnchors(focus), others, yAnchors);
        if (hy !== null) {
            const aligned = others.filter((el) =>
                yAnchors(el).some((o) => Math.abs(o - hy) <= THRESHOLD)
            );
            const sides = [focus, ...aligned].flatMap(boundsX);
            hGuide = {
                y: clamp(Math.round(hy), pageHeight),
                x1: clamp(Math.min(...sides) - PAD, pageWidth),
                x2: clamp(Math.max(...sides) + PAD, pageWidth),
            };
        }
    }

    const hasSpacing = yGuides.length > 0 || xGuides.length > 0;
    if (!vGuide && !hGuide && !hasSpacing) return null;

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
            {yGuides.map((guide) => (
                <SpacingMarkerY
                    key={`y-${guide.direction}-${guide.neighborId}`}
                    guide={guide}
                    pageWidth={pageWidth}
                    pageHeight={pageHeight}
                    layout={layouts.get(spacingGuideKey(guide, "y"))}
                />
            ))}
            {xGuides.map((guide) => (
                <SpacingMarkerX
                    key={`x-${guide.direction}-${guide.neighborId}`}
                    guide={guide}
                    pageWidth={pageWidth}
                    pageHeight={pageHeight}
                    layout={layouts.get(spacingGuideKey(guide, "x"))}
                />
            ))}
        </>
    );
}

export default function Guides({ page }) {
    const { A4_Elements, currentPage, pageSize, spacingHoldId } = use(PdfContext);
    const inspectSpacing = useShiftAltHeld();
    const A4_WIDTH = pageSize?.width ?? 595;
    const A4_HEIGHT = pageSize?.height ?? 842;

    const displayedPage = page ?? currentPage;
    const onPage = (el) => (el.page ?? 1) === displayedPage;
    const pageElements = A4_Elements.filter(onPage);
    const moving = pageElements.find((el) => el.isMove);
    // Long-press on text: distance markers only (no isMove / alignment guides).
    const held = !moving && spacingHoldId
        ? pageElements.find((el) => el.element_id === spacingHoldId)
        : null;
    const focus = moving || held;

    // Shift+Alt: distance markers between every neighboring pair (Y orange, X green).
    if (inspectSpacing) {
        const allY = findAllVerticalSpacingGuides(pageElements, getVisualBounds);
        const allX = findAllHorizontalSpacingGuides(pageElements, getVisualBounds);
        if (allY.length === 0 && allX.length === 0) return null;
        const layouts = resolveSpacingLabelLayouts({ y: allY, x: allX });
        return (
            <>
                {allY.map((guide) => (
                    <SpacingMarkerY
                        key={`y-${guide.neighborId}-${guide.y1}-${guide.y2}-${guide.x}`}
                        guide={guide}
                        pageWidth={A4_WIDTH}
                        pageHeight={A4_HEIGHT}
                        layout={layouts.get(spacingGuideKey(guide, "y"))}
                    />
                ))}
                {allX.map((guide) => (
                    <SpacingMarkerX
                        key={`x-${guide.neighborId}-${guide.x1}-${guide.x2}-${guide.y}`}
                        guide={guide}
                        pageWidth={A4_WIDTH}
                        pageHeight={A4_HEIGHT}
                        layout={layouts.get(spacingGuideKey(guide, "x"))}
                    />
                ))}
            </>
        );
    }

    if (!focus) return null;

    const others = pageElements.filter((el) => el.element_id !== focus.element_id);
    return (
        <SpacingGuidesForElement
            focus={focus}
            others={others}
            pageWidth={A4_WIDTH}
            pageHeight={A4_HEIGHT}
            includeAlignment={Boolean(moving)}
        />
    );
}
