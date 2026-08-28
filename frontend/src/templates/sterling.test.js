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
    // masthead (page-1 only). Rail + divider are full page height so live
    // continuation clones copy a single vertical strip — never this top bar.
    // The band sits at a higher zIndex so it covers the divider through the
    // centered name/title/contact (which span across x = SIDEBAR_W).
    const letterheadBand = sterlingTemplate.find(
        (element) => element.fixedToPage && element.left === 0 && element.top === 0
            && element.width === 595 && element.backgroundColor === SIDEBAR_BG,
    );
    assert.ok(letterheadBand, "a full-width tinted band sits behind the centered masthead");
    assert.equal(letterheadBand.repeatOnContinuation, false);
    assert.equal(sidebarRail.top, 0);
    assert.equal(sidebarRail.height, 842);

    const divider = sterlingTemplate.find(
        (element) => element.fixedToPage && element.left === SIDEBAR_W && element.backgroundColor === RULE,
    );
    assert.ok(divider, "a thin rule-colored divider separates the sidebar from the main column");
    assert.equal(divider.top, 0);
    assert.equal(divider.height, 842);
    assert.ok(
        (letterheadBand.zIndex || 0) > (divider.zIndex || 0),
        "letterhead band covers the full-height divider through the masthead",
    );
    assert.equal(sterlingTemplate.some((element) => element.category === "rectangle"), false);

    // ── Masthead: centered "letterhead" name/title/icon-contact row, closed by
    // a horizontal rule spanning both columns — every element is flowRole
    // "masthead" (exempt from all packing), so centering it is structurally
    // free of the column-detection concerns that apply to section headings.
    const masthead = sterlingTemplate.filter((element) => element.flowRole === "masthead");
    assert.ok(masthead.length > 0);
    assert.ok(masthead.every((element) => (element.page ?? 1) === 1));

    const name = masthead.find((element) => element.content === "Julia Bernat");
    assert.ok(name);
    assert.equal(name.category, "textarea");
    assert.equal(name.align, "center");
    assert.equal(name.fontFamily, "CormorantGaramond");
    assert.equal(name.color, INK);

    const title = masthead.find((element) => element.content === "Analityczka AML i Compliance");
    assert.ok(title);
    assert.equal(title.align, "center");
    assert.equal(title.color, ACCENT);
    assert.equal(title.textTransform, "uppercase");

    const mastheadRule = masthead.find((element) => element.category === "line");
    assert.ok(mastheadRule, "a horizontal rule separates the masthead from the two-column body");
    assert.equal(mastheadRule.backgroundColor, RULE);

    // ── Contact row: icon + label pairs (Cardinal/Nova pattern), not one
    // mid-dot-joined textarea, so each channel wraps and edits independently.
    const contactIcons = masthead.filter(
        (element) => element.category === "image" && element.contactBandId === "sterling-contact",
    );
    const contactLabels = masthead.filter(
        (element) => element.category === "text" && element.contactBandId === "sterling-contact",
    );
    assert.ok(contactIcons.length > 0, "contact channels render as icon glyphs");
    assert.equal(contactIcons.length, contactLabels.length, "every contact icon has a matching label");
    assert.ok(
        contactIcons.every((element) => element.src.includes("/template-assets/iconic/sterling/")),
        "contact icons use the sterling icon theme",
    );
    const phoneLabel = contactLabels.find((element) => element.contactChannel === "phone");
    assert.ok(phoneLabel);
    assert.equal(phoneLabel.color, "#6B7684");

    const contactAnchor = sterlingTemplate.find(
        (element) => element.flowRole === "masthead-anchor" && element.contactBandId === "sterling-contact",
    );
    assert.ok(contactAnchor, "the contact band anchor carries the client reflow descriptor");
    assert.equal(contactAnchor.contactBand.mode, "centered");

    // ── Bug regression: the tinted letterhead band must stay exactly as tall
    // as its own closing divider rule's `top` — see `syncLetterheadBandHeight`
    // (frontend/src/utils/structureOperation.js) for why this must hold after
    // every masthead edit, not just at generation time.
    assert.equal(letterheadBand.height, mastheadRule.top);

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

    const sidebarRules = sterlingTemplate.filter(
        (element) => element.flowRole === "sidebar-chrome" && element.category === "line",
    );
    assert.ok(sidebarRules.length >= 3);
    assert.ok(
        sidebarRules.every((element) => element.height === 1),
        "every sidebar section tick uses the same one-point hairline",
    );

    const summaryBody = sterlingTemplate.find(
        (element) => typeof element.content === "string"
            && element.content.includes("Analityczka AML łącząca wiedzę regulacyjną"),
    );
    assert.ok(summaryBody);
    assert.equal(summaryBody.left, 34);
    assert.equal(summaryBody.flowLane, "sidebar");

    const skillsBody = sterlingTemplate.find(
        (element) => typeof element.content === "string" && element.content.includes("AML/KYC")
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
    const eduDegree = sterlingTemplate.find(
        (element) => element.content === "Licencjat Prawa",
    );
    const eduSchool = sterlingTemplate.find((element) => element.content === "UW Warszawa");
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
    const jobTitle = sterlingTemplate.find((element) => element.content === "Analityczka AML");
    assert.ok(jobTitle);
    assert.equal(jobTitle.category, "textarea");
    assert.ok(jobTitle.bold);
    const jobOrg = sterlingTemplate.find(
        (element) => typeof element.content === "string"
            && element.content.includes("Crestmont Advisory")
            && element.content.includes("2022"),
    );
    assert.ok(jobOrg, "company and period share one meta line below the title");
    assert.ok(jobOrg.top > jobTitle.top);
    assert.equal(jobOrg.left, jobTitle.left);
});
