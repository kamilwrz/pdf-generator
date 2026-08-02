/**
 * Canvas document state: elements, pages, geometry, loaders, export actions.
 * Provided from PdfCanvas alongside UiSurfaces and Session contexts.
 */
import { createContext, use } from "react";

export const CanvasContext = createContext(null);

/** @returns {object} */
export function useCanvasContext() {
  const value = use(CanvasContext);
  if (!value) {
    throw new Error("useCanvasContext must be used within CanvasContext.Provider");
  }
  return value;
}
