import classes from "./A4.module.css";
import { forwardRef } from "react";


export default forwardRef(function A4({ width, height, zoom = 1, children }, ref) {

    // The wrapper reserves the SCALED layout box (CSS transforms don't affect
    // layout size), so .canvas-area's overflow:auto scrolls correctly. #A4
    // itself keeps its unscaled size and is visually scaled from its top-left.
    // ref stays on #A4 so every getBoundingClientRect() call sees the scaled rect.
    return (
        <div
            className={classes.zoomWrapper}
            style={{ width: `calc(${width} * ${zoom})`, height: `calc(${height} * ${zoom})` }}
        >
            <div
                ref={ref}
                id="A4"
                className={classes.A4}
                style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            >
                {children}
            </div>
        </div>
    )
})
