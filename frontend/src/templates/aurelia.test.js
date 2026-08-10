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
]);

test("Aurelia is a one-column quiet-luxury template led by one cubic Bézier arch", () => {
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
    assert.equal(paths.length, 1, "one signature curve avoids decorative repetition");
    assert.ok(paths.every((element) => element.curves.some((segment) => segment.type === "C")));
    assert.ok(paths.every((element) => element.filled === false));
    assert.equal(paths[0].backgroundColor, "#8B713A");
    assert.equal(paths[0].borderWidth, 4);

    const arch = aureliaTemplate.find((element) => element.id === "aurelia-golden-arch");
    assert.ok(arch);
    assert.equal(arch.flowRole, "masthead");
    assert.equal(arch.width, 435);
    assert.equal(arch.curves.filter((segment) => segment.type === "C").length, 1);
    assert.equal(aureliaTemplate.some((element) => element.category === "polygon"), false);

    const headings = aureliaTemplate.filter(
        (element) => element.flowRole === "section-chrome"
            && element.category === "text",
    );
    assert.equal(headings.length, 4);
    assert.ok(headings.every((element) => element.left === 116));
    assert.ok(headings.every((element) => element.fontFamily === "Montserrat"));
    const sectionBars = aureliaTemplate.filter(
        (element) => element.flowRole === "section-chrome"
            && element.category === "line"
            && element.backgroundColor === GOLD
            && element.height === 4,
    );
    assert.equal(sectionBars.length, 4);

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
