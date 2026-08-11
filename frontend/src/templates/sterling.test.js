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
    assert.ok(sidebarRail, "the sidebar rail is wider than Manifest's 180pt");
    const divider = sterlingTemplate.find(
        (element) => element.fixedToPage && element.left === SIDEBAR_W && element.backgroundColor === RULE
            && element.height === 842,
    );
    assert.ok(divider, "a thin rule-colored divider separates the sidebar from the main column");
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
    assert.ok(sidebarKickers.length >= 4, "summary + education + skills + languages, at minimum");
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
    assert.ok(languagesBody.bulletList);
    assert.equal(languagesBody.flowLane, "sidebar");

    // Education is the one structured exception in the sidebar: separate
    // degree / school / period elements (matching single-column records),
    // not one mashed textarea.
    const eduDegree = sterlingTemplate.find((element) => element.content === "Magister Zarządzania");
    const eduSchool = sterlingTemplate.find((element) => element.content === "SGH Warszawa");
    assert.ok(eduDegree?.bold);
    assert.ok(eduSchool);
    assert.equal(eduDegree.flowLane, "sidebar");
    assert.equal(eduDegree.flowGroup, eduSchool.flowGroup);

    // ── Main column: exactly one section (Experience) — every other section
    // type lives in the sidebar by design. ────────────────────────────────────
    const headingLabels = sterlingTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "text",
    );
    assert.equal(headingLabels.length, 1);
    assert.equal(headingLabels[0].content, "DOŚWIADCZENIE ZAWODOWE");
    assert.equal(headingLabels[0].left, MAIN_L);

    const sectionRules = sterlingTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "line"
            && element.width === MAIN_W && element.backgroundColor === RULE,
    );
    assert.equal(sectionRules.length, 1, "the section rule reuses the same harmonious rule color");

    // ── Records: stacked title → org → period → bullets, every line its own
    // element (no same-row ordinal badge — see the generator's module
    // docstring for why that pattern is unsafe under this app's packer). ─────
    const jobTitle = sterlingTemplate.find((element) => element.content === "Dyrektor Strategii");
    assert.ok(jobTitle);
    assert.equal(jobTitle.category, "textarea");
    assert.ok(jobTitle.bold);
    const jobOrg = sterlingTemplate.find((element) => element.content === "Northbridge Partners   ·   2021 – obecnie");
    assert.ok(jobOrg, "company and period share one meta line below the title");
    assert.ok(jobOrg.top > jobTitle.top);
    assert.equal(jobOrg.left, jobTitle.left);
});
