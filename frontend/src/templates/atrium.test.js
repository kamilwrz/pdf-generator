import assert from "node:assert/strict";
import test from "node:test";

import { atriumTemplate } from "./atrium.js";

const PAPER = "#FBFAF7";
const ACCENT = "#556158";
const RULE = "#E5E3DB";
const BODY = "#2C2C29";
const L = 82;
const W = 431;
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

    // ── Restrained content column, centered on the page. It remains narrower
    // than Portico while giving long body lines enough room to breathe.
    const columnBlocks = atriumTemplate.filter(
        (element) => isTextual(element) && element.left === L && element.width === W,
    );
    assert.ok(columnBlocks.length > 0);
    assert.equal(L + W / 2, PAGE_CENTER);

    // ── Masthead: name + title are centered textareas tagged masthead ─────────
    const name = atriumTemplate.find((element) => element.content === "Weronika Sikora");
    assert.ok(name);
    assert.equal(name.category, "textarea");
    assert.equal(name.align, "center");
    assert.equal(name.flowRole, "masthead");
    assert.equal(name.fontFamily, "PlayfairDisplay"); // high-contrast serif — not Portico's Lora
    const title = atriumTemplate.find(
        (element) => element.content === "Junior Penetration Tester",
    );
    assert.equal(title?.align, "center");
    assert.equal(title?.flowRole, "masthead");
    assert.equal(title?.color, ACCENT);

    // ── Photo slot: frameless (per Atrium's "no framing shapes" identity) ────
    // Unlike Nova/Portico/Harbor, there is no surrounding rect/circle chrome —
    // only a plain image glyph marks the slot until a photo is applied.
    const photoGlyph = atriumTemplate.find((element) => element.photoSlot === "glyph");
    assert.ok(photoGlyph, "Atrium must expose a photo glyph slot");
    assert.equal(photoGlyph.category, "image");
    assert.equal(photoGlyph.id, "atrium-photo-glyph");
    assert.equal(photoGlyph.alignWithText, false); // standalone image, no text companion
    assert.equal(photoGlyph.flowRole, "masthead");
    // Fixed corner placement (not derived from L/W) approved from the live editor.
    assert.equal(photoGlyph.left, 476);
    assert.equal(photoGlyph.top, 21);
    assert.equal(photoGlyph.width, 84);
    assert.ok(
        atriumTemplate.every((element) => element.photoSlot !== "frame"),
        "Atrium must not declare a photo frame — the slot has no surrounding chrome",
    );

    // ── Contact row: icons from the new `atrium` theme, optically aligned ─────
    const icons = atriumTemplate.filter(
        (element) => element.category === "image" && element.photoSlot !== "glyph",
    );
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

    // ── Decorative language: line primitives only, with no framing shapes.
    // Section dividers pair a short sage lead-in with a pale column-wide rule.
    const lines = atriumTemplate.filter((element) => element.category === "line");
    const rules = lines.filter((element) => element.backgroundColor !== PAPER);
    assert.ok(rules.length > 0);
    assert.ok(rules.every((element) => Math.min(element.width, element.height) <= 1.2));

    // Each heading has exactly one accent lead-in and one quiet continuation.
    const sectionRules = rules.filter((element) => element.flowRole === "section-chrome");
    assert.equal(sectionRules.length, 10);
    const accentLeads = sectionRules.filter((element) => element.backgroundColor === ACCENT);
    const quietDividers = sectionRules.filter((element) => element.backgroundColor === RULE);
    assert.equal(accentLeads.length, 5);
    assert.equal(quietDividers.length, 5);
    assert.ok(accentLeads.every((element) => element.left === L && element.width === 18));
    assert.ok(quietDividers.every((element) => element.left === L + 26));
    assert.ok(quietDividers.every((element) => element.left + element.width === L + W));

    // The masthead closes with a centered three-part hairline, not a crosshair.
    const mastheadRules = rules.filter((element) => element.flowRole === "masthead");
    assert.equal(mastheadRules.length, 3);
    assert.equal(mastheadRules.filter((element) => element.backgroundColor === ACCENT).length, 1);
    assert.equal(mastheadRules.filter((element) => element.backgroundColor === RULE).length, 2);
    assert.ok(mastheadRules.every((element) => element.height === 1));

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
