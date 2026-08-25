import test from "node:test";
import assert from "node:assert/strict";
import { applyNameCaseToggle, applyTitleToggle } from "./mastheadIdentityOps.js";

// Minimal masthead: identity anchor + name + title, a contact band anchor whose
// startY is coupled to the title, one contact chip, a header rule, one section,
// and a fixedToPage footer that must never move.
function doc() {
  return [
    { element_id: "mid", category: "text", content: "", flowRole: "masthead-anchor",
      mastheadBandId: "masthead-main", top: 0, page: 1,
      mastheadIdentity: {
        id: "masthead-main", name: { defaultUppercase: true },
        title: { present: true, blockPt: 24,
          spec: { content: "AML Analyst", left: 44, top: 80, fontSizePt: 11,
                  fontFamily: "Inter", colorHex: "#17A2B8", textTransform: "none", bold: false },
          decorations: [{ category: "line", left: 44, top: 74, width: 120, height: 20,
            backgroundColor: "#17A2B8", titleDecoration: {
              minWidth: 120, maxWidth: 300, horizontalPadding: 24,
            } }] },
        contactBandId: "contact-main" } },
    { element_id: "name", category: "text", content: "Jan Kowalski", mastheadRole: "name",
      mastheadBandId: "masthead-main", textTransform: "uppercase", left: 44, top: 44, page: 1 },
    { element_id: "title", category: "text", content: "AML Analyst", mastheadRole: "title",
      mastheadBandId: "masthead-main", left: 44, top: 80, page: 1 },
    { element_id: "title-bar", category: "line", mastheadRole: "title-decoration",
      mastheadBandId: "masthead-main", left: 44, top: 74, width: 120, height: 20, page: 1,
      titleDecoration: { minWidth: 120, maxWidth: 300, horizontalPadding: 24 } },
    { element_id: "cba", category: "text", content: "", flowRole: "masthead-anchor",
      contactBandId: "contact-main", top: 0, page: 1,
      contactBand: { id: "contact-main", mode: "wrapping", anchor: { startX: 44, startY: 104, rightLimit: 551 } } },
    { element_id: "chip", category: "text", content: "+48", contactBandId: "contact-main",
      contactChannel: "phone", left: 44, top: 104, page: 1 },
    { element_id: "rule", category: "line", flowRole: "masthead", left: 44, top: 126, page: 1 },
    { element_id: "sec", category: "text", content: "SUMMARY", left: 44, top: 146, page: 1 },
    { element_id: "foot", category: "text", content: "01", fixedToPage: true, left: 535, top: 812, page: 1 },
  ];
}

test("name case toggle flips the flag reversibly and touches nothing else", () => {
  const off = applyNameCaseToggle(doc(), "masthead-main").elements;
  assert.equal(off.find((e) => e.element_id === "name").textTransform, "none");
  const on = applyNameCaseToggle(off, "masthead-main").elements;
  assert.equal(on.find((e) => e.element_id === "name").textTransform, "uppercase");
  // Positions unchanged.
  assert.equal(on.find((e) => e.element_id === "name").top, 44);
});

test("title hide removes it, shifts below up by blockPt, updates band startY, keeps footer", () => {
  const { elements } = applyTitleToggle(doc(), "masthead-main", () => "id");
  assert.equal(elements.find((e) => e.element_id === "title"), undefined);
  assert.equal(elements.find((e) => e.element_id === "title-bar"), undefined);
  assert.equal(elements.find((e) => e.element_id === "chip").top, 104 - 24);
  assert.equal(elements.find((e) => e.element_id === "rule").top, 126 - 24);
  assert.equal(elements.find((e) => e.element_id === "sec").top, 146 - 24);
  assert.equal(elements.find((e) => e.element_id === "foot").top, 812); // fixedToPage untouched
  assert.equal(elements.find((e) => e.element_id === "cba").contactBand.anchor.startY, 104 - 24);
  assert.equal(elements.find((e) => e.element_id === "mid").mastheadIdentity.title.present, false);
});

test("title show reconstructs the title from spec and reverses the shift", () => {
  const hidden = applyTitleToggle(doc(), "masthead-main", () => "id").elements;
  const { elements } = applyTitleToggle(hidden, "masthead-main", () => "new");
  const title = elements.find((e) => e.mastheadRole === "title");
  assert.ok(title, "title re-added");
  assert.equal(title.content, "AML Analyst");
  assert.equal(title.top, 80);
  assert.ok(elements.some((e) => e.mastheadRole === "title-decoration"));
  assert.equal(elements.find((e) => e.element_id === "chip").top, 104);
  assert.equal(elements.find((e) => e.element_id === "cba").contactBand.anchor.startY, 104);
  assert.equal(elements.find((e) => e.element_id === "mid").mastheadIdentity.title.present, true);
});

