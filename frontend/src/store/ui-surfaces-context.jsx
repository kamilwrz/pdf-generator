/**
 * Editor surface flags: mutually exclusive dialogs and side panels.
 */
import { createContext, use } from "react";

export const UiSurfacesContext = createContext(null);

/** @returns {object} */
export function useUiSurfaces() {
  const value = use(UiSurfacesContext);
  if (!value) {
    throw new Error("useUiSurfaces must be used within UiSurfacesContext.Provider");
  }
  return value;
}
