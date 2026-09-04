/** Optional scope-review coordinator; isolated canvas tests need no provider. */
import { createContext, useContext } from "react";

export const ScopedAiContext = createContext(null);

/** Toolbar actions and competing editor panels share one review surface. */
export function useScopedAi() {
  return useContext(ScopedAiContext);
}
