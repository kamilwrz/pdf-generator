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
                  fontFamily: "Inter", colorHex: "#17A2B8", textTransform: "none", bold: false } },
        contactBandId: "contact-main" } },
    { element_id: "name", category: "text", content: "Jan Kowalski", mastheadRole: "name",
      mastheadBandId: "masthead-main", textTransform: "uppercase", left: 44, top: 44, page: 1 },
    { element_id: "title", category: "text", content: "AML Analyst", mastheadRole: "title",
      mastheadBandId: "masthead-main", left: 44, top: 80, page: 1 },
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
  assert.equal(elements.find((e) => e.element_id === "chip").top, 104);
  assert.equal(elements.find((e) => e.element_id === "cba").contactBand.anchor.startY, 104);
  assert.equal(elements.find((e) => e.element_id === "mid").mastheadIdentity.title.present, true);
});
