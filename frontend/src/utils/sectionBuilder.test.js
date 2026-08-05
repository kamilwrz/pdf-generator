import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import { listDocumentSections, sectionElementIds } from "./sectionStructure.js";

// Deterministic ids so assertions are stable.
function makeIdFactory() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

const style = {
  left: 76,
  recordWidth: 466,
  heading: { fontSize: 8.7, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.5, bold: false },
  rule: { width: 466, height: 1, backgroundColor: "#cccccc" },
  marker: { category: "rectangle", width: 8, height: 8, backgroundColor: "#733B43", relLeft: -25, relTop: 1 },
  body: { fontSize: 9.3, fontFamily: "Inter", lineHeight: 13, color: "#222222" },
  mutedColor: "#756F6B",
};

describe("buildSectionElements", () => {
  it("aa: heading (chrome) + rule (chrome) + one content textarea", () => {
    const { elements, headingId, firstBodyId } = buildSectionElements({
      name: "Profil", layout: SECTION_LAYOUTS.TEXTAREA, style, idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.element_id === headingId);
    assert.equal(heading.category, "text");
    assert.equal(heading.flowRole, "section-chrome");
    assert.equal(heading.content, "Profil");
    assert.equal(heading.color, "#733B43");

    const chrome = elements.filter((element) => element.flowRole === "section-chrome");
    assert.ok(chrome.some((element) => element.category === "line"));      // rule
    assert.ok(chrome.some((element) => element.category === "rectangle")); // marker

    const body = elements.filter((element) => element.flowRole === "content");
    assert.equal(body.length, 1);
    assert.equal(body[0].element_id, firstBodyId);
    assert.equal(body[0].category, "textarea");
    assert.equal(body[0].autoHeight, true);
    assert.equal(body[0].width, 466);
  });

  it("cc: one record of four content blocks sharing a flowGroup", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Kursy", layout: SECTION_LAYOUTS.RECORD, style, idFactory: makeIdFactory(),
    });
    const body = elements.filter((element) => element.flowRole === "content");
    assert.equal(body.length, 4);
    const groups = new Set(body.map((element) => element.flowGroup));
    assert.equal(groups.size, 1); // all four share one group
    assert.equal([...groups][0].startsWith(`section-${headingId}`), true);
    assert.equal(body[0].bold, true);                 // title line
    assert.equal(body[2].color, "#756F6B");           // meta uses muted color
    assert.equal(body[3].bulletList, true);           // description is a bullet list
  });

  it("round-trips: built section is detectable and its body is collected", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Umiejętności", layout: SECTION_LAYOUTS.RECORD, style, idFactory: makeIdFactory(),
    });
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["Umiejętności"]);
    const ids = sectionElementIds(elements, headingId);
    // heading + rule + marker + 4 body blocks all belong to the section.
    assert.equal(ids.size, elements.length);
  });

  it("defaults the heading label when the name is blank", () => {
    const { elements, headingId } = buildSectionElements({
      name: "   ", layout: SECTION_LAYOUTS.TEXTAREA, style, idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.element_id === headingId);
    assert.equal(heading.content, "Nowa sekcja");
  });
});
