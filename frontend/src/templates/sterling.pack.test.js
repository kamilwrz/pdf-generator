import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    applyFlowSpacing,
    listDocumentSections,
    sectionElementIds,
} from "../utils/sectionStructure.js";

// A real two-page Sterling document (four experience records force a page
// break), dumped from the backend generator with element ids assigned (the
// loader does that in the app). Regression guard: the sidebar rail never
// folds into the main column, and — unlike Manifest — Sterling's sidebar
// carries Summary, Education, Skills AND Languages (only Experience stays in
// the main column), so this fixture exercises the widest sidebar payload of
// any template in the catalog.
const FIXTURE = JSON.parse(
    readFileSync(new URL("./sterling.multipage.fixture.json", import.meta.url), "utf8"),
);

const PAGE_HEIGHT = 842;
const EXPECTED_ORDER = ["DOŚWIADCZENIE ZAWODOWE"];

const absTop = (element) => ((element.page || 1) - 1) * PAGE_HEIGHT + (element.top || 0);

function sidebarRailSnapshot(elements) {
    return elements
        .filter((element) => element.flowLane === "sidebar")
        .map((element) => ({
            id: element.element_id,
            left: element.left,
            top: element.top,
            page: element.page,
        }));
}

function assertHeadingsGlued(elements, label) {
    const sections = listDocumentSections(elements);
    assert.deepEqual(
        sections.map((section) => section.title),
        EXPECTED_ORDER,
        `${label}: main-column sections detected in document order`,
    );
    for (const section of sections) {
        const ids = sectionElementIds(elements, section.headingId);
        const heading = elements.find((element) => element.element_id === section.headingId);
        const bodies = [...ids]
            .map((id) => elements.find((element) => element.element_id === id))
            .filter(
                (element) =>
                    element &&
                    element.element_id !== section.headingId &&
                    element.flowRole !== "section-chrome" &&
                    element.flowRole !== "masthead",
            );
        assert.ok(bodies.length > 0, `${label}: ${section.title} has a body`);
        const firstBodyTop = Math.min(...bodies.map(absTop));
        const gap = firstBodyTop - absTop(heading);
        assert.ok(
            gap > 0 && gap < 80,
            `${label}: ${section.title} heading stays glued to its body (gap ${gap.toFixed(1)}px)`,
        );
        // No sidebar element is ever pulled into the main-column section.
        assert.ok(
            [...ids].every((id) => elements.find((item) => item.element_id === id)?.flowLane !== "sidebar"),
            `${label}: ${section.title} does not absorb sidebar content`,
        );
    }
}

test("Sterling keeps the Experience heading glued to its body, and packs the wide sidebar lane without folding columns", () => {
    const sidebarBefore = sidebarRailSnapshot(FIXTURE);
    assert.ok(sidebarBefore.length > 0, "fixture has sidebar-lane content");

    assertHeadingsGlued(FIXTURE, "as-generated");

    const afterDefault = applyFlowSpacing(FIXTURE, { stack: 4, record: 10, section: 21, after_rule: 8 });
    assertHeadingsGlued(afterDefault, "default rhythm");
    assert.ok(
        sidebarRailSnapshot(afterDefault).every((item) => item.left === 34),
        "default rhythm keeps the rail on the left",
    );

    const afterCompact = applyFlowSpacing(FIXTURE, { stack: 3, record: 7, section: 15, after_rule: 6 });
    assertHeadingsGlued(afterCompact, "compact rhythm");
    const afterCompactRail = sidebarRailSnapshot(afterCompact);
    assert.ok(afterCompactRail.every((item) => item.left === 34), "compact rhythm keeps the rail on the left");

    // Structured sidebar education (degree/school/period as separate
    // elements) must survive a rhythm change without the records tearing
    // apart from one another.
    const degree = afterCompact.find((element) => element.content === "Magister Zarządzania");
    const school = afterCompact.find((element) => element.content === "SGH Warszawa");
    assert.ok(degree && school, "structured education elements survive repacking");
    assert.equal(degree.flowGroup, school.flowGroup);
});
