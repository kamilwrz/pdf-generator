import { createContext, useContext } from "react";
import { canvasOutlineStyle } from "../utils/canvasOutlinePalette.js";
import { useA4Zoom } from "./a4-zoom-context.js";

/** Page-local document surfaces used only to colour transient editor outlines. */
export const CanvasOutlineContext = createContext({ elements: [], page: 1 });

/**
 * Resolves the shared blue outline tokens against the template under a field.
 * Bounds are unscaled page coordinates. Live zoom keeps colour samples on the
 * padded outline during zoom animation; returned styles never enter saved data.
 */
export function useCanvasOutlineStyle(bounds) {
    const { elements, page } = useContext(CanvasOutlineContext);
    const zoom = useA4Zoom();
    return canvasOutlineStyle(elements, bounds, page, zoom);
}
