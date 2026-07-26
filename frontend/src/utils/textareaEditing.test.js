import assert from "node:assert/strict";
import test from "node:test";
import { deferTextareaEdit, isTextareaEditGesture } from "./textareaEditing.js";

test("recognizes an unmodified second click as a textarea edit gesture", () => {
    assert.equal(isTextareaEditGesture({ detail: 2 }), true);
    assert.equal(isTextareaEditGesture({ detail: 1 }), false);
});

test("keeps Ctrl/Cmd double-click available for multi-selection", () => {
    assert.equal(isTextareaEditGesture({ detail: 2, ctrlKey: true }), false);
    assert.equal(isTextareaEditGesture({ detail: 2, metaKey: true }), false);
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