test("title reclaim override preserves an intentional buffer and remains reversible", () => {
  const source = doc();
  source.find((e) => e.element_id === "mid").mastheadIdentity.title.reclaimPt = 14;

  const hidden = applyTitleToggle(source, "masthead-main", () => "id").elements;
  assert.equal(hidden.find((e) => e.element_id === "chip").top, 104 - 14);
  assert.equal(hidden.find((e) => e.element_id === "rule").top, 126 - 14);
  assert.equal(hidden.find((e) => e.element_id === "cba").contactBand.anchor.startY, 104 - 14);

  const shown = applyTitleToggle(hidden, "masthead-main", () => "new").elements;
  assert.equal(shown.find((e) => e.element_id === "chip").top, 104);
  assert.equal(shown.find((e) => e.element_id === "rule").top, 126);
  assert.equal(shown.find((e) => e.element_id === "cba").contactBand.anchor.startY, 104);
});

// The masthead lives on page 1; hiding/showing its title must reflow ONLY
// page 1. `top` is page-relative, so a page-2 element whose top exceeds the
// page-1 title top must not be dragged as if it sat below the masthead.
test("title toggle reflows only the title's page, never continuation pages", () => {
  const base = [
    ...doc(),
    { element_id: "p2head", category: "text", content: "EDUCATION", left: 44, top: 60, page: 2 },
    { element_id: "p2body", category: "textarea", content: "…", left: 44, top: 90, page: 2 },
  ];
  const hidden = applyTitleToggle(base, "masthead-main", () => "id").elements;
  const h = (id) => hidden.find((e) => e.element_id === id);
  // Page-1 content below the title still shifts up by blockPt.
  assert.equal(h("sec").top, 146 - 24);
  // Page-2 content is untouched (previously body @90 was crushed to 66).
  assert.equal(h("p2head").top, 60);
  assert.equal(h("p2body").top, 90);
  assert.equal(h("p2body").page, 2);
  // Re-showing reverses page 1 and still leaves page 2 alone.
  const shown = applyTitleToggle(hidden, "masthead-main", () => "new").elements;
  const s = (id) => shown.find((e) => e.element_id === id);
  assert.equal(s("sec").top, 146);
  assert.equal(s("p2body").top, 90);
});

// A centered masthead (Portico/Atrium/Tessera) stores the title as a
// width-bounded, center-aligned textarea. Hiding then re-adding it must
// reconstruct that box, not a left-anchored point-text run, or the title lands
// at the band's left edge and cannot be kept centered while editing.
function centeredDoc() {
  const d = doc();
  const anchor = d.find((e) => e.element_id === "mid");
  anchor.mastheadIdentity.title.spec = {
    category: "textarea", content: "AML Analyst", left: 76, top: 80,
    width: 443, height: 14, fontSizePt: 10, lineHeight: 14,
    fontFamily: "Inter", colorHex: "#7C6A52", letterSpacing: 2,
    align: "center", autoHeight: true, textTransform: "none", bold: false,
  };
  const name = d.find((e) => e.element_id === "name");
  name.category = "textarea"; name.left = 76; name.width = 443; name.align = "center";
  return d;
}

test("centered title re-adds as a width-bounded, center-aligned textarea", () => {
  const hidden = applyTitleToggle(centeredDoc(), "masthead-main", () => "id").elements;
  const { elements } = applyTitleToggle(hidden, "masthead-main", () => "new");
  const title = elements.find((e) => e.mastheadRole === "title");
  assert.ok(title, "title re-added");
  assert.equal(title.category, "textarea");
  assert.equal(title.width, 443);
  assert.equal(title.align, "center");
  assert.equal(title.left, 76);
  assert.equal(title.autoHeight, true);
});

// Documents saved before the title geometry was captured have a legacy spec
// (no width/align/category). Recovery must inherit the centered band from the
// sibling name element so those titles still re-add centered.
test("legacy title spec recovers centering from the name element", () => {
  const d = centeredDoc();
  // Downgrade the spec to the legacy shape, but keep the centered name element.
  d.find((e) => e.element_id === "mid").mastheadIdentity.title.spec = {
    content: "AML Analyst", left: 76, top: 80, fontSizePt: 10,
    fontFamily: "Inter", colorHex: "#7C6A52", textTransform: "none", bold: false,
  };
  const hidden = applyTitleToggle(d, "masthead-main", () => "id").elements;
  const { elements } = applyTitleToggle(hidden, "masthead-main", () => "new");
  const title = elements.find((e) => e.mastheadRole === "title");
  assert.equal(title.category, "textarea");
  assert.equal(title.width, 443);
  assert.equal(title.align, "center");
});
