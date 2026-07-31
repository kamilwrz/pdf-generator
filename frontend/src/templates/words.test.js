import assert from "node:assert/strict";
import test from "node:test";

import { wordsTemplate } from "./words.js";

test("Words resembles a monochrome Word document without decorative frames", () => {
    const textElements = wordsTemplate.filter(
        (element) => element.category === "text" || element.category === "textarea",
    );
    const colors = new Set(
        wordsTemplate.flatMap((element) => (
            [element.color, element.backgroundColor].filter(Boolean)
        )),
    );
    const sectionHeadings = wordsTemplate.filter(
        (element) => (
            element.category === "text"
            && element.flowRole === "section-chrome"
        ),
    );
    const circles = wordsTemplate.filter((element) => element.category === "circle");

    assert.ok(textElements.length > 0);
    assert.ok(textElements.every((element) => element.fontSize >= 10));
    assert.ok(textElements.every((element) => element.fontFamily === "Times-Roman"));
    assert.ok([...colors].every((color) => (
        /^#[0-9A-F]{6}$/i.test(color)
        && color.slice(1, 3).toUpperCase() === color.slice(3, 5).toUpperCase()
        && color.slice(3, 5).toUpperCase() === color.slice(5, 7).toUpperCase()
    )));
    assert.equal(wordsTemplate.some((element) => element.category === "rectangle"), false);
    assert.equal(wordsTemplate.some((element) => element.category === "ellipse"), false);
    assert.equal(sectionHeadings.length, 4);
    assert.ok(sectionHeadings.every((element) => element.fontSize === 12));
    assert.ok(circles.length > 0);
    assert.ok(circles.every((element) => element.width <= 7 && element.height <= 7));
});
