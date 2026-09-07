/**
 * Selection hairlines drawn above elements (tight glyph bounds for single-line text).
 * Keeps resize chrome off the element DOM so remounts do not break pointer capture.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import { getElementSelectionBounds } from "../../../utils/elementBounds";
import classes from "./SelectionOverlay.module.css";

export default function SelectionOverlay({ elements, page }) {
    const { A4_Elements, currentPage, groupMoveDelta, zoom = 1 } = useCanvasContext();
    const canvasElements = elements ?? A4_Elements;
    const displayedPage = page ?? currentPage;
    const layerRef = useRef(null);

    const selected = useMemo(
        () => canvasElements.filter((element) => (
            element.isSelected
            // Inline text and textarea edit surfaces own their thin focus
            // outline. Hiding the selection frame avoids a doubled border and
            // ensures an active edit never retains selection-only chrome.
            && !(element.isEditing && ["text", "textarea"].includes(element.category))
            && element.category !== "connector"
            && (element.page ?? 1) === displayedPage
        )),
        [canvasElements, displayedPage]
    );
    const moving = useMemo(
        () => canvasElements.filter((element) => (
            element.isMove
            && element.category !== "connector"
            && (element.page ?? 1) === displayedPage
        )),
        [canvasElements, displayedPage]
    );
    const displayed = selected.length > 0 ? selected : moving;
    useLayoutEffect(() => {
        const layer = layerRef.current;
        if (!layer || displayed.length === 0) return;
        let frameId;
        let previous = "";
        const view = layer.ownerDocument.defaultView;
        function measure() {
            // Blur can remove browser <br> children and restore CSS guidance in
            // Text's layout effect. Render-time DOM reads still see the old
            // edit node. Measure after commit and follow font/zoom changes so
            // the selected frame always uses the currently painted surface.
            const bounds = displayed.map((element) => getElementSelectionBounds(element, zoom));
            const signature = JSON.stringify(bounds);
            if (signature !== previous) {
                const nodes = layer.querySelectorAll("[data-selection-element]");
                bounds.forEach((box, index) => {
                    const style = nodes[index]?.style;
                    if (!style) return;
                    for (const key of ["left", "top", "width", "height"]) style[key] = `${box[key]}px`;
                });
                const left = Math.min(...bounds.map((box) => box.left));
                const top = Math.min(...bounds.map((box) => box.top));
                const right = Math.max(...bounds.map((box) => box.left + box.width));
                const bottom = Math.max(...bounds.map((box) => box.top + box.height));
                const group = layer.querySelector("[data-selection-group]");
                if (group) Object.assign(group.style, {
                    left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
                });
                const badge = layer.querySelector("[data-selection-badge]");
                if (badge) Object.assign(badge.style, { left: `${left}px`, top: `${top}px` });
                const delta = layer.querySelector("[data-selection-delta]");
                if (delta) Object.assign(delta.style, { left: `${left}px`, top: `${bottom}px` });
                previous = signature;
            }
            frameId = view.requestAnimationFrame(measure);
        }
        measure();
        return () => view.cancelAnimationFrame(frameId);
    }, [displayed, zoom, groupMoveDelta]);
    const isMulti = displayed.length > 1;
    if (displayed.length === 0) return null;

    return (
        <div ref={layerRef} className={classes.layer} aria-hidden="true">
            {displayed.map((element) => (
                <div
                    key={element.element_id}
                    data-selection-element={element.element_id}
                    className={`${classes.frame} ${isMulti ? classes.frameMulti : ""}`}
                >
                </div>
            ))}

            {isMulti && (
                <>
                    <div
                        className={classes.groupFrame}
                        data-selection-group="true"
                    />
                    <div
                        className={classes.badge}
                        data-selection-badge="true"
                    >
                        <span className={classes.badgeDot} />
                        {`${displayed.length} zaznaczone`}
                    </div>
                </>
            )}
            {groupMoveDelta && groupMoveDelta.page === displayedPage && (
                <div
                    className={classes.deltaBadge}
                    data-selection-delta="true"
                >
                    ΔX {groupMoveDelta.x >= 0 ? "+" : ""}{groupMoveDelta.x}px
                    <span>·</span>
                    ΔY {groupMoveDelta.y >= 0 ? "+" : ""}{groupMoveDelta.y}px
                </div>
            )}
        </div>
    );
}
