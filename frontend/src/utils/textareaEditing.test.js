import assert from "node:assert/strict";
import test from "node:test";
import {
    hasTextareaDragIntent,
    resolveTextClickIntent,
} from "./textareaEditing.js";

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

test("an ordinary template-mode click enters inline editing", () => {
    assert.equal(resolveTextClickIntent({ templateMode: true }), "edit");
});

test("an ordinary freeform-mode click keeps resize selection", () => {
    assert.equal(resolveTextClickIntent({ templateMode: false }), "select");
    assert.equal(resolveTextClickIntent(), "select");
});

test("Ctrl/Cmd-click remains additive selection in every editor mode", () => {
    assert.equal(
        resolveTextClickIntent({ templateMode: true, additive: true }),
        "select-additive",
    );
    assert.equal(
        resolveTextClickIntent({ templateMode: false, additive: true }),
        "select-additive",
    );
});

test("a completed drag or fixed-page chrome ignores the click", () => {
    assert.equal(
        resolveTextClickIntent({ templateMode: true, didDrag: true }),
        "ignore",
    );
    assert.equal(
        resolveTextClickIntent({ templateMode: true, fixedToPage: true }),
        "ignore",
    );
});

test("a click on an editing surface preserves native caret focus", () => {
    assert.equal(
        resolveTextClickIntent({ templateMode: true, isEditing: true }),
        "focus",
    );
});
