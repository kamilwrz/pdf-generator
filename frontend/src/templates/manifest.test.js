import assert from "node:assert/strict";
import test from "node:test";

import { manifestTemplate } from "./manifest.js";

const PAPER = "#F3F2F2";
const INK = "#201E1D";
const ACCENT = "#EC3013";
const ACCENT_DEEP = "#AE1800";
const SIDEBAR_BG = "#F8F4F4";
const SIDEBAR_W = 180;
const MAIN_L = 212;
const MAIN_W = 341;

test("Manifest is a two-column sidebar layout with a dark header band and packer-safe body content", () => {
    // ── Page surface + sidebar rail + divider, all fixedToPage decorations ───
    const paper = manifestTemplate.find(
        (element) => element.fixedToPage && element.width === 595 && element.height === 842
            && element.backgroundColor === PAPER,
    );
    assert.ok(paper);
    const sidebarRail = manifestTemplate.find(
        (element) => element.fixedToPage && element.left === 0 && element.width === SIDEBAR_W
            && element.backgroundColor === SIDEBAR_BG,
    );
    assert.ok(sidebarRail);
    const divider = manifestTemplate.find(
        (element) => element.fixedToPage && element.left === SIDEBAR_W && element.backgroundColor === INK
            && element.height === 842,
    );
    assert.ok(divider, "a solid ink divider separates the sidebar from the main column");
    assert.equal(manifestTemplate.some((element) => element.category === "image"), false);

    // ── Header band: inverted (ink bg, paper/accent text), masthead-exempt ───
    const masthead = manifestTemplate.filter((element) => element.flowRole === "masthead");
    assert.ok(masthead.length > 0);
    assert.ok(masthead.every((element) => (element.page ?? 1) === 1));

    const band = masthead.find((element) => element.category === "line" && element.left === 0 && element.width === 595);
    assert.ok(band, "the header band background exists");
    assert.equal(band.backgroundColor, INK);
    // Paint order matters: PDF export paints in ARRAY order, not by zIndex —
    // the band must be the first masthead element or it paints over the name.
    assert.equal(masthead[0], band, "the band background is painted before the text drawn on top of it");

    const name = masthead.find((element) => element.content === "Anna Kowalska");
    assert.ok(name);
    assert.equal(name.category, "textarea");
    assert.equal(name.color, PAPER, "name text is paper-colored against the ink band");
    assert.ok(name.bold);

    const eyebrow = masthead.find((element) => element.content === "CURRICULUM VITAE");
    assert.ok(eyebrow);
    assert.equal(eyebrow.color, ACCENT);

    // ── Sidebar (page 1 only): kicker labels are explicitly excluded from the
    // untagged "heading + wide rule below" heuristic in sectionStructure.js —
    // see the generator's module docstring for why a false match here would
    // be more dangerous than an ordinary phantom section. ────────────────────
    const sidebarKickers = manifestTemplate.filter(
        (element) => element.flowRole === "sidebar-chrome" && element.category === "text" && element.left === 42
            && element.bold === true,
    );
    assert.ok(sidebarKickers.length >= 2, "at least summary + one fitted sidebar section");
    assert.ok(sidebarKickers.every((element) => (element.page ?? 1) === 1));
    assert.ok(sidebarKickers.every((element) => element.flowLane === "sidebar"));

    const summaryBody = manifestTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("Liderka strategii"),
    );
    assert.ok(summaryBody);
    assert.equal(summaryBody.left, 42);
    assert.equal(summaryBody.flowRole, "content");
    assert.equal(summaryBody.flowLane, "sidebar");

    const languagesBody = manifestTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("Polski"),
    );
    assert.ok(languagesBody, "languages render as a plain bulleted sidebar line, not a segmented bar");
    assert.ok(languagesBody.bulletList);
    assert.ok(languagesBody.content.includes("Polski — ojczysty"));

    // ── Main column: left-anchored heading + full-width ink rule (the same
    // safe shape every single-column template uses), numbered records with
    // the ordinal folded into the title text (not a same-row side badge). ───
    const headingLabels = manifestTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "text",
    );
    assert.ok(headingLabels.length >= 1);
    assert.ok(headingLabels.every((element) => element.left === MAIN_L));
    assert.ok(headingLabels.every((element) => element.color === INK));

    const sectionRules = manifestTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "line"
            && element.width === MAIN_W && element.backgroundColor === INK,
    );
    assert.ok(sectionRules.length >= 1);

    const recordTitle = manifestTemplate.find((element) => element.content === "01 · Dyrektorka Strategii");
    assert.ok(recordTitle, "the ordinal is folded into the title text, not a separate same-row element");
    assert.equal(recordTitle.category, "textarea");
    const recordOrg = manifestTemplate.find((element) => element.content === "Northbridge Partners");
    assert.ok(recordOrg);
    assert.equal(recordOrg.color, ACCENT_DEEP);
    assert.ok(recordOrg.top > recordTitle.top, "org sits on its own row under the title");
    const recordPeriod = manifestTemplate.find((element) => element.content === "2021 – OBECNIE");
    assert.ok(recordPeriod, "period is uppercased and on its own row");
    assert.ok(recordPeriod.top > recordOrg.top);

    // ── Skills: one inline mid-dot text block, not individual bordered chips
    // (the source design's `.skill-chip` elements) — matches Blueprint's
    // reverted-tag-tray lesson: same-row multi-element chips are unsafe. ─────
    const skillsBody = manifestTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("Strategia"),
    );
    assert.ok(skillsBody);
    assert.ok(skillsBody.content.includes("  ·  "));
    assert.equal(
        manifestTemplate.filter((element) => element.category === "rectangle").length,
        0,
        "no bordered chip/badge rectangles anywhere in the document",
    );
});
