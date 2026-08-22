import assert from "node:assert/strict";
import test from "node:test";

import { novaTemplate } from "./iconic.js";

test("Nova uses its terracotta portrait glyph in the photo slot", () => {
    const frame = novaTemplate.find((element) => element.id === "nova-photo-frame");
    const glyph = novaTemplate.find((element) => element.id === "nova-photo-glyph");

    assert.ok(frame);
    assert.ok(glyph);
    assert.equal(glyph.photoSlot, "glyph");
    assert.ok(glyph.src.endsWith("/template-assets/iconic/nova/portrait.png"));
    assert.equal(glyph.alignWithText, false);
    assert.equal(glyph.width, 42);
    assert.equal(glyph.height, 42);
    // Keep the placeholder centered in the 100 × 124 pt frame and above its fill.
    assert.equal(glyph.left, frame.left + 29);
    assert.equal(glyph.top, frame.top + 41);
    assert.ok(glyph.zIndex > frame.zIndex);
});
