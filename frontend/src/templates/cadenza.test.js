import assert from "node:assert/strict";
import test from "node:test";

import { cadenzaTemplate } from "./cadenza.js";

test("Cadenza preserves its editorial hierarchy and exact date rail", () => {
    const pageSurface = cadenzaTemplate.find(
        (element) => element.fixedToPage && element.width === 595 && element.height === 842,
    );
    assert.equal(pageSurface?.backgroundColor, "#FFFEFB");

    const name = cadenzaTemplate.find((element) => element.mastheadRole === "name");
    assert.equal(name?.fontFamily, "PlayfairDisplay");
    assert.equal(name?.align, "center");
    assert.equal(name?.textTransform, "uppercase");

    const bands = cadenzaTemplate.filter(
        (element) =>
            element.flowRole === "section-chrome"
            && element.backgroundColor === "#E8EDEE",
    );
    const marks = cadenzaTemplate.filter(
        (element) =>
            element.flowRole === "section-chrome"
            && element.backgroundColor === "#9B735A",
    );
    assert.ok(bands.length >= 4);
    assert.equal(bands.length, marks.length);
    assert.ok(bands.every((element) => element.width === 479));
    assert.ok(marks.every((element) => element.width === 3));

    const jobTitle = cadenzaTemplate.find((element) => element.content === "Analityczka AML");
    const period = cadenzaTemplate.find((element) => element.content === "2022 – obecnie");
    assert.ok(jobTitle);
    assert.ok(period);
    assert.equal(period.top, jobTitle.top);
    assert.equal(period.flowRole, "record-overlay");
    assert.equal(period.align, "right");
    assert.equal(period.autoHeight, false);

    const icons = cadenzaTemplate.filter((element) => element.category === "image");
    assert.ok(icons.length > 0);
    assert.ok(
        icons.every((element) => element.src.includes("/template-assets/iconic/cadenza/")),
    );
});
