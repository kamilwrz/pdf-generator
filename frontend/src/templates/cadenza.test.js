import assert from "node:assert/strict";
import test from "node:test";

import { cadenzaTemplate } from "./cadenza.js";
import { DEFAULT_FLOW_SPACING } from "../utils/flowSpacing.js";
import {
    appendSectionAtEnd,
    applyFlowSpacing,
    deriveSectionStyle,
    listDocumentSections,
    normalizeFilledBandSectionHeading,
    reorderSection,
    sectionElementIds,
} from "../utils/sectionStructure.js";
import { buildSectionElements, SECTION_LAYOUTS } from "../utils/sectionBuilder.js";
import {
    listSectionContentElements,
    partitionSectionRecords,
    reorderRecordBlock,
} from "../utils/sectionRecord.js";

const PAGE_HEIGHT = 842;

function withElementIds(elements) {
    return elements.map((element, index) => ({ ...element, element_id: `cadenza-${index}` }));
}

function absoluteTop(element) {
    return (Math.max(1, Number(element?.page) || 1) - 1) * PAGE_HEIGHT
        + (Number(element?.top) || 0);
}

function sectionMembers(elements, headingId) {
    const ids = sectionElementIds(elements, headingId, PAGE_HEIGHT);
    return elements.filter((element) => ids.has(element.element_id));
}

function assertCadenzaBandsAreHealthy(elements, afterRuleGap) {
    const sections = listDocumentSections(elements, PAGE_HEIGHT);
    assert.equal(sections.length, 5);

    for (const section of sections) {
        const members = sectionMembers(elements, section.headingId);
        const band = members.find((element) => (
            element.flowRole === "section-chrome"
            && element.backgroundColor === "#E8EDEE"
        ));
        const accent = members.find((element) => (
            element.flowRole === "section-chrome"
            && element.backgroundColor === "#9B735A"
            && Number(element.width) === 3
        ));
        const firstBody = members
            .filter((element) => (
                element.flowRole === "content" || element.flowRole === "grid-member"
            ))
            .sort((left, right) => absoluteTop(left) - absoluteTop(right))[0];

        assert.ok(band, `${section.title} keeps its filled title band`);
        assert.ok(accent, `${section.title} keeps its narrow accent`);
        assert.ok(firstBody, `${section.title} keeps its first body block`);
        assert.ok(
            Math.abs(absoluteTop(accent) - absoluteTop(band)) < 0.01,
            `${section.title} keeps the accent aligned with its band`,
        );
        assert.ok(
            Math.abs(
                absoluteTop(firstBody)
                - (absoluteTop(band) + Number(band.height) + afterRuleGap),
            ) < 0.01,
            `${section.title} body follows the band without an inflated gap`,
        );
    }
}

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

    const headings = cadenzaTemplate.filter((element) => (
        element.flowRole === "section-chrome" && element.category === "text"
    ));
    assert.equal(headings.length, bands.length);
    for (const heading of headings) {
        const band = bands.find((candidate) => (
            Math.abs(Number(candidate.top) + 5.1 - Number(heading.top)) < 0.01
        ));
        assert.ok(band, `${heading.content} keeps its owning title band`);
        assert.equal(heading.left, band.left);
        assert.equal(heading.width, band.width);
        assert.equal(heading.align, "center");
        assert.equal(heading.letterSpacing, 1.8);
    }

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

test("Cadenza Add section reproduces the filled title band and accent", () => {
    const source = withElementIds(cadenzaTemplate);
    const sections = listDocumentSections(source, PAGE_HEIGHT);
    const anchor = sections[sections.length - 1];
    const style = deriveSectionStyle(source, PAGE_HEIGHT, anchor.headingId);
    let nextId = 0;
    const built = buildSectionElements({
        name: "NOWA SEKCJA",
        layout: SECTION_LAYOUTS.RECORD_SUBCATEGORY,
        style,
        spacing: DEFAULT_FLOW_SPACING,
        idFactory: () => `cadenza-added-${nextId += 1}`,
    });
    const appended = appendSectionAtEnd(
        source,
        built.elements,
        PAGE_HEIGHT,
        { spacing: DEFAULT_FLOW_SPACING },
    );
    const added = listDocumentSections(appended, PAGE_HEIGHT)
        .find((section) => section.headingId === built.headingId);

    assert.ok(added, "the newly built heading remains a detectable section");
    const members = sectionMembers(appended, added.headingId);
    const band = members.find((element) => (
        element.flowRole === "section-chrome"
        && element.backgroundColor === "#E8EDEE"
        && Number(element.width) === 479
        && Number(element.height) === 18
    ));
    const accent = members.find((element) => (
        element.flowRole === "section-chrome"
        && element.backgroundColor === "#9B735A"
        && Number(element.width) === 3
        && Number(element.height) === 18
    ));

    assert.ok(band, "the added section keeps Cadenza's full-width title band");
    assert.ok(accent, "the added section keeps Cadenza's narrow copper accent");
    assert.equal(absoluteTop(accent), absoluteTop(band));
    assert.equal(accent.left, band.left);
    const heading = members.find((element) => element.element_id === built.headingId);
    assert.equal(heading.left, band.left);
    assert.equal(heading.width, band.width);
    assert.equal(heading.align, "center");
});

