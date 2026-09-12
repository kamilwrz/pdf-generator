/**
 * One A4 page surface. Zoom scales visually while the wrapper reserves the
 * scaled layout box so overflow scrolling matches what the user sees.
 * `data-page-canvas` lets drag/hit-testing find the page under the pointer.
 */
import classes from "./A4.module.css";
import { forwardRef, useContext, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { compactInlineToolbarLayoutSize } from "../recordPlusSize";
import { A4ZoomContext } from "../../../store/a4-zoom-context";
import { readCanvasZoom } from "../../../utils/readCanvasZoom";
import { CanvasContext } from "../../../store/canvas-context";
import { CanvasOutlineContext } from "../../../store/canvas-outline-context";

/**
 * Keeps editor-only hover spacing and interaction hairlines constant in
 * screen space while the A4 page is transformed. The values reference global
 * colour tokens. Template backgrounds choose only the contrast variant of
 * hover blue; no outline is written into a persisted element style.
 *
 * @param {number} zoom - Visual scale applied to the A4 page.
 * @returns {Record<string, string>} CSS custom properties inherited by canvas chrome.
 */
function editorDepthStyle(zoom) {
    const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
        ? Number(zoom)
        : 1;
    const px = (screenPixels) => `${screenPixels / safeZoom}px`;
    const controls = compactInlineToolbarLayoutSize(safeZoom);

    return {
        "--canvas-control-size": `${controls.buttonSize}px`,
        "--canvas-control-icon": `${controls.iconSize}px`,
        "--canvas-control-gap": `${controls.gap}px`,
        "--canvas-control-font": `${controls.fontSize}px`,
        "--canvas-control-menu-width": `${controls.menuWidth}px`,
        "--canvas-control-border": `${controls.borderWidth}px`,
        "--canvas-shadow-editor-entry": `0 ${px(5)} ${px(14)} var(--shadow-editor-entry-color)`,
        "--canvas-shadow-editor-active": `0 ${px(4)} ${px(12)} var(--shadow-editor-active-color)`,
        // Skills fields are long, low rectangles. A centred spread remains
        // visible on every edge where the generic downward shadow can blend
        // into the white page, especially at 280% editor zoom.
        "--canvas-shadow-editor-skills-active": `0 0 ${px(10)} ${px(1)} var(--shadow-editor-active-color)`,
        // Nested dotted boundaries need more breathing room than the solid
        // element outline. These offsets never enlarge document hit targets.
        "--canvas-hover-padding": px(4),
        "--canvas-hover-entry-padding": px(8),
        "--canvas-hover-section-padding": px(12),
        // Chromium rounds subpixel borders before transforms. Enlarge only the
        // hover pseudo-box, then cancel page zoom locally to keep a true 1px line.
        "--canvas-hover-scale": String(safeZoom),
        "--canvas-hover-inverse-scale": String(1 / safeZoom),
        "--canvas-hover-radius": "2px",
        "--canvas-editor-hairline": px(1),
        "--canvas-editor-hairline-offset": px(1),
    };
}


export default forwardRef(function A4({
    width, height, zoom = 1, page, isSpread = false, children, onPointerDownCapture,
}, ref) {
    const pageRef = useRef(null);
    const canvas = useContext(CanvasContext);
    const outlineContext = useMemo(() => ({
        elements: (canvas?.A4_Elements || []).filter((element) => element.category === "rectangle" && element.filled),
        page,
    }), [canvas?.A4_Elements, page]);
    const [liveZoom, setLiveZoom] = useState(zoom);
    useImperativeHandle(ref, () => pageRef.current, []);

    // Inverse control dimensions must follow the painted transform, not its
    // destination. Sampling only until the transition settles also handles
    // interrupted zoom and reduced motion without an idle animation loop.
    useLayoutEffect(() => {
        let frame;
        let cancelled = false;
        const measure = (animationFrame = false) => {
            if (cancelled) return;
            const next = readCanvasZoom(pageRef.current, zoom);
            // React may defer RAF state updates past the browser's paint.
            // Commit this page-local compensation in the same animation frame
            // as the CSS transform; the initial layout effect already blocks paint.
            if (animationFrame) flushSync(() => setLiveZoom(next));
            else setLiveZoom(next);
            if (!cancelled && Math.abs(next - zoom) > 0.0001) {
                frame = requestAnimationFrame(() => measure(true));
            }
        };
        measure();
        return () => {
            // A synchronous commit can interrupt this effect before its RAF
            // callback returns; do not let that callback restart a stale loop.
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [zoom]);

    // The wrapper reserves the SCALED layout box (CSS transforms don't affect
    // layout size), so .canvas-area's overflow:auto scrolls correctly. #A4
    // itself keeps its unscaled size and is visually scaled from its top-left.
    // ref stays on #A4 so every getBoundingClientRect() call sees the scaled rect.
    return (
        <div
            className={`${classes.zoomWrapper} ${isSpread ? classes.spreadPage : ""}`}
            style={{ width: `calc(${width} * ${zoom})`, height: `calc(${height} * ${zoom})` }}
        >
            <div
                ref={pageRef}
                data-page-canvas={page}
                className={`${classes.A4} page-canvas`}
                style={{
                    width,
                    height,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    ...editorDepthStyle(liveZoom),
                }}
                onPointerDownCapture={onPointerDownCapture}
            >
                <A4ZoomContext.Provider value={liveZoom}>
                    <CanvasOutlineContext.Provider value={outlineContext}>{children}</CanvasOutlineContext.Provider>
                </A4ZoomContext.Provider>
            </div>
        </div>
    )
})
