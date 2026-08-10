import assert from "node:assert/strict";
import test from "node:test";

import { atriumTemplate } from "./atrium.js";

const PAPER = "#FBFAF7";
const ACCENT = "#556158";
const BODY = "#2C2C29";
const L = 90;
const W = 415;
const PAGE_CENTER = 595 / 2; // 297.5

const isTextual = (element) =>
    element.category === "textarea" || element.category === "text";

test("Atrium is a centered-axis editorial single column, not a Portico recolor", () => {
    // ── Single column: the only full-height element is the paper surface. A
    // second tall band would imply a sidebar, which this layout must never grow.
    const tall = atriumTemplate.filter((element) => (element.height ?? 0) >= 300);
    assert.equal(tall.length, 1);
    assert.equal(tall[0].backgroundColor, PAPER);
    for (const category of ["rectangle", "circle", "ellipse"]) {
        assert.equal(
            atriumTemplate.some((element) => element.category === category),
            false,
            `Atrium must not use ${category} primitives`,
        );
    }

    // ── Narrow content column, centered on the page (heavier side margins than
    // Portico's L=76/W=443). Every textual block shares this geometry, and its
    // horizontal midpoint is the true page center.
    const columnBlocks = atriumTemplate.filter(
        (element) => isTextual(element) && element.left === L && element.width === W,
    );
    assert.ok(columnBlocks.length > 0);
    assert.equal(L + W / 2, PAGE_CENTER);

    // ── Masthead: name + title are centered textareas tagged masthead ─────────
    const name = atriumTemplate.find((element) => element.content === "Anna Kowalska");
    assert.ok(name);
    assert.equal(name.category, "textarea");
    assert.equal(name.align, "center");
    assert.equal(name.flowRole, "masthead");
    assert.equal(name.fontFamily, "PlayfairDisplay"); // high-contrast serif — not Portico's Lora
    const title = atriumTemplate.find(
        (element) => element.content === "Dyrektorka Strategii i Rozwoju",
    );
    assert.equal(title?.align, "center");
    assert.equal(title?.flowRole, "masthead");
    assert.equal(title?.color, ACCENT);

    // ── Contact row: icons from the new `atrium` theme, optically aligned ─────
    const icons = atriumTemplate.filter((element) => element.category === "image");
    assert.equal(icons.length, 6); // phone, email, linkedin, github, website, location
    assert.ok(icons.every((element) => element.src.includes("/template-assets/iconic/atrium/")));
    assert.ok(icons.every((element) => element.alignWithText === true));
    assert.ok(icons.every((element) => element.flowRole === "masthead"));

    // ── Section headings: LEFT-aligned bold accent `text`, no icon. Anchored at
    // the column left L like every other single-column template, so the shared
    // packer and Add-section keep each heading glued to its body (see
    // atrium.pack.test.js). Five: summary/experience/education/skills/languages.
    const headingLabels = atriumTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "text",
    );
    assert.equal(headingLabels.length, 5);
    assert.ok(headingLabels.every((element) => element.color === ACCENT));
    assert.ok(headingLabels.every((element) => element.fontFamily === "Montserrat"));
    assert.ok(headingLabels.every((element) => element.bold === true));
    assert.ok(headingLabels.every((element) => element.left === L)); // column-anchored, not centered

    // ── Body copy stays LEFT-aligned inside the centered column ───────────────
    const bodyBlocks = atriumTemplate.filter(
        (element) =>
            element.category === "textarea" &&
            element.flowRole !== "masthead" &&
            element.flowRole !== "section-chrome",
    );
    assert.ok(bodyBlocks.length > 0);
    assert.ok(bodyBlocks.every((element) => element.align === "left"));

    // ── Decorative language: thin "registration mark" rules only. No full-width
    // heading rule (Portico) and no framing rectangles. Every rule is a hairline
    // and short — the crosshair segments (44 px) are the widest.
    const lines = atriumTemplate.filter((element) => element.category === "line");
    const rules = lines.filter((element) => element.backgroundColor !== PAPER);
    assert.ok(rules.length > 0);
    // Every rule is thin in one axis (heading tick is 26×1.5; crosshair plus arm
    // is 1×7) and short overall — no full-width heading/header rule is allowed.
    assert.ok(rules.every((element) => Math.min(element.width, element.height) <= 1.5));
    assert.ok(
        rules.every((element) => Math.max(element.width, element.height) <= 60),
        "no full-width heading/header rule is allowed",
    );

    // Section ornament is a short accent tick under each left-aligned heading.
    const sectionRules = rules.filter((element) => element.flowRole === "section-chrome");
    assert.ok(sectionRules.length >= 5);
    assert.ok(sectionRules.every((element) => element.width <= 30));
    assert.ok(sectionRules.every((element) => element.backgroundColor === ACCENT));
    assert.ok(sectionRules.every((element) => element.left === L)); // tick aligns with the heading

    // Masthead terminator is a crosshair (accent hairlines), never a header rule.
    const mastheadRules = rules.filter((element) => element.flowRole === "masthead");
    assert.ok(mastheadRules.length >= 4);
    assert.ok(mastheadRules.every((element) => element.backgroundColor === ACCENT));

    // ── Not a timeline: Axis-style record overlays must not appear ────────────
    assert.equal(
        atriumTemplate.some((element) => element.flowRole === "record-overlay"),
        false,
    );

    // ── First-page masthead is authored on page 1 only (no continuation copy) ─
    const masthead = atriumTemplate.filter((element) => element.flowRole === "masthead");
    assert.ok(masthead.length > 0);
    assert.ok(masthead.every((element) => (element.page ?? 1) === 1));
});
