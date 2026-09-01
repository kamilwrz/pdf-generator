import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useCanvasHoverToolbar.js", import.meta.url),
  "utf8",
);

test("structural canvas triggers reveal from pointer and keyboard focus", () => {
  for (const eventName of ["pointerenter", "pointerleave", "focusin", "focusout"]) {
    assert.match(source, new RegExp(`addEventListener\\(\\"${eventName}\\"`));
    assert.match(source, new RegExp(`removeEventListener\\(\\"${eventName}\\"`));
  }
});

test("structural triggers do not intercept click or double-click editing", () => {
  assert.doesNotMatch(source, /addEventListener\(["']click["']/);
  assert.doesNotMatch(source, /addEventListener\(["']dblclick["']/);
  assert.doesNotMatch(source, /removeEventListener\(["']click["']/);
  assert.doesNotMatch(source, /removeEventListener\(["']dblclick["']/);
});

test("structural hover listeners rebind when selection replaces a trigger node", () => {
  assert.match(source, /triggerRevision\s*=\s*""/);
  assert.match(
    source,
    /\[eligible, scheduleHide, show, triggerKey, triggerRevision\]/,
  );
});
