import { useLayoutEffect, useMemo, useState } from "react";
import {
  CANVAS_ENTER_FONT_WAIT_MS,
  CANVAS_ENTER_MS,
  clearEnteringIds,
  endCanvasEnterReflowSuppress,
  takeEnteringIds,
} from "../utils/canvasEnter";

/**
 * Tracks canvas enter-fade state per element id.
 *
 * Returns `{ heldIds, fadingIds }`:
 * - `heldIds` — opacity 0 while waiting for fonts (hides fallback→webfont swaps)
 * - `fadingIds` — playing the opacity 0→1 animation
 *
 * Reflow stays suppressed for the whole hold; it resumes when the fade starts
 * so measurements use the real webfonts. Cleanup must not clear suppress
 * (React Strict Mode remount would otherwise reopen reflow mid-hold).
 */
export function useCanvasEnterIds(elements) {
  const idsKey = useMemo(
    () => elements.map((el) => el.element_id).join("\0"),
    [elements],
  );
  const [heldIds, setHeldIds] = useState(() => new Set());
  const [fadingIds, setFadingIds] = useState(() => new Set());

  useLayoutEffect(() => {
    const ids = idsKey ? idsKey.split("\0") : [];
    const fresh = takeEnteringIds(ids);
    if (fresh.length === 0) return undefined;

    setHeldIds((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });

    let cancelled = false;
    let fadeTimer = 0;
    let fadeStarted = false;

    const startFade = () => {
      if (cancelled || fadeStarted) return;
      fadeStarted = true;
      // Allow auto-height now that fonts should be ready, then fade in.
      endCanvasEnterReflowSuppress();
      setFadingIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.add(id);
        return next;
      });
      fadeTimer = window.setTimeout(() => {
        clearEnteringIds(fresh);
        setHeldIds((prev) => {
          const next = new Set(prev);
          for (const id of fresh) next.delete(id);
          return next.size === prev.size ? prev : next;
        });
        setFadingIds((prev) => {
          const next = new Set(prev);
          for (const id of fresh) next.delete(id);
          return next.size === prev.size ? prev : next;
        });
      }, CANVAS_ENTER_MS);
    };

    const fontsReady = typeof document !== "undefined" && document.fonts?.ready
      ? document.fonts.ready
      : Promise.resolve();
    const cap = new Promise((resolve) => {
      window.setTimeout(resolve, CANVAS_ENTER_FONT_WAIT_MS);
    });

    Promise.race([fontsReady, cap]).then(startFade);

    return () => {
      cancelled = true;
      window.clearTimeout(fadeTimer);
    };
  }, [idsKey]);

  return { heldIds, fadingIds };
}
