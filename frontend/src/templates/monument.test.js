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
    assert.ok(textElements.every((element) => element.fontSize >= 10));
    assert.ok([...colors].every((color) => (
        /^#[0-9A-F]{6}$/i.test(color)
        && color.slice(1, 3).toUpperCase() === color.slice(3, 5).toUpperCase()
        && color.slice(3, 5).toUpperCase() === color.slice(5, 7).toUpperCase()
    )));
    assert.ok(monumentTemplate.some(
        (element) => element.category === "rectangle" && element.id === "monument-experience-frame",
    ));
    assert.ok(monumentTemplate.some(
        (element) => element.content === "DYREKTORKA KREATYWNA" && element.fontSize === 13.5,
    ));
    assert.ok(monumentTemplate.some(
        (element) => element.content === "DOŚWIADCZENIE" && element.fontSize === 13.5,
    ));
});
