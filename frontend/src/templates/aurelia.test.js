import assert from "node:assert/strict";
import test from "node:test";

import { aureliaTemplate } from "./aurelia.js";

const PAPER = "#FEFDF9";
const GOLD = "#B3924F";
const ALLOWED_PALETTE = new Set([
    PAPER,
    "#272724",
    "#464540",
    "#77736B",
    GOLD,
    "#8B713A",
    "#DCD8CE",
    "#F1EEE7",
]);

test("Aurelia is a one-column quiet-luxury template led by cubic Bézier paths", () => {
    const tallShapes = aureliaTemplate.filter((element) => (element.height ?? 0) >= 300);
    assert.equal(tallShapes.length, 2); // paper plus the 1px vertical rail
    assert.equal(tallShapes[0].backgroundColor, PAPER);
    assert.equal(
        aureliaTemplate.some(
            (element) => element.category === "rectangle" && (element.width ?? 0) > 120,
        ),
        false,
        "Aurelia must not introduce a sidebar or large panel",
    );

    const paths = aureliaTemplate.filter((element) => element.category === "path");
    assert.ok(paths.length >= 7, "masthead, section threads, and footer must use Bézier paths");
    assert.ok(paths.every((element) => element.curves.some((segment) => segment.type === "C")));
    assert.ok(paths.every((element) => element.filled === false));
    assert.ok(paths.every((element) => [GOLD, "#8B713A"].includes(element.backgroundColor)));

    const orbit = aureliaTemplate.find((element) => element.id === "aurelia-golden-orbit");
    assert.ok(orbit);
    assert.equal(orbit.flowRole, "masthead");
    assert.equal(orbit.width, 229);
    assert.equal(orbit.curves.filter((segment) => segment.type === "C").length, 2);

    const jewel = aureliaTemplate.find((element) => element.id === "aurelia-orbit-jewel");
    assert.equal(jewel?.category, "polygon");
    assert.equal(jewel?.shape, "diamond");
    assert.equal(jewel?.filled, true);

    const headings = aureliaTemplate.filter(
        (element) => element.flowRole === "section-chrome"
            && element.category === "text",
    );
    assert.equal(headings.length, 4);
    assert.ok(headings.every((element) => element.left === 116));
    assert.ok(headings.every((element) => element.fontFamily === "Montserrat"));

    const bodyBlocks = aureliaTemplate.filter(
        (element) => element.category === "textarea"
            && element.flowRole === "content",
    );
    assert.ok(bodyBlocks.length >= 4);
    assert.ok(bodyBlocks.every((element) => element.left === 116 && element.width === 399));
    assert.ok(bodyBlocks.every((element) => element.fontSize <= 9.3));

    for (const element of aureliaTemplate) {
        const color = element.color ?? element.backgroundColor;
        if (color) assert.ok(ALLOWED_PALETTE.has(color), `unexpected Aurelia color ${color}`);
    }
});
