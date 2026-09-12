import { createContext, useContext } from "react";

/** The page owns one animation sampler; document state retains only target zoom. */
export const A4ZoomContext = createContext(null);

/** Read the painted page scale for transient controls, with a standalone fallback. */
export function useA4Zoom(fallback = 1) {
  return useContext(A4ZoomContext) ?? fallback;
}
