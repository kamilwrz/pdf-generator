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

test("Aurelia uses restrained Bézier artwork and label-aware section rules", () => {
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
    assert.equal(paths.length, 2, "two separated gestures form the masthead signature");
    assert.ok(paths.every((element) => element.curves.some((segment) => segment.type === "C")));
    assert.ok(paths.every((element) => element.filled === false));
    assert.ok(paths.every((element) => element.backgroundColor === "#8B713A"));

    const lead = aureliaTemplate.find((element) => element.id === "aurelia-signature-lead");
    const tail = aureliaTemplate.find((element) => element.id === "aurelia-signature-tail");
    const bridge = aureliaTemplate.find((element) => element.id === "aurelia-signature-bridge");
    assert.equal(lead?.borderWidth, 4);
    assert.equal(lead?.width, 158);
    assert.equal(tail?.borderWidth, 2.5);
    assert.equal(tail?.width, 96);
    assert.equal(bridge?.category, "line");
    assert.equal(bridge?.flowRole, "masthead");
    assert.equal(bridge?.height, 2);
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
    const sectionRules = aureliaTemplate.filter(
        (element) => element.flowRole === "section-chrome"
            && element.category === "line"
            && element.backgroundColor === "#DCD8CE",
    );
    assert.equal(sectionRules.length, 4);
    assert.ok(sectionRules.every((element) => element.left + element.width === 515));
    assert.ok(
        new Set(sectionRules.map((element) => element.width)).size > 1,
        "short labels must receive longer rules than long labels",
    );

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
