/**
 * Ensures at most one canvas hover-"+" affordance is visible at a time.
 *
 * When a control claims the exclusive slot, every other subscriber clears its
 * visible state. Release happens when that control hides (timer or click).
 */
import { useCallback, useEffect, useState } from "react";

/** @type {string|null} */
let activeKey = null;
/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * @param {string} key stable id for this affordance instance
 * @returns {{ isExclusiveActive: boolean, claimExclusive: () => void, releaseExclusive: () => void }}
 */
export function useHoverPlusExclusive(key) {
  const [, setEpoch] = useState(0);

  useEffect(() => {
    const onChange = () => setEpoch((value) => value + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      // If this instance unmounts while holding the slot, free it.
      if (activeKey === key) {
        activeKey = null;
        notify();
      }
    };
  }, [key]);

  const claimExclusive = useCallback(() => {
    if (activeKey === key) return;
    activeKey = key;
    notify();
  }, [key]);

  const releaseExclusive = useCallback(() => {
    if (activeKey !== key) return;
    activeKey = null;
    notify();
  }, [key]);

  return {
    isExclusiveActive: activeKey === key,
    claimExclusive,
    releaseExclusive,
  };
}
