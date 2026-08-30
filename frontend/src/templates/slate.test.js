import assert from "node:assert/strict";
import test from "node:test";

import { slateTemplate } from "./slate.js";

test("Slate uses a rectilinear blueprint sidebar and no circles or ellipses", () => {
    const categories = new Set(slateTemplate.map((element) => element.category));
    // Slate's identity is rectilinear: only rectangles, text, and icons.
    assert.deepEqual(
        categories,
        new Set(["text", "textarea", "line", "rectangle", "image"]),
    );
    assert.ok(!categories.has("circle"));
    assert.ok(!categories.has("ellipse"));
    assert.ok(!categories.has("connector"));

    // Two columns use distinct origins and the accent divider stays fixed.
    assert.ok(slateTemplate.some((element) => element.left === 25));
    assert.ok(slateTemplate.some((element) => element.left === 218));
    assert.ok(slateTemplate.some(
        (element) => (
            element.category === "line"
            && element.left === 178
            && element.width === 2
            && element.fixedToPage
        ),
    ));

    // The portrait is explicitly rectangular (taller than wide).
    const photoFrame = slateTemplate.find((element) => element.id === "slate-photo-frame");
    assert.equal(photoFrame?.category, "rectangle");
    assert.equal(photoFrame?.width, 112);
    assert.equal(photoFrame?.height, 126);
    assert.equal(
        slateTemplate.filter((element) => element.photoSlot === "ornament").length,
        5,
    );

    const name = slateTemplate.find((element) => element.mastheadRole === "name");
    const titleBar = slateTemplate.find((element) => element.mastheadRole === "title-decoration");
    const title = slateTemplate.find((element) => element.mastheadRole === "title");
    assert.deepEqual([name?.top, titleBar?.top, title?.top], [60, 92, 98]);
    assert.equal(titleBar.top - name.top, 32);

    // Two icon colour variants: white glyphs for badges, accent glyphs for
    // masthead contacts / the photo placeholder.
    const icons = slateTemplate.filter((element) => element.category === "image");
    assert.ok(icons.length >= 8, `expected >=8 Slate icons, got ${icons.length}`);
    assert.ok(icons.every((element) => element.src.includes("/iconic/slate")));
    assert.ok(icons.some((element) => element.src.includes("/iconic/slate/")));
    assert.ok(icons.some((element) => element.src.includes("/iconic/slate-accent/")));
    assert.ok(icons.some((element) => element.src.endsWith("/portrait.png")));

    // The authored state is masthead-only. The photo visibility transaction
    // later moves this same managed band into the rail without duplicating it.
    assert.equal(
        slateTemplate.some(
            (element) => element.category === "text" && element.content === "KONTAKT",
        ),
        false,
    );
    const mastheadContactIcons = slateTemplate.filter(
        (element) => (
            element.category === "image"
            && element.flowRole === "masthead"
            && /\/(phone|email|location|linkedin|github|website)\.png$/.test(element.src)
        ),
    );
    assert.ok(mastheadContactIcons.length >= 2);

    // Reflow roles and initial-layout protection must be explicit.
    assert.ok(slateTemplate.some((element) => element.flowRole === "section-chrome"));
    assert.ok(slateTemplate.every(
        (element) => (
            element.category !== "textarea"
            || (element.autoHeight && element.preserveInitialLayout)
        ),
    ));
});
