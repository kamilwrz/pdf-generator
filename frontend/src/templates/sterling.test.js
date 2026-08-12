import assert from "node:assert/strict";
import test from "node:test";

import { sterlingTemplate } from "./sterling.js";

const PAPER = "#F7F8FA";
const INK = "#26313F";
const ACCENT = "#4A6FA5";
const ACCENT_DEEP = "#33517A";
const RULE = "#C7CFDA";
const SIDEBAR_BG = "#EDF1F6";
const SIDEBAR_W = 210;
const MAIN_L = 245;
const MAIN_W = 300;

test("Sterling is a wide-sidebar, letterhead-masthead layout with structured sidebar education", () => {
    // ── Page surface + wide sidebar rail + thin divider, all fixedToPage ─────
    const paper = sterlingTemplate.find(
        (element) => element.fixedToPage && element.width === 595 && element.height === 842
            && element.backgroundColor === PAPER,
    );
    assert.ok(paper);
    const sidebarRail = sterlingTemplate.find(
        (element) => element.fixedToPage && element.left === 0 && element.width === SIDEBAR_W
            && element.backgroundColor === SIDEBAR_BG,
    );
    assert.ok(sidebarRail, "the sidebar rail uses the wide 210pt column");

    // ── Letterhead band: a full-width tinted rectangle behind the centered
    // masthead. It reuses the rail tint so the top band and the left rail read
    // as one continuous field, and — crucially — the sidebar divider and the
    // rail fill both begin at the band's bottom edge instead of at y = 0. A
    // full-height divider would otherwise run straight up through the centered
    // name/title/contact (which span the page center, crossing x = SIDEBAR_W).
    const letterheadBand = sterlingTemplate.find(
        (element) => element.fixedToPage && element.left === 0 && element.top === 0
            && element.width === 595 && element.backgroundColor === SIDEBAR_BG,
    );
    assert.ok(letterheadBand, "a full-width tinted band sits behind the centered masthead");
    const bandBottom = letterheadBand.top + letterheadBand.height;
    assert.equal(sidebarRail.top, bandBottom, "the rail fill starts at the band's bottom edge");

    const divider = sterlingTemplate.find(
        (element) => element.fixedToPage && element.left === SIDEBAR_W && element.backgroundColor === RULE,
    );
    assert.ok(divider, "a thin rule-colored divider separates the sidebar from the main column");
    assert.equal(divider.top, bandBottom, "the divider starts below the letterhead band, not at y = 0");
    assert.equal(
        divider.top + divider.height, 842,
        "the divider still reaches the bottom of the page",
    );
    assert.equal(sterlingTemplate.some((element) => element.category === "image"), false);
    assert.equal(sterlingTemplate.some((element) => element.category === "rectangle"), false);

    // ── Masthead: centered "letterhead" name/title/contact, closed by a
    // horizontal rule spanning both columns — every element is flowRole
    // "masthead" (exempt from all packing), so centering it is structurally
    // free of the column-detection concerns that apply to section headings.
    const masthead = sterlingTemplate.filter((element) => element.flowRole === "masthead");
    assert.ok(masthead.length > 0);
    assert.ok(masthead.every((element) => (element.page ?? 1) === 1));

    const name = masthead.find((element) => element.content === "Jan Kowalski");
    assert.ok(name);
    assert.equal(name.category, "textarea");
    assert.equal(name.align, "center");
    assert.equal(name.fontFamily, "CormorantGaramond");
    assert.equal(name.color, INK);

    const title = masthead.find((element) => element.content === "DYREKTOR STRATEGII I ROZWOJU");
    assert.ok(title);
    assert.equal(title.align, "center");
    assert.equal(title.color, ACCENT);

    const mastheadRule = masthead.find((element) => element.category === "line");
    assert.ok(mastheadRule, "a horizontal rule separates the masthead from the two-column body");
    assert.equal(mastheadRule.backgroundColor, RULE);

    // ── Sidebar (page 1 only): kickers are dedicated sidebar chrome — never
    // enter `listDocumentSections` (the main packer), but density knobs still
    // retarget the rail via `packSidebarLane`. ───────────────────────────────
    const sidebarKickers = sterlingTemplate.filter(
        (element) => element.flowRole === "sidebar-chrome" && element.category === "text"
            && element.left === 34 && element.bold === true,
    );
    // Education may be routed to the main column by the two-column planner, so
    // the rail is guaranteed only Summary + Skills + Languages here.
    assert.ok(sidebarKickers.length >= 3, "summary + skills + languages, at minimum");
    assert.ok(sidebarKickers.every((element) => (element.page ?? 1) === 1));
    assert.ok(sidebarKickers.every((element) => element.flowLane === "sidebar"));

    const summaryBody = sterlingTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("Lider strategii"),
    );
    assert.ok(summaryBody);
    assert.equal(summaryBody.left, 34);
    assert.equal(summaryBody.flowLane, "sidebar");

    const skillsBody = sterlingTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("Strategia")
            && element.bulletList,
    );
    assert.ok(skillsBody, "skills render inside the sidebar as a bulleted list, not the main column");
    assert.equal(skillsBody.flowLane, "sidebar");

    const languagesBody = sterlingTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("Polski"),
    );
    assert.ok(languagesBody);
    assert.equal(languagesBody.bulletList, false);
    assert.ok(languagesBody.content.includes("Polski - ojczysty"));
    assert.equal(languagesBody.flowLane, "sidebar");

    // Education renders as structured degree / school / period elements
    // (matching single-column records), not one mashed textarea, and shares a
    // flowGroup — whichever column the two-column planner routes it to.
    const eduDegree = sterlingTemplate.find((element) => element.content === "Magister Zarządzania");
    const eduSchool = sterlingTemplate.find((element) => element.content === "SGH Warszawa");
    assert.ok(eduDegree?.bold);
    assert.ok(eduSchool);
    assert.equal(eduDegree.flowGroup, eduSchool.flowGroup);

    // ── Main column: Experience is always here; the two-column planner may also
    // route Education (and other sections) here to balance the columns against
    // the page-1-only sidebar. Every main-column heading is left-anchored at
    // MAIN_L and carries a matching rule in the shared harmonious colour. ─────
    const headingLabels = sterlingTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "text",
    );
    assert.ok(headingLabels.some((element) => element.content === "DOŚWIADCZENIE ZAWODOWE"));
    assert.ok(headingLabels.every((element) => element.left === MAIN_L));

    const sectionRules = sterlingTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "line"
            && element.width === MAIN_W && element.backgroundColor === RULE,
    );
    assert.equal(
        sectionRules.length, headingLabels.length,
        "each main-column heading has a matching rule in the shared harmonious colour",
    );

    // ── Records: stacked title → org → period → bullets, every line its own
    // element (no same-row ordinal badge — see the generator's module
    // docstring for why that pattern is unsafe under this app's packer). ─────
    const jobTitle = sterlingTemplate.find((element) => element.content === "Dyrektor Strategii");
    assert.ok(jobTitle);
    assert.equal(jobTitle.category, "textarea");
    assert.ok(jobTitle.bold);
    const jobOrg = sterlingTemplate.find(
        (element) => typeof element.content === "string"
            && element.content.includes("Northbridge Partners")
            && element.content.includes("2021"),
    );
    assert.ok(jobOrg, "company and period share one meta line below the title");
    assert.ok(jobOrg.top > jobTitle.top);
    assert.equal(jobOrg.left, jobTitle.left);
});
