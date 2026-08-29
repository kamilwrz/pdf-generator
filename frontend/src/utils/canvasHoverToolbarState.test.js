import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_TOOLBAR_HIDE_DELAY_MS,
  CANVAS_TOOLBAR_INITIAL_STATE,
  reduceCanvasHoverToolbarState,
} from "./canvasHoverToolbarState.js";

test("keeps a transient toolbar available for one second after pointer leave", () => {
  assert.equal(CANVAS_TOOLBAR_HIDE_DELAY_MS, 1_000);
});

test("hover reveal stays transient until the trigger is clicked", () => {
  const shown = reduceCanvasHoverToolbarState(
    CANVAS_TOOLBAR_INITIAL_STATE,
    { type: "SHOW" },
  );
  assert.deepEqual(shown, { visible: true, pinned: false, menuOpen: false });
  assert.deepEqual(
    reduceCanvasHoverToolbarState(shown, { type: "HIDE_IF_TRANSIENT" }),
    CANVAS_TOOLBAR_INITIAL_STATE,
  );
});
test("click-pinned toolbar survives pointer leave", () => {
  const pinned = reduceCanvasHoverToolbarState(
    CANVAS_TOOLBAR_INITIAL_STATE,
    { type: "PIN" },
  );
  assert.deepEqual(
    reduceCanvasHoverToolbarState(pinned, { type: "HIDE_IF_TRANSIENT" }),
    pinned,
  );
});

test("opening a menu pins the toolbar and reset clears the complete interaction", () => {
  const menu = reduceCanvasHoverToolbarState(
    CANVAS_TOOLBAR_INITIAL_STATE,
    { type: "OPEN_MENU" },
  );
  assert.deepEqual(menu, { visible: true, pinned: true, menuOpen: true });
  assert.deepEqual(
    reduceCanvasHoverToolbarState(menu, { type: "RESET" }),
    CANVAS_TOOLBAR_INITIAL_STATE,
  );
});
