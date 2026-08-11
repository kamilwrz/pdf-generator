import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    applyFlowSpacing,
    listDocumentSections,
    sectionElementIds,
    reorderSection,
} from "../utils/sectionStructure.js";

// A real two-page Manifest document (four experience records force a page
// break), dumped from the backend generator with element ids assigned (the
// loader does that in the app). Regression guard: the sidebar rail never
// folds into the main column, while a tagged rail still retargets to the
// Sections-panel rhythm via `packSidebarLane`.
const RAW_FIXTURE = JSON.parse(
    readFileSync(new URL("./manifest.multipage.fixture.json", import.meta.url), "utf8"),
);

/** Stamp the dump with the same lane tags the live generator emits. */
function withSidebarLaneTags(elements) {
    return elements.map((element) => {
        if (!element || element.fixedToPage) return element;
        if (element.flowRole === "masthead") return element;
        if (Number(element.left) !== 42) return element;
        if (element.category === "text" && element.bold) {
            return { ...element, flowRole: "sidebar-chrome", flowLane: "sidebar" };
        }
        if (element.category === "line") {
            return { ...element, flowRole: "sidebar-chrome", flowLane: "sidebar" };
        }
        return { ...element, flowLane: "sidebar", flowRole: element.flowRole || "content" };
    });
}

const FIXTURE = withSidebarLaneTags(RAW_FIXTURE);

const PAGE_HEIGHT = 842;
const EXPECTED_ORDER = ["DOŚWIADCZENIE ZAWODOWE", "UMIEJĘTNOŚCI"];

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

function assertHeadingsGlued(elements, label, expectedOrder = EXPECTED_ORDER) {
    const sections = listDocumentSections(elements);
    assert.deepEqual(
        sections.map((section) => section.title),
        expectedOrder,
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
        // No sidebar element is ever pulled into a main-column section.
        assert.ok(
            [...ids].every((id) => {
                const element = elements.find((item) => item.element_id === id);
                return element?.flowLane !== "sidebar" && element?.left !== 42;
            }),
            `${label}: ${section.title} does not absorb sidebar content`,
        );
    }
}

test("Manifest keeps main-column headings glued, and packs the sidebar lane without folding columns", () => {
    const sidebarBefore = sidebarRailSnapshot(FIXTURE);
    const firstKicker = sidebarBefore.find((item) => {
        const element = FIXTURE.find((entry) => entry.element_id === item.id);
        return element?.flowRole === "sidebar-chrome" && element?.category === "text";
    });
    assert.ok(firstKicker, "fixture has a tagged sidebar kicker");

    assertHeadingsGlued(FIXTURE, "as-generated");

    const afterDefault = applyFlowSpacing(FIXTURE, { stack: 4, record: 10, section: 21, after_rule: 8 });
    assertHeadingsGlued(afterDefault, "default rhythm");
    const afterDefaultRail = sidebarRailSnapshot(afterDefault);
    assert.ok(afterDefaultRail.every((item) => item.left === 42), "default rhythm keeps the rail on the left");
    assert.equal(
        afterDefaultRail.find((item) => item.id === firstKicker.id)?.top,
        firstKicker.top,
        "first sidebar kicker stays anchored at its authored top",
    );

    const afterCompact = applyFlowSpacing(FIXTURE, { stack: 3, record: 7, section: 15, after_rule: 6 });
    assertHeadingsGlued(afterCompact, "compact rhythm");
    const afterCompactRail = sidebarRailSnapshot(afterCompact);
    assert.ok(afterCompactRail.every((item) => item.left === 42), "compact rhythm keeps the rail on the left");
    // Compact section gap must move at least one later sidebar block (not a no-op).
    const moved = afterCompactRail.some((item) => {
        const before = sidebarBefore.find((entry) => entry.id === item.id);
        return before && item.top !== before.top;
    });
    assert.ok(moved, "compact rhythm retargets the sidebar lane");

    const sections = listDocumentSections(FIXTURE);
    const reordered = reorderSection(FIXTURE, sections[1].headingId, "up");
    assert.ok(reordered, "reorder succeeds");
    assert.deepEqual(
        listDocumentSections(reordered).map((section) => section.title),
        ["UMIEJĘTNOŚCI", "DOŚWIADCZENIE ZAWODOWE"],
    );
    assertHeadingsGlued(reordered, "after reorder", ["UMIEJĘTNOŚCI", "DOŚWIADCZENIE ZAWODOWE"]);
    // Main-column reorder must not drag the rail into the main column.
    assert.ok(
        sidebarRailSnapshot(reordered).every((item) => item.left === 42),
        "reorder leaves the sidebar rail on the left",
    );
});
