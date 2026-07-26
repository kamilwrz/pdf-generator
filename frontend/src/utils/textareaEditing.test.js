import assert from "node:assert/strict";
import test from "node:test";
import { deferTextareaEdit, hasTextareaDragIntent } from "./textareaEditing.js";

test("does not treat a stationary click as textarea dragging", () => {
    const start = { clientX: 100, clientY: 200 };
    assert.equal(hasTextareaDragIntent(start, { clientX: 100, clientY: 200, buttons: 1 }), false);
    assert.equal(hasTextareaDragIntent(start, { clientX: 102, clientY: 202, buttons: 1 }), false);
});

test("starts textarea dragging only after meaningful pointer movement", () => {
    const start = { clientX: 100, clientY: 200 };
    assert.equal(hasTextareaDragIntent(start, { clientX: 104, clientY: 200, buttons: 1 }), true);
    assert.equal(hasTextareaDragIntent(start, { clientX: 110, clientY: 200, buttons: 0 }), false);
});

test("waits for the current pointer interaction before entering edit mode", () => {
    let scheduled;
    let starts = 0;
    const pendingFrame = { current: null };

    deferTextareaEdit({
        requestFrame: (callback) => {
            scheduled = callback;
            return 42;
        },
        cancelFrame: () => {},
        pendingFrame,
        startEditing: () => { starts += 1; },
    });

    assert.equal(starts, 0);
    assert.equal(pendingFrame.current, 42);
    scheduled();
    assert.equal(starts, 1);
    assert.equal(pendingFrame.current, null);
});
