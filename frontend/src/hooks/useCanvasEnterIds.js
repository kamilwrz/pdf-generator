import { useLayoutEffect, useMemo, useState } from "react";
import {
  CANVAS_ENTER_MS,
  clearEnteringIds,
  takeEnteringIds,
} from "../utils/canvasEnter";

/**
 * Returns a Set of element_ids that should play the canvas enter fade this
 * frame. Ids are marked at creation time via markElementsEnter().
 */
export function useCanvasEnterIds(elements) {
  const idsKey = useMemo(
    () => elements.map((el) => el.element_id).join("\0"),
    [elements],
  );
  const [enteringIds, setEnteringIds] = useState(() => new Set());

  useLayoutEffect(() => {
    const ids = idsKey ? idsKey.split("\0") : [];
    const fresh = takeEnteringIds(ids);
    if (fresh.length === 0) return undefined;

    setEnteringIds((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });

    const timer = window.setTimeout(() => {
      clearEnteringIds(fresh);
      setEnteringIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next.size === prev.size ? prev : next;
      });
    }, CANVAS_ENTER_MS);

    return () => window.clearTimeout(timer);
  }, [idsKey]);

  return enteringIds;
}
