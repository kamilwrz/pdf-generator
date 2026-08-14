import assert from "node:assert/strict";
import test from "node:test";

import { blueprintTemplate } from "./blueprint.js";

const PAPER = "#F2F2F3";
const INK = "#1D1F20";
const ACCENT_DEEP = "#416180";
const ACCENT_PALE = "#B5D9FD";
const L = 76;
const W = 443;

test("Blueprint is a framed, left-aligned technical single column with packer-safe body content", () => {
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
    // an outline rectangle plus 8 corner-mark hairlines (2 per corner). Every
    // masthead element is exempt from the structural packer (flowRole
    // "masthead" is skipped from section membership in sectionStructure.js),
    // which is what makes this multi-element geometry safe to co-locate. ─────
    const masthead = blueprintTemplate.filter((element) => element.flowRole === "masthead");
    assert.ok(masthead.length > 0);
    assert.ok(masthead.every((element) => (element.page ?? 1) === 1));

    const name = masthead.find((element) => element.content === "Bartosz Wojciechowski");
    assert.ok(name);
    assert.equal(name.category, "textarea");
    assert.equal(name.align, "left");
    assert.equal(name.color, INK);
    assert.equal(name.fontFamily, "Inter");
    assert.ok(name.bold);

    const title = masthead.find((element) => element.content === "ANALITYK SOC");
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
    assert.ok(sectionRules.every((element) => element.height === 1));

    // ── Records: reuse the shared stacked title → meta → bullets layout (the
    // same shape Atrium/Portico use). A same-row right-aligned date was
    // tried and reverted — see the generator's module docstring — because
    // `sectionStructure.js` always re-stacks section body content by reading
    // order and has no concept of two elements sharing one visual row. ───────
    const jobTitle = blueprintTemplate.find((element) => element.content === "Analityk SOC");
    assert.ok(jobTitle);
    assert.equal(jobTitle.category, "textarea");
    assert.ok(jobTitle.bold);
    const jobMeta = blueprintTemplate.find(
        (element) => typeof element.content === "string"
            && element.content.includes("GridWorks Automatyka")
            && element.content.includes("2023"),
    );
    assert.ok(jobMeta, "company and period share one meta line below the title");
    assert.ok(jobMeta.top > jobTitle.top, "meta sits on its own row under the title");
    assert.equal(jobMeta.left, jobTitle.left);

    // ── Skills: one inline mid-dot text block (the shared `_place_skills_section`
    // shape) — not individually positioned tag elements. ─────────────────────
    const skillsBody = blueprintTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("Tcpdump"),
    );
    assert.ok(skillsBody);
    assert.equal(skillsBody.category, "textarea");
    assert.ok(skillsBody.content.includes("  ·  "), "flat skills render as one mid-dot line");
    assert.equal(
        blueprintTemplate.some((element) => element.category === "rectangle" && !element.flowRole),
        false,
        "no free-floating tag/badge rectangles outside the masthead frame",
    );

    // ── Languages: 4-column textarea grid ("Name — Level" cells with italic
    // accent CEFR runs), not one bulleted block or badge rectangles. ──────────
    const languageCells = blueprintTemplate.filter(
        (element) => element.category === "textarea"
            && element.flowRole === "grid-member"
            && typeof element.content === "string"
            && element.content.includes(" — "),
    );
    assert.ok(languageCells.length >= 3, "expected a languages grid cell per language");
    assert.ok(languageCells.every((cell) => !cell.bulletList));
    assert.ok(languageCells.some((cell) => cell.content.includes("angielski — B2")));
    assert.ok(
        languageCells.some(
            (cell) => Array.isArray(cell.runs) && cell.runs.some((run) => run.italic && run.color),
        ),
        "CEFR level span should use italic accent runs",
    );

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
