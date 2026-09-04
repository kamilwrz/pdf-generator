import test from "node:test";
import assert from "node:assert/strict";
import {
  coordinateEditZoomMotion,
  revealEditedElementImmediately,
} from "./editZoomMotion.js";

function connectedRect(rectFactory) {
  return {
    isConnected: true,
    getBoundingClientRect: rectFactory,
  };
}

test("coordinates scroll with scale so the edited field follows one smooth path", () => {
  const frames = [];
  let scale = 1;
  const container = connectedRect(() => ({ left: 0, top: 0, width: 500, height: 400 }));
  container.scrollLeft = 0;
  container.scrollTop = 0;
  const element = connectedRect(() => ({
    left: (200 * scale) - container.scrollLeft,
    top: (600 * scale) - container.scrollTop,
    width: 100 * scale,
    height: 40 * scale,
  }));

  const cancel = coordinateEditZoomMotion({
    container,
    element,
    zoomRatio: 1.25,
    duration: 200,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame: () => {},
  });

  scale = 1.25;
  frames.shift()(0);
  const firstFrameCenter = element.getBoundingClientRect().top
    + (element.getBoundingClientRect().height / 2);
  assert.equal(firstFrameCenter, 620, "the first frame counteracts scale movement without a jump");

  frames.shift()(100);
  const middleFrameCenter = element.getBoundingClientRect().top
    + (element.getBoundingClientRect().height / 2);
  assert.ok(middleFrameCenter < firstFrameCenter);
  assert.ok(middleFrameCenter > 200);

  frames.shift()(200);
  const finalRect = element.getBoundingClientRect();
  assert.equal(finalRect.top + (finalRect.height / 2), 200);
  assert.equal(
    finalRect.left + (finalRect.width / 2),
    250,
    "a visible field keeps its original inline position while scale is counter-scrolled",
  );
  cancel();
});

test("reduced motion reveals the edited field without scheduling animation", () => {
  const container = connectedRect(() => ({ left: 0, top: 0, width: 300, height: 300 }));
  container.scrollLeft = 0;
  container.scrollTop = 0;
  const element = connectedRect(() => ({
    left: 380 - container.scrollLeft,
    top: 500 - container.scrollTop,
    width: 80,
    height: 40,
  }));

  revealEditedElementImmediately(container, element);

  const finalRect = element.getBoundingClientRect();
  assert.equal(finalRect.top + (finalRect.height / 2), 150);
  assert.equal(
    finalRect.left + finalRect.width,
    284,
    "horizontal scrolling uses a 16px nearest-edge gutter",
  );
});
