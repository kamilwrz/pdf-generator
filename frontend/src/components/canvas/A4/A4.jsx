/**
 * One A4 page surface. Zoom scales visually while the wrapper reserves the
 * scaled layout box so overflow scrolling matches what the user sees.
 * `data-page-canvas` lets drag/hit-testing find the page under the pointer.
 */
import classes from "./A4.module.css";
import { forwardRef } from "react";


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
                style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
                onPointerDownCapture={onPointerDownCapture}
            >
                {children}
            </div>
        </div>
    )
})
