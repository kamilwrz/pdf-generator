import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  TEXT_SPACING_HOLD_MS,
  clearTextSpacingHoldTimer,
  endTextSpacingHold,
  startTextSpacingHold,
} from "./textSpacingHold.js";

describe("textSpacingHold", () => {
  it("exports a 1200ms delay", () => {
    assert.equal(TEXT_SPACING_HOLD_MS, 1200);
  });

  it("fires setSpacingHoldId after the delay", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const timerRef = { current: null };
    const setSpacingHoldId = mock.fn();

    startTextSpacingHold({
      timerRef,
      elementId: "t1",
      setSpacingHoldId,
      delayMs: 1200,
    });
    assert.equal(setSpacingHoldId.mock.callCount(), 0);

    mock.timers.tick(1199);
    assert.equal(setSpacingHoldId.mock.callCount(), 0);

    mock.timers.tick(1);
    assert.equal(setSpacingHoldId.mock.callCount(), 1);
    assert.equal(setSpacingHoldId.mock.calls[0].arguments[0], "t1");
    assert.equal(timerRef.current, null);

    mock.timers.reset();
  });

  it("endTextSpacingHold clears timer and hold id for the same element", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const timerRef = { current: null };
    let holdId = "t1";
    const setSpacingHoldId = mock.fn((updater) => {
      holdId = typeof updater === "function" ? updater(holdId) : updater;
    });

    startTextSpacingHold({
      timerRef,
      elementId: "t1",
      setSpacingHoldId,
      delayMs: 1200,
    });
    endTextSpacingHold({ timerRef, elementId: "t1", setSpacingHoldId });

    mock.timers.tick(1200);
    assert.equal(setSpacingHoldId.mock.callCount(), 1); // only the end clear
    assert.equal(holdId, null);
    assert.equal(timerRef.current, null);

    mock.timers.reset();
  });

  it("clearTextSpacingHoldTimer prevents a late fire", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const timerRef = { current: null };
    const setSpacingHoldId = mock.fn();

    startTextSpacingHold({
      timerRef,
      elementId: "t1",
      setSpacingHoldId,
      delayMs: 1200,
    });
    clearTextSpacingHoldTimer(timerRef);
    mock.timers.tick(1200);
    assert.equal(setSpacingHoldId.mock.callCount(), 0);

    mock.timers.reset();
  });
});
