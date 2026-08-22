import assert from "node:assert/strict";
import test from "node:test";

import { vestigeTemplate } from "./vestige.js";
import {
    resolveSectionLaneTransfer,
    transferSectionLane,
} from "../utils/transferSectionLane.js";

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

    // Excludes the masthead photo-slot glyph, which also carries
    // `flowRole: "masthead"` but sits at the photo slot's own left, not the
    // sidebar's.
    const contactIcons = vestigeTemplate.filter(
        (element) => element.category === "image" && element.flowRole === "masthead" && !element.photoSlot,
    );
    assert.ok(contactIcons.length >= 4);
    assert.ok(contactIcons.every((element) => element.left === 27));
    assert.ok(contactIcons.every((element) => element.src.includes("/template-assets/iconic/vestige/")));
    assert.equal(Math.min(...contactIcons.map((element) => element.top)), name.top);

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

test("Vestige emits a clickable masthead photo slot", () => {
    const well = vestigeTemplate.find((element) => element.photoSlot === "ornament");
    const frame = vestigeTemplate.find((element) => element.photoSlot === "frame");
    const glyph = vestigeTemplate.find((element) => element.photoSlot === "glyph");

    assert.equal(frame?.id, "vestige-photo-frame");
    assert.equal(frame?.category, "rectangle");
    assert.equal(well?.category, "rectangle");
    assert.equal(frame?.photoShape, "rect");
    for (const element of [well, frame]) {
        assert.equal(element?.left, 505);
        assert.equal(element?.top, 25);
        assert.equal(element?.width, 60);
        assert.equal(element?.height, 74.4);
    }
    assert.equal(glyph?.category, "image");
    assert.ok(glyph?.src.includes("/template-assets/iconic/vestige/portrait.png"));
    assert.equal(glyph?.alignWithText, false);
});

test("Vestige exposes its rail sections to the shared lane-transfer workflow", () => {
    const elements = vestigeTemplate.map((element, index) => ({
        ...element,
        element_id: `vestige-${index}`,
    }));
    const skills = elements.find((element) => element.content === "UMIEJĘTNOŚCI");
    assert.ok(skills);
    assert.equal(resolveSectionLaneTransfer(elements, skills.element_id, 842), "to-main");

    const moved = transferSectionLane(
        elements,
        skills.element_id,
        842,
        { stack: 4, record: 10, section: 21, after_rule: 8 },
    );
    assert.ok(moved);
    const movedHeading = moved.find((element) => element.element_id === skills.element_id);
    assert.equal(movedHeading?.flowRole, "section-chrome");
    assert.equal(movedHeading?.flowLane, undefined);
});
