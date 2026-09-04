/**
 * One A4 page surface. Zoom scales visually while the wrapper reserves the
 * scaled layout box so overflow scrolling matches what the user sees.
 * `data-page-canvas` lets drag/hit-testing find the page under the pointer.
 */
import classes from "./A4.module.css";
import { forwardRef } from "react";
import { compactInlineToolbarLayoutSize } from "../recordPlusSize";

/**
 * Keeps editor-only hover elevation and interaction hairlines constant in
 * screen space while the A4 page is transformed. The values reference global
 * colour tokens, so no document palette or persisted element style can leak
 * into selection or edit feedback.
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
        "--canvas-control-border": `${controls.borderWidth}px`,
        "--canvas-shadow-editor-section": `0 ${px(8)} ${px(20)} var(--shadow-editor-section-color)`,
        "--canvas-shadow-editor-entry": `0 ${px(5)} ${px(14)} var(--shadow-editor-entry-color)`,
        "--canvas-shadow-editor-element": `0 ${px(2)} ${px(7)} var(--shadow-editor-element-color)`,
        "--canvas-shadow-editor-active": `0 ${px(4)} ${px(12)} var(--shadow-editor-active-color)`,
        // Skills fields are long, low rectangles. A centred spread remains
        // visible on every edge where the generic downward shadow can blend
        // into the white page, especially at 200% editor zoom.
        "--canvas-shadow-editor-skills": `0 0 ${px(8)} ${px(1)} var(--shadow-editor-element-color)`,
        "--canvas-shadow-editor-skills-active": `0 0 ${px(10)} ${px(1)} var(--shadow-editor-active-color)`,
        "--canvas-editor-lift": `-${px(1)}`,
        "--canvas-editor-hairline": px(1),
        "--canvas-editor-hairline-offset": px(1),
    };
}


export default forwardRef(function A4({
    width, height, zoom = 1, page, isSpread = false, children, onPointerDownCapture,
}, ref) {

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
                ref={ref}
                data-page-canvas={page}
                className={`${classes.A4} page-canvas`}
                style={{
                    width,
                    height,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    ...editorDepthStyle(zoom),
                }}
                onPointerDownCapture={onPointerDownCapture}
            >
                {children}
            </div>
        </div>
    )
})
