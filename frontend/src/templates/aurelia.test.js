import assert from "node:assert/strict";
import test from "node:test";

import { aureliaTemplate } from "./aurelia.js";

const PAPER = "#FEFDF9";
const GOLD = "#B3924F";
const SLATE = "#3A3A36";
const STONE = "#5A5A54";
const WHITE = "#FFFFFF";
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
    SLATE,
    STONE,
    WHITE,
]);

test("Aurelia uses thick contrasting Bézier plates with white type and gold accent", () => {
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
    assert.equal(paths.length, 4, "mist companion + name + title + gold accent");
    assert.ok(paths.every((element) => element.curves.some((segment) => segment.type === "C")));
    assert.ok(paths.every((element) => element.filled === false));
    assert.equal(new Set(paths.map((element) => element.top)).size, 4);

    const backdrop = aureliaTemplate.find((element) => element.id === "aurelia-name-backdrop");
    const nameplate = aureliaTemplate.find((element) => element.id === "aurelia-nameplate");
    const titleplate = aureliaTemplate.find((element) => element.id === "aurelia-titleplate");
    const ink = aureliaTemplate.find((element) => element.id === "aurelia-name-ink");
    const name = aureliaTemplate.find((element) => element.content === "Jan Kowalski");
    const title = aureliaTemplate.find(
        (element) => element.content === "Dyrektor Strategii i Rozwoju",
    );
    assert.equal(backdrop?.backgroundColor, MIST);
    assert.equal(backdrop?.borderWidth, 22);
    assert.equal(backdrop?.zIndex, 1);
    assert.equal(nameplate?.backgroundColor, SLATE);
    assert.equal(nameplate?.borderWidth, 44);
    assert.equal(nameplate?.height, 52);
    assert.equal(nameplate?.zIndex, 2);
    assert.equal(titleplate?.backgroundColor, STONE);
    assert.equal(titleplate?.borderWidth, 30);
    assert.equal(titleplate?.height, 36);
    assert.equal(titleplate?.zIndex, 2);
    assert.equal(ink?.backgroundColor, GOLD);
    assert.equal(ink?.borderWidth, 6);
    assert.equal(ink?.zIndex, 3);
    assert.equal(name?.zIndex, 4);
    assert.equal(name?.color, WHITE);
    assert.equal(title?.color, WHITE);
    assert.ok(paths.every((element) => element.flowRole === "masthead"));
    assert.ok(paths.every((element) => element.zIndex < name.zIndex));
    assert.ok(nameplate.width > ink.width);
    assert.ok(nameplate.borderWidth > titleplate.borderWidth);
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
    assert.equal(headings.length, 5);
    assert.ok(headings.every((element) => element.left === 116));
    assert.ok(headings.every((element) => element.fontFamily === "Montserrat"));
    const sectionBars = aureliaTemplate.filter(
        (element) => element.flowRole === "section-chrome"
            && element.category === "line"
            && element.backgroundColor === GOLD
            && element.height === 4,
    );
    assert.equal(sectionBars.length, 5);
    const sectionRules = aureliaTemplate.filter(
        (element) => element.flowRole === "section-chrome"
            && element.category === "line"
            && element.backgroundColor === "#DCD8CE",
    );
    assert.equal(sectionRules.length, 5);
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
    // Body paragraphs and language bullets stay at the compact reading size;
    // education diploma/school rows are intentionally a step larger.
    const proseBlocks = bodyBlocks.filter((element) => element.fontSize <= 9.3);
    assert.ok(proseBlocks.length >= 4);
    assert.ok(proseBlocks.every((element) => element.fontSize <= 9.3));

    for (const element of aureliaTemplate) {
        const color = element.color ?? element.backgroundColor;
        if (color) assert.ok(ALLOWED_PALETTE.has(color), `unexpected Aurelia color ${color}`);
    }
});