test("Cadenza re-centres a legacy added heading after every input value", () => {
    const source = withElementIds(cadenzaTemplate);
    const anchor = listDocumentSections(source, PAGE_HEIGHT).at(-1);
    const style = deriveSectionStyle(source, PAGE_HEIGHT, anchor.headingId);
    let nextId = 0;
    const built = buildSectionElements({
        name: "NOWA SEKCJA",
        layout: SECTION_LAYOUTS.RECORD_SUBCATEGORY,
        style,
        spacing: DEFAULT_FLOW_SPACING,
        idFactory: () => `cadenza-live-${nextId += 1}`,
    });
    const appended = appendSectionAtEnd(
        source,
        built.elements,
        PAGE_HEIGHT,
        { spacing: DEFAULT_FLOW_SPACING },
    );
    // Simulate a document saved before the full-band alignment contract.
    let edited = appended.map((element) => {
        if (element.element_id !== built.headingId) return element;
        const legacy = { ...element, left: style.left };
        delete legacy.width;
        delete legacy.align;
        return legacy;
    });

    for (const content of ["N", "NOWA SEKCJA", "BARDZO DŁUGA NAZWA SEKCJI"]) {
        edited = edited.map((element) => (
            element.element_id === built.headingId ? { ...element, content } : element
        ));
        edited = normalizeFilledBandSectionHeading(edited, built.headingId, PAGE_HEIGHT);
        const members = sectionMembers(edited, built.headingId);
        const heading = members.find((element) => element.element_id === built.headingId);
        const band = members.find((element) => (
            element.backgroundColor === "#E8EDEE" && Number(element.width) === 479
        ));

        assert.ok(band);
        assert.equal(heading.content, content);
        assert.equal(heading.left, band.left);
        assert.equal(heading.width, band.width);
        assert.equal(heading.align, "center");
    }
});

test("Cadenza spacing remains idempotent and keeps every title band together", () => {
    const rhythm = { stack: 8, record: 20, section: 35, after_rule: 16 };
    const firstPack = applyFlowSpacing(withElementIds(cadenzaTemplate), rhythm, PAGE_HEIGHT);
    const secondPack = applyFlowSpacing(firstPack, rhythm, PAGE_HEIGHT);

    assertCadenzaBandsAreHealthy(firstPack, rhythm.after_rule);
    assertCadenzaBandsAreHealthy(secondPack, rhythm.after_rule);

    const firstGeometry = new Map(firstPack.map((element) => [
        element.element_id,
        { page: element.page, top: element.top },
    ]));
    for (const element of secondPack) {
        const previous = firstGeometry.get(element.element_id);
        assert.equal(element.page, previous.page, `${element.element_id} stays on the same page`);
        assert.ok(
            Math.abs(Number(element.top) - Number(previous.top)) < 0.01,
            `${element.element_id} keeps a stable top after a repeated pack`,
        );
    }
});

test("Cadenza repairs title accents left behind by an older spacing pass", () => {
    const rhythm = { stack: 8, record: 20, section: 35, after_rule: 16 };
    const healthy = applyFlowSpacing(withElementIds(cadenzaTemplate), rhythm, PAGE_HEIGHT);
    let keptFirstAccent = false;

    // Reproduce the persisted corruption: later filled bands moved with their
    // headings, while each narrow accent stayed one former section step above.
    const corrupted = healthy.map((element) => {
        const isAccent = element.flowRole === "section-chrome"
            && element.backgroundColor === "#9B735A"
            && Number(element.width) === 3;
        if (!isAccent || !keptFirstAccent) {
            if (isAccent) keptFirstAccent = true;
            return element;
        }
        const staleAbs = absoluteTop(element) - 22;
        const page = Math.max(1, Math.floor(staleAbs / PAGE_HEIGHT) + 1);
        return { ...element, page, top: staleAbs - (page - 1) * PAGE_HEIGHT };
    });

    const repaired = applyFlowSpacing(corrupted, rhythm, PAGE_HEIGHT);
    assertCadenzaBandsAreHealthy(repaired, rhythm.after_rule);
    assert.ok(
        Math.max(...repaired.map((element) => Number(element.page) || 1)) <= 2,
        "repair does not create blank continuation pages",
    );
});

test("Cadenza keeps compact bands after record and section reordering", () => {
    const elements = applyFlowSpacing(
        withElementIds(cadenzaTemplate),
        DEFAULT_FLOW_SPACING,
        PAGE_HEIGHT,
    );
    const sections = listDocumentSections(elements, PAGE_HEIGHT);
    const experience = sections.find((section) => section.title.includes("DOŚWIADCZENIE"));
    assert.ok(experience);

    const records = partitionSectionRecords(
        listSectionContentElements(elements, experience.headingId, PAGE_HEIGHT),
    );
    const secondRecordTitle = records[1].find((element) => element.flowRole === "content");
    assert.ok(secondRecordTitle);

    const recordResult = reorderRecordBlock(
        elements,
        secondRecordTitle.element_id,
        "up",
        PAGE_HEIGHT,
        { spacing: DEFAULT_FLOW_SPACING },
    );
    assert.ok(recordResult);
    const reorderedRecords = partitionSectionRecords(
        listSectionContentElements(recordResult.elements, experience.headingId, PAGE_HEIGHT),
    );
    assert.equal(
        reorderedRecords[0].find((element) => element.flowRole === "content")?.content,
        "Analityczka KYC",
    );

    const sectionResult = reorderSection(
        recordResult.elements,
        experience.headingId,
        "down",
        PAGE_HEIGHT,
        { spacing: DEFAULT_FLOW_SPACING },
    );
    assert.ok(sectionResult);
    assert.deepEqual(
        listDocumentSections(sectionResult, PAGE_HEIGHT).map((section) => section.title),
        [
            "PODSUMOWANIE ZAWODOWE",
            "WYKSZTAŁCENIE",
            "DOŚWIADCZENIE ZAWODOWE",
            "UMIEJĘTNOŚCI",
            "JĘZYKI",
        ],
    );
    assertCadenzaBandsAreHealthy(sectionResult, DEFAULT_FLOW_SPACING.after_rule);
});
