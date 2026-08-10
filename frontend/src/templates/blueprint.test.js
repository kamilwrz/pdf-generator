import assert from "node:assert/strict";
import test from "node:test";

import { blueprintTemplate } from "./blueprint.js";

const PAPER = "#F2F2F3";
const INK = "#1D1F20";
const ACCENT = "#5980A6";
const ACCENT_DEEP = "#416180";
const ACCENT_PALE = "#B5D9FD";
const BADGE_BG = "#EEF6FF";
const L = 76;
const W = 443;

test("Blueprint is a framed, left-aligned technical single column, not a recolor of another template", () => {
    // ── Single column: the only full-height element is the paper surface ─────
    const tall = blueprintTemplate.filter((element) => (element.height ?? 0) >= 300);
    assert.equal(tall.length, 1);
    assert.equal(tall[0].backgroundColor, PAPER);
    for (const category of ["circle", "ellipse", "path"]) {
        assert.equal(
            blueprintTemplate.some((element) => element.category === category),
            false,
            `Blueprint must not use ${category} primitives`,
        );
    }
    // No contact/section icons — the source design uses plain text only.
    assert.equal(blueprintTemplate.some((element) => element.category === "image"), false);

    // ── Masthead: name / title / contact are LEFT-aligned textareas, framed by
    // an outline rectangle plus 8 corner-mark hairlines (2 per corner) ────────
    const masthead = blueprintTemplate.filter((element) => element.flowRole === "masthead");
    assert.ok(masthead.length > 0);
    assert.ok(masthead.every((element) => (element.page ?? 1) === 1));

    const name = masthead.find((element) => element.content === "Anna Kowalska");
    assert.ok(name);
    assert.equal(name.category, "textarea");
    assert.equal(name.align, "left");
    assert.equal(name.color, INK);
    assert.equal(name.fontFamily, "Inter");
    assert.ok(name.bold);

    const title = masthead.find((element) => element.content === "DYREKTORKA STRATEGII I ROZWOJU");
    assert.ok(title, "title is uppercased (no CSS text-transform in a PDF)");
    assert.equal(title.align, "left");
    assert.equal(title.color, ACCENT_DEEP);

    const frame = masthead.find((element) => element.category === "rectangle");
    assert.ok(frame, "the masthead is wrapped in an outline frame");
    assert.equal(frame.backgroundColor, ACCENT_PALE);
    assert.equal(frame.left, L);
    assert.equal(frame.width, W);
    assert.notEqual(frame.filled, true);

    const cornerMarks = masthead.filter(
        (element) => element.category === "line" && Math.max(element.width, element.height) <= 10,
    );
    assert.equal(cornerMarks.length, 8, "four corners × 2 hairlines each");
    // Every mark centers on one of the frame's 4 corners (x is L or L+W; y is
    // the frame's top or bottom), confirming they are not stray decoration.
    const cornerXs = new Set(cornerMarks.map((element) => Math.round(element.left + element.width / 2)));
    assert.ok(cornerXs.has(L) && cornerXs.has(L + W));

    // ── Section identity: bold accent label + full-column hairline rule,
    // anchored at the column left L (not centered) so the shared packer and
    // Add-section keep every heading glued to its body. ──────────────────────
    const headingLabels = blueprintTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "text",
    );
    assert.equal(headingLabels.length, 5); // summary/experience/education/skills/languages
    assert.ok(headingLabels.every((element) => element.color === ACCENT_DEEP));
    assert.ok(headingLabels.every((element) => element.bold === true));
    assert.ok(headingLabels.every((element) => element.left === L));

    const sectionRules = blueprintTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "line"
            && element.width === W && element.backgroundColor === ACCENT_PALE,
    );
    assert.equal(sectionRules.length, 5);
    assert.ok(sectionRules.every((element) => element.backgroundColor === ACCENT_PALE));
    assert.ok(sectionRules.every((element) => element.height === 1));

    // ── Records: title textarea + a plain `text` date on the SAME row,
    // right-aligned to the column's right edge (the design's `.role` pattern,
    // distinct from every other template's stacked title/meta layout). ───────
    const jobTitle = blueprintTemplate.find((element) => element.content === "Dyrektorka Strategii");
    assert.ok(jobTitle);
    assert.equal(jobTitle.category, "textarea");
    assert.ok(jobTitle.bold);
    const jobDate = blueprintTemplate.find((element) => element.content === "2021 – obecnie");
    assert.ok(jobDate);
    assert.equal(jobDate.category, "text");
    assert.equal(jobDate.top, jobTitle.top, "date sits on the same row as the title");
    assert.ok(jobDate.left > jobTitle.left + jobTitle.width, "date sits to the right of the (narrowed) title column");
    assert.equal(jobDate.color, "#5D5D60");

    // Company (subtitle) reads in the deep accent, matching the source design's
    // `.company` treatment — distinct from the muted date.
    const company = blueprintTemplate.find((element) => element.content === "Northbridge Partners");
    assert.ok(company);
    assert.equal(company.color, ACCENT_DEEP);

    // ── Skills: square OUTLINE tags (not filled, not grouped by category) ────
    const skillTag = blueprintTemplate.find((element) => element.content === "Strategia");
    assert.ok(skillTag);
    assert.equal(skillTag.category, "text");
    assert.equal(skillTag.color, ACCENT);
    const skillTagBox = blueprintTemplate.find(
        (element) => element.category === "rectangle"
            && Math.abs(element.top - skillTag.top) < 6 && element.left <= skillTag.left,
    );
    assert.ok(skillTagBox, "every skill tag sits on an outline box");
    assert.equal(skillTagBox.backgroundColor, ACCENT);
    assert.notEqual(skillTagBox.filled, true);

    // ── Languages: name + a FILLED proficiency badge, bordered rows ──────────
    const languageName = blueprintTemplate.find((element) => element.content === "Angielski");
    assert.ok(languageName);
    assert.equal(languageName.category, "text");
    assert.equal(languageName.color, INK);
    const badge = blueprintTemplate.find((element) => element.content === "C1");
    assert.ok(badge);
    const badgeBox = blueprintTemplate.find(
        (element) => element.category === "rectangle" && element.filled === true
            && Math.abs(element.top - (badge.top - 2)) < 6,
    );
    assert.ok(badgeBox, "language level renders on a filled badge, not an outline tag");
    assert.equal(badgeBox.backgroundColor, BADGE_BG);

    // Language rows are separated by quiet dividers, not the accent-pale rule
    // used for section chrome.
    const languageDividers = blueprintTemplate.filter(
        (element) => element.category === "line" && element.backgroundColor === "#E7E7EA",
    );
    assert.equal(languageDividers.length, 2); // 3 languages → 2 internal dividers

    // ── Footer: a quiet accent-pale rule + page number, no repeated frame ────
    const footerRule = blueprintTemplate.find(
        (element) => element.fixedToPage && element.category === "line" && element.backgroundColor === ACCENT_PALE,
    );
    assert.ok(footerRule);
    assert.equal(
        blueprintTemplate.filter((element) => element.category === "rectangle" && element.fixedToPage).length,
        0,
        "the frame is authored once in the masthead, never repeated as page chrome",
    );
});
