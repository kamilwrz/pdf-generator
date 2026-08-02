/**
 * Session-scoped editor helpers: entitlements, toasts, document list, auth.
 */
import { createContext, use } from "react";

export const SessionContext = createContext(null);

/** @returns {object} */
export function useSession() {
  const value = use(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within SessionContext.Provider");
  }
  return value;
}
