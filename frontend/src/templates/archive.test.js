import assert from "node:assert/strict";
import test from "node:test";

import { archiveTemplate } from "./archive.js";

test("Archive is a wide-sidebar editorial starter with Lora and Inter", () => {
    const paper = archiveTemplate.find(
        (element) => element.fixedToPage && element.width === 595
            && element.height === 842 && element.backgroundColor === "#F3F0E9",
    );
    const rail = archiveTemplate.find(
        (element) => element.fixedToPage && element.left === 0
            && element.width === 210 && element.backgroundColor === "#E6E5DD",
    );
    const name = archiveTemplate.find((element) => element.content === "Julia Bernat");

    assert.ok(paper);
    assert.ok(rail);
    assert.equal(name?.fontFamily, "Lora");
    assert.equal(name?.align, "center");

    const textFamilies = new Set(
        archiveTemplate
            .filter((element) => element.category === "text" || element.category === "textarea")
            .map((element) => element.fontFamily),
    );
    assert.deepEqual([...textFamilies].sort(), ["Inter", "Lora"]);

    const sidebarChrome = archiveTemplate.filter(
        (element) => element.flowRole === "sidebar-chrome",
    );
    assert.ok(sidebarChrome.length >= 3);
    assert.ok(sidebarChrome.every((element) => element.flowLane === "sidebar"));
});
