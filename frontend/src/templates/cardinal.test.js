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

    // ── Generated icons: grey cardinal theme, one per heading and contact ────
    const icons = cardinalTemplate.filter((element) => element.category === "image");
    assert.equal(icons.length, 8); // 5 section headings + 3 contact rows
    assert.ok(icons.every((element) => element.src.includes("/template-assets/iconic/cardinal/")));
    assert.ok(icons.every((element) => element.alignWithText === true));

    // ── Decorative lines: every rule except the paper surface is grey ────────
    const lines = cardinalTemplate.filter((element) => element.category === "line");
    const rules = lines.filter((element) => element.backgroundColor !== PAPER);
    assert.ok(rules.length > 0);
    assert.ok(rules.every((element) => element.backgroundColor === GREY));

    // ── Body copy: dark grey, readable (never sub-9pt) ───────────────────────
    const bodies = cardinalTemplate.filter((element) => element.category === "textarea");
    assert.ok(bodies.length > 0);
    assert.ok(bodies.every((element) => element.color === BODY));
    assert.ok(bodies.every((element) => element.fontSize >= 9));

    // ── Name: serif, anchoring the masthead ──────────────────────────────────
    const name = cardinalTemplate.find(
        (element) => element.category === "text" && element.content === "ANNA KOWALSKA",
    );
    assert.equal(name?.fontFamily, "Times-Roman");
});
