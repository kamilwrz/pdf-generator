import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNameCaseToggle,
  applyTitleToggle,
  resizeContentSizedTitleDecorations,
} from "./mastheadIdentityOps.js";

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

test("title restoration recovers contacts that compact above the title boundary", () => {
  const source = doc();
  source.find((element) => element.element_id === "chip").top = 98;
  const hidden = applyTitleToggle(source, "masthead-main", () => "hidden").elements;
  assert.equal(hidden.find((element) => element.element_id === "chip").top, 74);
  const restored = applyTitleToggle(JSON.parse(JSON.stringify(hidden)), "masthead-main", () => "restored").elements;
  assert.equal(restored.find((element) => element.element_id === "chip").top, 98);
  assert.equal(restored.find((element) => element.element_id === "name").top, 44);
});

test("legacy hidden documents restore their entire coupled contact band", () => {
  const source = doc();
  source.find((element) => element.element_id === "chip").top = 98;
  const hidden = applyTitleToggle(source, "masthead-main", () => "hidden").elements;
  delete hidden.find((element) => element.mastheadIdentity).mastheadIdentity.title.shiftedElementIds;
  const restored = applyTitleToggle(hidden, "masthead-main", () => "restored").elements;
  assert.equal(restored.find((element) => element.element_id === "chip").top, 98);
});

test("an empty starter title retains its guidance and CV data binding", () => {
  const source = doc();
  const title = source.find((element) => element.mastheadRole === "title");
  Object.assign(title, { content: "", placeholder: "Tytuł zawodowy", starterPlaceholder: true,
    cvDataBindings: [{ path: ["title"], placeholder: "Tytuł zawodowy" }] });
  const hidden = applyTitleToggle(source, "masthead-main", () => "hidden").elements;
  const restored = applyTitleToggle(hidden, "masthead-main", () => "restored").elements;
  const restoredTitle = restored.find((element) => element.mastheadRole === "title");
  assert.equal(restoredTitle.placeholder, title.placeholder);
  assert.equal(restoredTitle.starterPlaceholder, true);
  assert.deepEqual(restoredTitle.cvDataBindings, title.cvDataBindings);
  assert.notEqual(restoredTitle.cvDataBindings[0].path, title.cvDataBindings[0].path);
});

test("title show creates an editable placeholder when the profile title was empty", () => {
  const source = doc().filter((element) => (
    element.mastheadRole !== "title" && element.mastheadRole !== "title-decoration"
  ));
  const anchor = source.find((element) => element.element_id === "mid");
  anchor.mastheadIdentity.title = {
    present: false,
    blockPt: 24,
    spec: {
      category: "textarea",
      content: "",
      left: 44,
      top: 80,
      width: 300,
      height: 14,
      fontSizePt: 11,
      lineHeight: 14,
      fontFamily: "Inter",
      colorHex: "#17A2B8",
      align: "left",
      autoHeight: true,
      appearanceTypographyRole: "job",
      appearanceBaseFontSize: 11,
      appearanceBaseLineHeight: 14,
      appearanceBaseHeight: 14,
      italic: true,
      underline: true,
      zIndex: 9,
      preserveInitialLayout: true,
    },
    decorations: [],
  };

  const { elements } = applyTitleToggle(source, "masthead-main", () => "new-title");
  const title = elements.find((element) => element.mastheadRole === "title");

  assert.ok(title, "empty title is reconstructed as an editable element");
  assert.equal(title.content, "");
  assert.equal(title.placeholder, "Wpisz stanowisko…");
  assert.equal(title.category, "textarea");
  assert.equal(title.width, 300);
  assert.equal(title.appearanceTypographyRole, "job");
  assert.equal(title.appearanceBaseFontSize, 11);
  assert.equal(title.appearanceBaseLineHeight, 14);
  assert.equal(title.appearanceBaseHeight, 14);
  assert.equal(title.italic, true, "template-authored title emphasis survives reconstruction");
  assert.equal(title.underline, true);
  assert.equal(title.zIndex, 9);
  assert.equal(title.preserveInitialLayout, true);
  assert.equal(elements.filter((element) => element.mastheadRole === "title").length, 1);
});

