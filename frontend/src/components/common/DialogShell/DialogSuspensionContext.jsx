import { createContext } from "react";

/**
 * Suspends standard dialogs while the editor's central recovery alert owns
 * modality. Dialog owners remain mounted, preserving async work and local
 * state until the user resolves the recovery decision.
 */
export const DialogSuspensionContext = createContext(false);
