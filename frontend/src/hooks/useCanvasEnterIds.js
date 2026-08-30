import { useLayoutEffect, useMemo, useState } from "react";
import {
  CANVAS_ENTER_FONT_WAIT_MS,
  CANVAS_ENTER_MS,
  clearEnteringIds,
  endCanvasEnterReflowSuppress,
  markElementsEnter,
  takeEnteringIds,
} from "../utils/canvasEnter";

/**
 * Tracks canvas enter-fade state per element id.
 *
 * Returns `{ heldIds, fadingIds }`:
 * - `heldIds` — opacity 0 while waiting for fonts (hides fallback→webfont swaps)
 * - `fadingIds` — playing the opacity 0→1 animation
 *
 * Each page mounts its own `CanvasElements` with a filtered element list.
 * When packing moves a freshly marked id onto another page before the fade
 * starts, the hold must be pruned here and the id re-queued — otherwise the
 * control stays at opacity 0 until a page / 2-page remount clears state.
 */
export function useCanvasEnterIds(elements) {
  const idsKey = useMemo(
    () => elements.map((el) => el.element_id).join("\0"),
    [elements],
  );
  const [heldIds, setHeldIds] = useState(() => new Set());
  const [fadingIds, setFadingIds] = useState(() => new Set());

  /* State here is a render gate derived from the currently mounted page ids.
     It must be reconciled before paint to avoid flashing elements on the wrong
     page during packing; deferring these updates would reintroduce that flash. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const ids = idsKey ? idsKey.split("\0").filter(Boolean) : [];
    const idSet = new Set(ids);

    // Drop hold/fade for ids that left this page's filtered list (reflow /
    // pack moved them, or the element was deleted).
    setHeldIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (idSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    setFadingIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (idSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });

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
      // Effect re-ran (page filter / Strict Mode) before fade started — put the
      // ids back so the next mount that still owns them can animate (or show).
      if (!fadeStarted) {
        markElementsEnter(fresh);
      }
    };
  }, [idsKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { heldIds, fadingIds };
}