test("an empty added title keeps the typed value through hide and show", () => {
  const source = doc().filter((element) => (
    element.mastheadRole !== "title" && element.mastheadRole !== "title-decoration"
  ));
  const anchor = source.find((element) => element.element_id === "mid");
  anchor.mastheadIdentity.title = {
    present: false,
    blockPt: 24,
    spec: {
      category: "textarea",
      content: "",
      left: 44,
      top: 80,
      width: 300,
      height: 14,
      fontSizePt: 11,
      lineHeight: 14,
      fontFamily: "Inter",
      colorHex: "#17A2B8",
      align: "left",
      autoHeight: true,
      italic: true,
      zIndex: 7,
      preserveInitialLayout: true,
    },
    decorations: [],
  };

  const added = applyTitleToggle(source, "masthead-main", () => "added-title").elements;
  const edited = added.map((element) => element.mastheadRole === "title" ? {
    ...element,
    content: "Senior Product Designer",
    width: 318,
    height: 18,
    lineHeight: 18,
    fontSize: 13,
  } : element);
  const hidden = applyTitleToggle(edited, "masthead-main", () => "hidden").elements;
  const restored = applyTitleToggle(hidden, "masthead-main", () => "restored").elements;
  const title = restored.find((element) => element.mastheadRole === "title");

  assert.equal(title.content, "Senior Product Designer");
  assert.equal(title.width, 318);
  assert.equal(title.height, 18);
  assert.equal(title.lineHeight, 18);
  assert.equal(title.fontSize, 13);
  assert.equal(title.italic, true);
  assert.equal(title.zIndex, 7);
  assert.equal(title.preserveInitialLayout, true);
  assert.equal(title.placeholder, undefined, "filled titles do not retain empty-field chrome");
});

test("title hide captures edited content and appearance for an exact re-show", () => {
  const source = doc();
  const title = source.find((element) => element.element_id === "title");
  Object.assign(title, {
    content: "Senior Security Analyst",
    category: "textarea",
    width: 300,
    height: 17,
    lineHeight: 17,
    fontSize: 13,
    fontFamily: "Montserrat",
    color: "#557565",
    align: "center",
    autoHeight: true,
    italic: true,
    runs: [{ start: 0, end: 6, bold: true, color: "#A23B42" }],
    appearanceTypographyRole: "job",
    appearanceBaseFontSize: 11,
    appearanceBaseLineHeight: 14,
  });

  const hidden = applyTitleToggle(source, "masthead-main", () => "hidden").elements;
  const restored = applyTitleToggle(hidden, "masthead-main", () => "restored").elements;
  const restoredTitle = restored.find((element) => element.mastheadRole === "title");

  assert.equal(restoredTitle.content, "Senior Security Analyst");
  assert.equal(restoredTitle.fontSize, 13);
  assert.equal(restoredTitle.lineHeight, 17);
  assert.equal(restoredTitle.fontFamily, "Montserrat");
  assert.equal(restoredTitle.color, "#557565");
  assert.equal(restoredTitle.align, "center");
  assert.equal(restoredTitle.italic, true);
  assert.deepEqual(
    restoredTitle.runs,
    [{ start: 0, end: 6, bold: true, color: "#A23B42" }],
  );
  assert.equal(restoredTitle.appearanceTypographyRole, "job");
  assert.equal(restoredTitle.appearanceBaseFontSize, 11);
});

test("title blur keeps Linden's fixed identity band at its authored width", () => {
  const elements = doc();
  const title = elements.find((element) => element.element_id === "title");
  const bar = elements.find((element) => element.element_id === "title-bar");
  bar.width = 385;
  bar.titleDecoration = "identity-band";

  const resized = resizeContentSizedTitleDecorations(elements, title, 58);

  assert.equal(resized.find((element) => element.element_id === "title-bar").width, 385);
});

test("content-sized title bars still follow edited title text", () => {
  const elements = doc();
  const title = elements.find((element) => element.element_id === "title");

  const resized = resizeContentSizedTitleDecorations(elements, title, 180);

  assert.equal(resized.find((element) => element.element_id === "title-bar").width, 220);
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

// A centered masthead (Atrium/Tessera) stores the title as a
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
  const title = d.find((e) => e.element_id === "title");
  Object.assign(title, {
    category: "textarea", left: 76, width: 443, height: 14,
    fontSize: 10, lineHeight: 14, fontFamily: "Inter", color: "#7C6A52",
    letterSpacing: 2, align: "center", autoHeight: true,
  });
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
