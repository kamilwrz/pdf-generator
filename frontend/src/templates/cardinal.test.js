import assert from "node:assert/strict";
import test from "node:test";

import { cardinalTemplate } from "./cardinal.js";

const PAPER = "#FCFBF9";
const CARDINAL = "#9E2532";
const BODY = "#333333";
const GREY = "#8A8A8A";

test("Cardinal reserves red for headings while icons and rules stay grey", () => {
    // ── Single column: no sidebar band and no decorative frame primitives ────
    // The only full-height element is the paper surface; any other tall band
    // would imply a second column, which this layout must never grow.
    const tallElements = cardinalTemplate.filter((element) => (element.height ?? 0) >= 300);
    assert.equal(tallElements.length, 1);
    assert.equal(tallElements[0].backgroundColor, PAPER);
    for (const category of ["rectangle", "circle", "ellipse"]) {
        assert.equal(
            cardinalTemplate.some((element) => element.category === category),
            false,
            `Cardinal should not use ${category} primitives`,
        );
    }

    // ── Section headings: cardinal red, sans, grouped as reflow chrome ───────
    const sectionHeadings = cardinalTemplate.filter(
        (element) => element.category === "text" && element.flowRole === "section-chrome",
    );
    assert.equal(sectionHeadings.length, 5);
    assert.ok(sectionHeadings.every((element) => element.color === CARDINAL));
    assert.ok(sectionHeadings.every((element) => element.fontFamily === "Helvetica"));
    assert.ok(sectionHeadings.every((element) => element.fontSize === 11.2));
    assert.ok(sectionHeadings.every((element) => element.bold === true));
    assert.ok(sectionHeadings.every((element) => element.left === 94));

    // ── Generated icons: all ornament begins at or inside the body edge ──────
    const icons = cardinalTemplate.filter((element) => element.category === "image");
    assert.equal(icons.length, 11); // 5 section headings + 6 contact rows (phone/email/linkedin/github/website/location)
    assert.ok(icons.every((element) => element.src.includes("/template-assets/iconic/cardinal/")));
    assert.ok(icons.every((element) => element.alignWithText === true));
    assert.ok(icons.every((element) => element.left >= 72));
    const sectionIcons = icons.filter((element) => element.flowRole === "section-chrome");
    assert.equal(sectionIcons.length, 5);
    assert.ok(sectionIcons.every((element) => element.left === 72));
    assert.ok(sectionIcons.every((element) => element.width === 16.5 && element.height === 16.5));

    // ── Decorative lines: every rule except the paper surface is grey ────────
    const lines = cardinalTemplate.filter((element) => element.category === "line");
    const rules = lines.filter((element) => element.backgroundColor !== PAPER);
    assert.ok(rules.length > 0);
    assert.ok(rules.every((element) => element.backgroundColor === GREY));
    const sectionRules = rules.filter((element) => element.flowRole === "section-chrome");
    assert.equal(sectionRules.length, 5);
    assert.ok(sectionRules.every((element) => element.left > 94));
    assert.ok(sectionRules.every((element) => element.left + element.width === 545));
    for (const heading of sectionHeadings) {
        const expectedTop = heading.top
            + heading.fontSize * (0.34 - (1490 / 2048) / 2)
            - 0.8 / 2;
        const rule = sectionRules.find((element) => Math.abs(element.top - expectedTop) < 1e-9);
        assert.ok(rule, `${heading.content} rule crosses the visible Inter cap midline`);
    }

    // ── Body copy: dark grey prose at readable size; meta rows stay muted ────
    const bodies = cardinalTemplate.filter((element) => element.category === "textarea");
    assert.ok(bodies.length > 0);
    const prose = bodies.filter((element) => element.color === BODY);
    assert.ok(prose.length > 0);
    assert.ok(prose.every((element) => element.fontSize >= 9));
    assert.ok(bodies.every((element) => element.fontSize >= 8));

    // ── Name: serif, anchoring the masthead ──────────────────────────────────
    const name = cardinalTemplate.find(
        (element) => element.category === "text" && element.content === "Jan Kowalski",
    );
    assert.equal(name?.fontFamily, "Times-Roman");
});
