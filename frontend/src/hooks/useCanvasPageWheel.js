/**
 * Wheel on `.canvas-area` advances/retreats the active page at scroll edges.
 * PageControls stays in sync because it reads the same `currentPage` state.
 */
import { useEffect, useRef } from "react";
import {
  PAGE_WHEEL_COOLDOWN_MS,
  resolvePageWheelDelta,
} from "../utils/canvasPageWheel";

/**
 * @param {React.RefObject<HTMLElement|null>} containerRef
 * @param {{
 *   currentPage: number,
 *   pageCount: number,
 *   goToPage: (page: number) => void,
 * }} opts
 */
export function useCanvasPageWheel(containerRef, { currentPage, pageCount, goToPage }) {
  const latestRef = useRef({ currentPage, pageCount, goToPage, lastChangeAt: 0 });
  latestRef.current.currentPage = currentPage;
  latestRef.current.pageCount = pageCount;
  latestRef.current.goToPage = goToPage;

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return undefined;

    const onWheel = (event) => {
      const { currentPage: page, pageCount: count, goToPage: go, lastChangeAt } = latestRef.current;
      const step = resolvePageWheelDelta(event, el, {
        currentPage: page,
        pageCount: count,
      });
      if (!step) return;

      const now = Date.now();
      // Still preventDefault during cooldown so leftover wheel inertia does not
      // bounce the overflow scroll after a page change.
      event.preventDefault();
      if (now - lastChangeAt < PAGE_WHEEL_COOLDOWN_MS) return;

      latestRef.current.lastChangeAt = now;
      go(page + step);
      // New page starts from the top; keeps the PageControls label and view aligned.
      el.scrollTop = 0;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef]);
}
