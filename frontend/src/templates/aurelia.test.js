import assert from "node:assert/strict";
import test from "node:test";

import { aureliaTemplate } from "./aurelia.js";

const PAPER = "#FEFDF9";
const GOLD = "#B3924F";
const CLOUD = "#F4F3EF";
const SILVER = "#E6E6E2";
const ASH = "#C4C4BF";
const MIST = "#D6D6D3";
const ALLOWED_PALETTE = new Set([
    PAPER,
    "#272724",
    "#464540",
    "#77736B",
    GOLD,
    "#8B713A",
    "#DCD8CE",
    MIST,
    CLOUD,
    SILVER,
    ASH,
]);

test("Aurelia uses light Bézier name/title plates and label-aware section rules", () => {
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
    assert.equal(paths.length, 4, "mist companion + name + title + ash accent");
    assert.ok(paths.every((element) => element.curves.some((segment) => segment.type === "C")));
    assert.ok(paths.every((element) => element.filled === false));
    assert.equal(new Set(paths.map((element) => element.top)).size, 4);

    const backdrop = aureliaTemplate.find((element) => element.id === "aurelia-name-backdrop");
    const nameplate = aureliaTemplate.find((element) => element.id === "aurelia-nameplate");
    const titleplate = aureliaTemplate.find((element) => element.id === "aurelia-titleplate");
    const ink = aureliaTemplate.find((element) => element.id === "aurelia-name-ink");
    const name = aureliaTemplate.find((element) => element.content === "ANNA KOWALSKA");
    const title = aureliaTemplate.find(
        (element) => element.content === "STRATEGIA  ·  OPERACJE  ·  TRANSFORMACJA",
    );
    assert.equal(backdrop?.backgroundColor, MIST);
    assert.equal(backdrop?.borderWidth, 18);
    assert.equal(backdrop?.zIndex, 1);
    assert.equal(nameplate?.backgroundColor, CLOUD);
    assert.equal(nameplate?.borderWidth, 28);
    assert.equal(nameplate?.zIndex, 2);
    assert.equal(titleplate?.backgroundColor, SILVER);
    assert.equal(titleplate?.borderWidth, 16);
    assert.equal(titleplate?.zIndex, 2);
    assert.equal(ink?.backgroundColor, ASH);
    assert.equal(ink?.borderWidth, 4.5);
    assert.equal(ink?.zIndex, 3);
    assert.equal(name?.zIndex, 4);
    assert.equal(title?.color, "#77736B");
    assert.ok(paths.every((element) => element.flowRole === "masthead"));
    assert.ok(paths.every((element) => element.zIndex < name.zIndex));
    assert.ok(nameplate.width > ink.width);
    assert.ok(titleplate.top > nameplate.top);
    assert.ok(aureliaTemplate.indexOf(backdrop) < aureliaTemplate.indexOf(nameplate));
    assert.ok(aureliaTemplate.indexOf(nameplate) < aureliaTemplate.indexOf(titleplate));
    assert.ok(aureliaTemplate.indexOf(titleplate) < aureliaTemplate.indexOf(ink));
    assert.ok(aureliaTemplate.indexOf(ink) < aureliaTemplate.indexOf(name));
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
