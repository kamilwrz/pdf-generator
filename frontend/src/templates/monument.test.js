import assert from "node:assert/strict";
import test from "node:test";

import { monumentTemplate } from "./monument.js";

test("Monument keeps its text hierarchy readable and monochrome", () => {
    const textElements = monumentTemplate.filter(
        (element) => element.category === "text" || element.category === "textarea",
    );
    const colors = new Set(
        monumentTemplate.flatMap((element) => (
            [element.color, element.backgroundColor].filter(Boolean)
        )),
    );

    assert.ok(textElements.length > 0);
    assert.ok(textElements.every((element) => element.fontSize >= 9));
    assert.ok([...colors].every((color) => (
        /^#[0-9A-F]{6}$/i.test(color)
        && color.slice(1, 3).toUpperCase() === color.slice(3, 5).toUpperCase()
        && color.slice(3, 5).toUpperCase() === color.slice(5, 7).toUpperCase()
    )));
    assert.ok(monumentTemplate.some(
        (element) => element.category === "rectangle" && element.id === "monument-experience-frame",
    ));
    assert.ok(monumentTemplate.some(
        (element) => element.content === "DYREKTORKA KREATYWNA" && element.fontSize === 12.5,
    ));
    assert.ok(monumentTemplate.some(
        (element) => element.content === "DOŚWIADCZENIE" && element.fontSize === 12.5,
    ));
    // Summary must match body copy size, not sit one step above it.
    const summary = monumentTemplate.find(
        (element) => (
            element.category === "textarea"
            && String(element.content || "").includes("strategiczne myślenie")
        ),
    );
    const body = monumentTemplate.find(
        (element) => element.category === "textarea" && element.bulletList,
    );
    assert.equal(summary?.fontSize, body?.fontSize);
    assert.equal(summary?.fontSize, 9);
    assert.deepEqual(
        monumentTemplate
            .filter((element) => element.color === "#FFFFFF" && element.fontSize === 11)
            .map((element) => element.content),
        ["01", "02", "03"],
    );
    const sectionFrames = monumentTemplate.filter(
        (element) => element.category === "rectangle" && element.left === 106,
    );
    assert.ok(sectionFrames.every(
        (element) => (
            element.left === 106
            && element.width === 251
            && element.height === 32
            && element.flowRole === "section-chrome"
        ),
    ));
    const mastheadRails = monumentTemplate.filter(
        (element) => element.category === "line" && [51, 529].includes(element.left),
    );
    assert.equal(mastheadRails.length, 2);
    assert.ok(mastheadRails.every(
        (element) => element.repeatOnContinuation === false,
    ));
});
