import assert from "node:assert/strict";
import test from "node:test";
import { isTextareaEditGesture } from "./textareaEditing.js";

test("recognizes an unmodified second click as a textarea edit gesture", () => {
    assert.equal(isTextareaEditGesture({ detail: 2 }), true);
    assert.equal(isTextareaEditGesture({ detail: 1 }), false);
});

test("keeps Ctrl/Cmd double-click available for multi-selection", () => {
    assert.equal(isTextareaEditGesture({ detail: 2, ctrlKey: true }), false);
    assert.equal(isTextareaEditGesture({ detail: 2, metaKey: true }), false);
});
