import assert from "node:assert/strict";
import test from "node:test";

import { regentTemplate } from "./regent.js";

const INK = "#151515";
const BODY = "#242424";
const MUTED = "#6A6A6A";
const RULE = "#CFCFCF";
const L = 62;
const W = 471;

test("Regent preserves its monochrome editorial hierarchy", () => {
    const pageSurface = regentTemplate.find(
        (element) => element.fixedToPage && element.width === 595 && element.height === 842,
    );
    assert.equal(pageSurface?.backgroundColor, "#FFFFFF");

    const summary = regentTemplate.find(
        (element) =>
            element.category === "textarea"
            && element.fontSize === 9.5
            && element.fontFamily === "Montserrat"
            && element.flowRole === "content",
    );
    assert.ok(summary);
    assert.equal(summary.fontSize, 9.5);
    assert.equal(summary.lineHeight, 11);
    assert.equal(summary.fontFamily, "Montserrat");
    assert.equal(summary.color, INK);
    assert.equal(summary.left, L);
    assert.equal(summary.width, W);

    const contentTextareas = regentTemplate.filter(
        (element) =>
            element.category === "textarea"
            && [9.5, 10.5, 11].includes(element.fontSize),
    );
    assert.ok(contentTextareas.length >= 5);
    assert.ok(contentTextareas.every((element) => element.lineHeight === 11));

    const name = regentTemplate.find((element) => element.content === "Aleksandra Nowak");
    assert.equal(name?.fontFamily, "CormorantGaramond");
    assert.equal(name?.fontSize, 38);
    assert.equal(name?.flowRole, "masthead");

    const headings = regentTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "text",
    );
    assert.equal(headings.length, 3);
    assert.ok(headings.every((element) => element.left === L && element.color === INK));

    const dividers = regentTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "line",
    );
    assert.equal(dividers.length, headings.length);
    assert.ok(dividers.every((element) => element.width === W && element.backgroundColor === RULE));

    const contactIcons = regentTemplate.filter(
        (element) => element.category === "image" && element.flowRole === "masthead",
    );
    assert.equal(contactIcons.length, 4);
    assert.ok(contactIcons.every((element) => element.src.includes("/template-assets/iconic/regent/")));

    // Zero-sized contact/masthead metadata anchors carry a generic black
    // fallback but are never rendered. Evaluate only visible template chrome.
    const palette = new Set(
        regentTemplate
            .filter((element) => (element.width ?? 1) > 0 || (element.height ?? 1) > 0)
            .flatMap((element) => [element.color, element.backgroundColor])
            .filter(Boolean),
    );
    assert.deepEqual([...palette].sort(), [BODY, INK, MUTED, RULE, "#FFFFFF"].sort());
});
