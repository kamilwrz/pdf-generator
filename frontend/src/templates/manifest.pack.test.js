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
// loader does that in the app). Regression guard: the sidebar rail (summary /
// languages / education) must stay completely untouched by every operation
// that repacks the main column — it lives far enough left of the main
// heading that `sameColumnAsHeading` excludes it from section membership
// entirely (see the generator's module docstring).
const FIXTURE = JSON.parse(
    readFileSync(new URL("./manifest.multipage.fixture.json", import.meta.url), "utf8"),
);

const PAGE_HEIGHT = 842;
const EXPECTED_ORDER = ["DOŚWIADCZENIE ZAWODOWE", "UMIEJĘTNOŚCI"];

const absTop = (element) => ((element.page || 1) - 1) * PAGE_HEIGHT + (element.top || 0);

function sidebarSnapshot(elements) {
    return elements
        .filter((element) => element.left === 42)
        .map((element) => ({ id: element.element_id, top: element.top, page: element.page }));
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
        // No sidebar element (left 42) is ever pulled into a main-column
        // section's membership (left 212) — the two-column exclusion boundary.
        assert.ok(
            [...ids].every((id) => elements.find((element) => element.element_id === id)?.left !== 42),
            `${label}: ${section.title} does not absorb sidebar content`,
        );
    }
}

test("Manifest keeps main-column headings glued to their bodies, and the sidebar untouched, across pages and spacing changes", () => {
    const sidebarBefore = sidebarSnapshot(FIXTURE);

    assertHeadingsGlued(FIXTURE, "as-generated");

    const afterDefault = applyFlowSpacing(FIXTURE, { stack: 4, record: 10, section: 21, after_rule: 8 });
    assertHeadingsGlued(afterDefault, "default rhythm");
    assert.deepEqual(sidebarSnapshot(afterDefault), sidebarBefore, "default rhythm leaves the sidebar untouched");

    const afterCompact = applyFlowSpacing(FIXTURE, { stack: 3, record: 7, section: 15, after_rule: 6 });
    assertHeadingsGlued(afterCompact, "compact rhythm");
    assert.deepEqual(sidebarSnapshot(afterCompact), sidebarBefore, "compact rhythm leaves the sidebar untouched");

    const sections = listDocumentSections(FIXTURE);
    const reordered = reorderSection(FIXTURE, sections[1].headingId, "up");
    assert.ok(reordered, "reorder succeeds");
    assert.deepEqual(
        listDocumentSections(reordered).map((section) => section.title),
        ["UMIEJĘTNOŚCI", "DOŚWIADCZENIE ZAWODOWE"],
    );
    assertHeadingsGlued(reordered, "after reorder", ["UMIEJĘTNOŚCI", "DOŚWIADCZENIE ZAWODOWE"]);
    assert.deepEqual(sidebarSnapshot(reordered), sidebarBefore, "reorder leaves the sidebar untouched");
});
