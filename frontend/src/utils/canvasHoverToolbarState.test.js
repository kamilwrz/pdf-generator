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

test("pointer or keyboard reveal stays transient", () => {
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

test("only an open menu pins the toolbar across pointer leave", () => {
  const menu = reduceCanvasHoverToolbarState(
    CANVAS_TOOLBAR_INITIAL_STATE,
    { type: "OPEN_MENU" },
  );
  assert.deepEqual(menu, { visible: true, pinned: true, menuOpen: true });
  assert.deepEqual(
    reduceCanvasHoverToolbarState(menu, { type: "HIDE_IF_TRANSIENT" }),
    menu,
  );
  assert.deepEqual(
    reduceCanvasHoverToolbarState(menu, { type: "CLOSE_MENU" }),
    { visible: true, pinned: false, menuOpen: false },
  );
});

test("reset clears the complete menu interaction", () => {
  const menu = reduceCanvasHoverToolbarState(
    CANVAS_TOOLBAR_INITIAL_STATE,
    { type: "OPEN_MENU" },
  );
  assert.deepEqual(
    reduceCanvasHoverToolbarState(menu, { type: "RESET" }),
    CANVAS_TOOLBAR_INITIAL_STATE,
  );
});

test("an inline form can pin and unpin the toolbar without opening a menu", () => {
  const pinned = reduceCanvasHoverToolbarState(
    CANVAS_TOOLBAR_INITIAL_STATE,
    { type: "PIN" },
  );
  assert.deepEqual(pinned, { visible: true, pinned: true, menuOpen: false });
  assert.deepEqual(
    reduceCanvasHoverToolbarState(pinned, { type: "HIDE_IF_TRANSIENT" }),
    pinned,
  );
  assert.deepEqual(
    reduceCanvasHoverToolbarState(pinned, { type: "UNPIN" }),
    { visible: true, pinned: false, menuOpen: false },
  );
});
