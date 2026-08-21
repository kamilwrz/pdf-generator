import assert from "node:assert/strict";
import test from "node:test";

import { vestigeTemplate } from "./vestige.js";

test("Vestige keeps contact and compact profile information in a narrow left rail", () => {
    const rail = vestigeTemplate.find(
        (element) => element.fixedToPage && element.left === 0 && element.width === 174 && element.height === 842,
    );
    assert.equal(rail?.backgroundColor, "#F4F4F2");

    const name = vestigeTemplate.find((element) => element.content === "Julia Bernat");
    assert.equal(name?.fontFamily, "CormorantGaramond");
    assert.equal(name?.left, 210);
    assert.equal(name?.width, 335);
    assert.equal(name?.align, "left");

    const contactIcons = vestigeTemplate.filter(
        (element) => element.category === "image" && element.flowRole === "masthead",
    );
    assert.ok(contactIcons.length >= 4);
    assert.ok(contactIcons.every((element) => element.left === 27));
    assert.ok(contactIcons.every((element) => element.src.includes("/template-assets/iconic/vestige/")));

    const sidebarHeadings = vestigeTemplate.filter(
        (element) => element.flowRole === "sidebar-chrome" && element.category === "text",
    );
    assert.ok(sidebarHeadings.length >= 3);
    assert.ok(sidebarHeadings.every((element) => element.left === 27));

    const mainRules = vestigeTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "line",
    );
    assert.ok(mainRules.length >= 1);
    assert.ok(mainRules.every((element) => element.left === 210 && element.width === 335));
});
