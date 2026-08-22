import assert from "node:assert/strict";
import test from "node:test";

import { tesseraTemplate } from "./tessera.js";

test("Tessera uses an original mosaic sidebar and every supported canvas primitive", () => {
    const categories = new Set(tesseraTemplate.map((element) => element.category));
    assert.deepEqual(
        categories,
        new Set(["text", "textarea", "line", "rectangle", "circle", "ellipse", "image"]),
    );
    assert.ok(!categories.has("connector"));

    // Two columns use distinct origins and the coral divider stays fixed.
    assert.ok(tesseraTemplate.some((element) => element.left === 25));
    assert.ok(tesseraTemplate.some((element) => element.left === 218));
    assert.ok(tesseraTemplate.some(
        (element) => (
            element.category === "line"
            && element.left === 178
            && element.width === 4
            && element.fixedToPage
        ),
    ));

    // The portrait is explicitly rectangular, not a circular photo model.
    const photoFrame = tesseraTemplate.find((element) => element.id === "tessera-photo-frame");
    assert.equal(photoFrame?.category, "rectangle");
    assert.equal(photoFrame?.width, 112);
    assert.equal(photoFrame?.height, 126);

    const icons = tesseraTemplate.filter(
        (element) => element.category === "image",
    );
    assert.ok(icons.length >= 12, `expected >=12 Tessera icons, got ${icons.length}`);
    assert.ok(icons.every((element) => element.src.includes("/iconic/tessera/")));
    assert.ok(icons.some((element) => element.src.endsWith("/portrait.png")));

    // Reflow roles and initial-layout protection must be explicit.
    assert.ok(tesseraTemplate.some((element) => element.flowRole === "section-chrome"));
    assert.ok(tesseraTemplate.every(
        (element) => (
            element.category !== "textarea"
            || (element.autoHeight && element.preserveInitialLayout)
        ),
    ));

    // Contact is masthead-only (icon + separate text labels), never a sidebar
    // KONTAKT block or a single mid-dot textarea/line under the name.
    assert.ok(!tesseraTemplate.some(
        (element) => element.category === "text"
            && element.content === "KONTAKT"
            && (element.left ?? 0) < 178,
    ));
    const mastheadContacts = tesseraTemplate.filter(
        (element) => element.flowRole === "masthead"
            && element.category === "text"
            && (element.left ?? 0) >= 218
            && !element.bold
            && (element.fontSize ?? 0) < 10,
    );
    assert.ok(
        mastheadContacts.length >= 2,
        `expected >=2 masthead contact labels, got ${mastheadContacts.length}`,
    );
    assert.ok(tesseraTemplate.some(
        (element) => element.category === "image"
            && element.flowRole === "masthead"
            && /\/(phone|email|location)\.png$/.test(element.src || ""),
    ));
});
