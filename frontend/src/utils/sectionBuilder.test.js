import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import {
  appendSectionAtEnd,
  deriveSectionStyle,
  listDocumentSections,
  reorderSection,
  sectionElementIds,
} from "./sectionStructure.js";
import { cardinalTemplate } from "../templates/cardinal.js";

// Deterministic ids so assertions are stable.
function makeIdFactory() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

const style = {
  left: 76,
  bodyLeft: 76,
  recordWidth: 466,
  heading: { fontSize: 8.7, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.5, bold: false },
  rule: { width: 466, height: 1, backgroundColor: "#cccccc", relLeft: 0 },
  markers: [{ category: "rectangle", width: 8, height: 8, backgroundColor: "#733B43", relLeft: -25, relTop: 1 }],
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

  it("places record body on bodyLeft when it differs from the heading column (Monument gutter)", () => {
    const monumentStyle = {
      ...style,
      left: 118,
      bodyLeft: 102,
      recordWidth: 427,
      rule: { width: 160, height: 2, backgroundColor: "#C8C8C8", relLeft: 251 },
      markers: [],
    };
    const { elements, firstBodyId } = buildSectionElements({
      name: "Kursy", layout: SECTION_LAYOUTS.RECORD_EDUCATION, style: monumentStyle, idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.content === "Kursy");
    const body = elements.find((element) => element.element_id === firstBodyId);
    const rule = elements.find((element) => element.category === "line" && element.width === 160);
    assert.equal(heading.left, 118);
    assert.equal(body.left, 102);
    assert.equal(rule.left, 118 + 251);
  });

  it("places the rule at fontSize*1.35 below the heading, matching Builder.text()'s real cursor advance", () => {
    // The backend's Builder.text() (cv_generator_primitives.py) advances the
    // cursor by `fs * 1.35` after painting a heading — confirmed against the
    // real Cinder generator output (heading.top=202, rule.top=213.745 for an
    // 8.7px heading: 213.745-202 = 11.745 = 8.7*1.35). A rule placed at plain
    // `fontSize` (8.7) instead of `fontSize*1.35` (11.745) sits ~3px too high,
    // and — because the packer preserves an "authored" chrome cluster as-is
    // when adjacent gaps are already flush/overlapping — that wrong offset
    // survives repacking, widening the rule-to-body gap on the built section
    // to ~10px instead of the configured `after_rule` (8px default).
    const { elements, headingId } = buildSectionElements({
      name: "Profil", layout: SECTION_LAYOUTS.TEXTAREA, style, idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.element_id === headingId);
    const rule = elements.find((element) => element.category === "line" && element.width === style.rule.width);
    assert.equal(rule.top - heading.top, style.heading.fontSize * 1.35);
  });

  it("places a sampled Monument accent rule at rule.relTop, not flush under the label", () => {
    // Monument paints the grey accent at badge+15 / title+7. Using only
    // fontSize*1.35 (~16.9) parks the line ~10px too low beside the frame.
    const monumentStyle = {
      ...style,
      left: 118,
      bodyLeft: 102,
      heading: { ...style.heading, fontSize: 12.5, bold: true },
      rule: {
        width: 160, height: 2, backgroundColor: "#C8C8C8", relLeft: 251, relTop: 7,
      },
      markers: [
        { category: "line", width: 32, height: 32, backgroundColor: "#111111", relLeft: -52, relTop: -8 },
        {
          category: "rectangle", width: 251, height: 32, backgroundColor: "#111111",
          relLeft: -12, relTop: -8, borderWidth: 1.2,
        },
      ],
    };
    const { elements, headingId } = buildSectionElements({
      name: "Nowa sekcja",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style: monumentStyle,
      idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.element_id === headingId);
    const rule = elements.find((element) => element.category === "line" && element.width === 160);
    const frame = elements.find((element) => element.category === "rectangle" && element.width === 251);
    assert.equal(rule.top - heading.top, 7);
    assert.equal(rule.top - frame.top, 15);
  });

  it("cc-edu: one record of four content blocks sharing a flowGroup (degree/school/meta/description)", () => {
    // Education has a distinct school line — matches the backend generator's
    // `_place_education_record` (degree, school, city·period, bullets).
    const { elements, headingId } = buildSectionElements({
      name: "Kursy", layout: SECTION_LAYOUTS.RECORD_EDUCATION, style, idFactory: makeIdFactory(),
    });
    const body = elements.filter((element) => element.flowRole === "content");
    assert.equal(body.length, 4);
    const groups = new Set(body.map((element) => element.flowGroup));
    assert.equal(groups.size, 1); // all four share one group
    assert.equal([...groups][0].startsWith(`section-${headingId}`), true);
    assert.equal(body[0].bold, true);                 // degree/title line
    assert.equal(body[1].bold, false);                // school/subtitle line
    assert.equal(body[2].color, "#756F6B");           // meta uses muted color
    assert.equal(body[3].bulletList, true);           // description is a bullet list
    // Generator-matched box height (lineHeight, not the +6 canvas heuristic)
    // plus preserveInitialLayout so mount shrink cannot loosen SPACE_STACK.
    for (const line of body) {
      assert.equal(line.height, style.body.lineHeight);
      assert.equal(line.preserveInitialLayout, true);
    }
  });

  it("cc-sub: one record of two content blocks sharing a flowGroup (category heading + body)", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Narzędzia",
      layout: SECTION_LAYOUTS.RECORD_SUBCATEGORY,
      style,
      idFactory: makeIdFactory(),
    });
    const body = elements.filter((element) => element.flowRole === "content");
    assert.equal(body.length, 2);
    const groups = new Set(body.map((element) => element.flowGroup));
    assert.equal(groups.size, 1);
    assert.equal([...groups][0].startsWith(`section-${headingId}`), true);
    assert.equal(body[0].bold, true);
    assert.equal(body[0].content, "Nazwa kategorii");
    assert.equal(body[1].bold, false);
    assert.equal(body[1].content, "Treść…");
    assert.equal(body[1].bulletList, false);
  });

  it("cc-exp: one record of three content blocks sharing a flowGroup (title/company·period/description) — no subtitle line", () => {
    // Experience has NO distinct school/company line — company and period are
    // one meta line, matching `_place_experience_record` (title, meta, bullets).
    // Conflating this with the education shape (adding a phantom 4th line) was
    // the original defect this two-layout split fixes.
    const { elements, headingId } = buildSectionElements({
      name: "Praca", layout: SECTION_LAYOUTS.RECORD_EXPERIENCE, style, idFactory: makeIdFactory(),
    });
    const body = elements.filter((element) => element.flowRole === "content");
    assert.equal(body.length, 3);
    const groups = new Set(body.map((element) => element.flowGroup));
    assert.equal(groups.size, 1);
    assert.equal([...groups][0].startsWith(`section-${headingId}`), true);
    assert.equal(body[0].bold, true);                 // title line
    assert.equal(body[1].color, "#756F6B");           // company·period uses muted color
    assert.equal(body[1].bold, false);
    assert.equal(body[2].bulletList, true);           // description is a bullet list
  });

  it("round-trips (cc-edu): built section is detectable and its body is collected", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Umiejętności", layout: SECTION_LAYOUTS.RECORD_EDUCATION, style, idFactory: makeIdFactory(),
    });
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["Umiejętności"]);
    const ids = sectionElementIds(elements, headingId);
    // heading + rule + marker + 4 body blocks all belong to the section.
    assert.equal(ids.size, elements.length);
  });

  it("round-trips (cc-exp): built section is detectable and its body is collected", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Doświadczenie", layout: SECTION_LAYOUTS.RECORD_EXPERIENCE, style, idFactory: makeIdFactory(),
    });
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["Doświadczenie"]);
    const ids = sectionElementIds(elements, headingId);
    // heading + rule + marker + 3 body blocks all belong to the section.
    assert.equal(ids.size, elements.length);
  });

  it("defaults the heading label when the name is blank", () => {
    const { elements, headingId } = buildSectionElements({
      name: "   ", layout: SECTION_LAYOUTS.TEXTAREA, style, idFactory: makeIdFactory(),
    });
    const heading = elements.find((element) => element.element_id === headingId);
    assert.equal(heading.content, "Nowa sekcja");
  });

  it("preserves a negative marker relTop instead of clamping to 0", () => {
    // deriveSectionStyle reports a negative relTop when the decorative mark
    // sits above the heading baseline; the builder must keep that offset.
    const raisedMarker = { ...style, markers: [{ ...style.markers[0], relTop: -3 }] };
    const { elements } = buildSectionElements({
      name: "Profil", layout: SECTION_LAYOUTS.TEXTAREA, style: raisedMarker, idFactory: makeIdFactory(),
    });
    const marker = elements.find((element) => element.category === "rectangle");
    assert.equal(marker.top, -3);
  });

  it("omits decorative shapes when the style has none", () => {
    const withoutMarkers = { ...style, markers: [] };
    const { elements, headingId, firstBodyId } = buildSectionElements({
      name: "Profil", layout: SECTION_LAYOUTS.TEXTAREA, style: withoutMarkers, idFactory: makeIdFactory(),
    });
    const chrome = elements.filter((element) => element.flowRole === "section-chrome");
    // Only the heading (text) and rule (line) remain as chrome; no shape marker.
    assert.equal(chrome.some((element) => element.category === "rectangle" || element.category === "circle"), false);
    assert.equal(elements.find((element) => element.element_id === headingId).category, "text");
    assert.equal(typeof headingId, "string");
    assert.equal(typeof firstBodyId, "string");
    assert.equal(elements.some((element) => element.element_id === firstBodyId), true);
  });

  it("builds every sampled decorative shape, not just one (Monument-style badge square + frame)", () => {
    const monumentStyle = {
      ...style,
      markers: [
        { category: "line", width: 32, height: 32, backgroundColor: "#111111", relLeft: -10, relTop: -8 },
        { category: "rectangle", width: 251, height: 32, backgroundColor: "#111111", relLeft: 30, relTop: -8, borderWidth: 1.2 },
      ],
    };
    const { elements } = buildSectionElements({
      name: "Języki", layout: SECTION_LAYOUTS.TEXTAREA, style: monumentStyle, idFactory: makeIdFactory(),
    });
    // Exclude the always-present rule (category "line", width 466 from the
    // shared `style` fixture) so this only counts the two sampled shapes.
    const shapes = elements.filter((element) => element.flowRole === "section-chrome"
      && (element.category === "line" || element.category === "rectangle")
      && element.width !== style.rule.width);
    assert.equal(shapes.length, 2);
    const badge = shapes.find((element) => element.category === "line");
    assert.equal(badge.width, 32);
    assert.equal(badge.height, 32);
    const frame = shapes.find((element) => element.category === "rectangle");
    assert.equal(frame.width, 251);
    assert.equal(frame.borderWidth, 1.2);
  });

  it("stamps the computed section ordinal into the badge-number style, zero-padded to match the sampled digit count", () => {
    const styleWithBadge = {
      ...style,
      badgeNumber: { fontSize: 11, fontFamily: "Montserrat", color: "#ffffff", bold: true, digits: 2, relLeft: -44, relTop: 8 },
    };
    const { elements } = buildSectionElements({
      name: "Certyfikaty", layout: SECTION_LAYOUTS.TEXTAREA, style: styleWithBadge,
      sectionOrdinal: 5, idFactory: makeIdFactory(),
    });
    const badge = elements.find((element) => element.isDecorativeChromeText === true);
    assert.ok(badge);
    assert.equal(badge.content, "05");
    assert.equal(badge.category, "text");
    assert.equal(badge.flowRole, "section-chrome");
    assert.equal(badge.color, "#ffffff");
    assert.equal(badge.bold, true);
  });

  it("does not zero-pad past the sampled digit count when the ordinal is already wider", () => {
    const styleWithBadge = {
      ...style,
      badgeNumber: { fontSize: 11, fontFamily: "Montserrat", color: "#ffffff", bold: true, digits: 1, relLeft: -20, relTop: 8 },
    };
    const { elements } = buildSectionElements({
      name: "Certyfikaty", layout: SECTION_LAYOUTS.TEXTAREA, style: styleWithBadge,
      sectionOrdinal: 12, idFactory: makeIdFactory(),
    });
    const badge = elements.find((element) => element.isDecorativeChromeText === true);
    assert.equal(badge.content, "12"); // padStart never truncates
  });

  it("omits the badge-number element when the style has none", () => {
    const { elements } = buildSectionElements({
      name: "Profil", layout: SECTION_LAYOUTS.TEXTAREA, style, sectionOrdinal: 1, idFactory: makeIdFactory(),
    });
    assert.equal(elements.some((element) => element.isDecorativeChromeText), false);
  });

  it("round-trips: a built badge-number is not double-counted as its own section", () => {
    const styleWithBadge = {
      ...style,
      badgeNumber: { fontSize: 11, fontFamily: "Montserrat", color: "#ffffff", bold: true, digits: 2, relLeft: -44, relTop: 8 },
    };
    const { elements, headingId } = buildSectionElements({
      name: "Certyfikaty", layout: SECTION_LAYOUTS.TEXTAREA, style: styleWithBadge,
      sectionOrdinal: 3, idFactory: makeIdFactory(),
    });
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["Certyfikaty"]); // badge not listed separately
    const ids = sectionElementIds(elements, headingId);
    assert.equal(ids.size, elements.length); // badge still collected as chrome
  });

  it("aa round-trips: built section is detectable and its body is collected", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Profil", layout: SECTION_LAYOUTS.TEXTAREA, style, idFactory: makeIdFactory(),
    });
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["Profil"]);
    const ids = sectionElementIds(elements, headingId);
    // heading + rule + marker + 1 body block all belong to the section.
    assert.equal(ids.size, elements.length);
  });
});

describe("build -> append -> reorder (composed production pipeline)", () => {
  const pageHeight = 842;

  // Minimal realistic document: one masthead line (flow content, excluded from
  // section membership) plus one existing section (chrome heading + rule, one
  // autoHeight content textarea). Mirrors the fixture shape already used by
  // `appendSectionAtEnd`'s own tests in sectionStructure.test.js.
  function existingDoc() {
    return [
      { element_id: "name", category: "text", flowRole: "masthead", content: "Jan Kowalski", left: 76, top: 60, fontSize: 20, height: 24, page: 1 },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie", left: 76, top: 120, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r1", category: "line", flowRole: "section-chrome", left: 76, top: 132, width: 466, height: 1, page: 1 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 150, width: 466, height: 60, fontSize: 9.3, page: 1 },
    ];
  }

  it("chains deriveSectionStyle -> buildSectionElements -> appendSectionAtEnd -> reorderSection without scattering the new record", () => {
    const doc = existingDoc();

    // Step 1: sample a REAL style profile from the existing section instead of a
    // hand-written fixture. This is the same seam `handleAddSection` uses so the
    // new section matches the active template's heading/rule/body look.
    const style = deriveSectionStyle(doc, pageHeight);
    assert.equal(style.left, 76);
    assert.equal(style.recordWidth, 466);
    assert.ok(style.rule, "rule was sampled from the existing section, not defaulted to null");

    // Step 2: build a new "cc-edu" (RECORD_EDUCATION) section from that sampled style.
    const { elements: newElements, headingId: newHeadingId } = buildSectionElements({
      name: "Kursy",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style,
      idFactory: makeIdFactory(),
    });
    // Sanity: heading + rule + 4 content lines (the sampled style has no marker).
    assert.equal(newElements.length, 6);
    const newBodyIds = newElements
      .filter((element) => element.flowRole === "content")
      .map((element) => element.element_id);
    assert.equal(newBodyIds.length, 4);

    // Step 3: append the built strip into the real document flow.
    const appended = appendSectionAtEnd(doc, newElements, pageHeight, {});

    // Step 4: two sections now exist, in reading order — existing, then new.
    const sectionsAfterAppend = listDocumentSections(appended, pageHeight);
    assert.deepEqual(
      sectionsAfterAppend.map((section) => section.title),
      ["Doświadczenie", "Kursy"],
    );

    // Step 5: move the new section up, swapping it with the existing one — the
    // same op the Sections panel triggers after a section is added at the end.
    const reordered = reorderSection(appended, newHeadingId, "up", pageHeight);
    assert.notEqual(reordered, null, "reorder must succeed for two adjacent sections");

    const sectionsAfterReorder = listDocumentSections(reordered, pageHeight);
    assert.deepEqual(
      sectionsAfterReorder.map((section) => section.title),
      ["Kursy", "Doświadczenie"],
      "reorder swaps the two sections' reading order",
    );

    // Step 6: the record's 4 members must still be collected as one group under
    // the new heading — proof the append + reorder/repack chain did not scatter
    // the flowGroup while relocating the strip.
    const reorderedIds = sectionElementIds(reordered, newHeadingId, pageHeight);
    assert.equal(reorderedIds.size, 6, "heading + rule + 4 record lines stay together");
    for (const id of newBodyIds) {
      assert.ok(
        reorderedIds.has(id),
        `record member ${id} must still belong to its section after reorder`,
      );
    }
  });

  it("packs the new section's rule-to-body gap at the configured after_rule rhythm, matching existing sections", () => {
    // Regression for a rhythm mismatch: an added section's rule sat too high
    // (built at fontSize instead of fontSize*1.35), so once packed its
    // rule-to-body gap measured ~10px against a document configured for 8px —
    // visibly different from every existing section's own rule-to-body gap.
    const rhythm = { stack: 4, record: 10, section: 21, after_rule: 8 };
    const doc = existingDoc();
    const style = deriveSectionStyle(doc, pageHeight);
    const { elements: newElements, firstBodyId } = buildSectionElements({
      name: "Kursy", layout: SECTION_LAYOUTS.TEXTAREA, style, spacing: rhythm, idFactory: makeIdFactory(),
    });
    // Identify the new rule by id before appending (it's the only new "line"
    // element for the TEXTAREA layout), so post-append lookups are unambiguous
    // even though the existing doc's own rule shares the same sampled width.
    const newRuleId = newElements.find((element) => element.category === "line").element_id;
    const appended = appendSectionAtEnd(doc, newElements, pageHeight, { spacing: rhythm });

    const newRule = appended.find((element) => element.element_id === newRuleId);
    const newBody = appended.find((element) => element.element_id === firstBodyId);
    const existingRule = appended.find((element) => element.element_id === "r1");
    const existingBody = appended.find((element) => element.element_id === "b1");

    const packedGap = newBody.top - (newRule.top + newRule.height);
    const existingGap = existingBody.top - (existingRule.top + existingRule.height);
    assert.equal(packedGap, rhythm.after_rule);
    // appendSectionAtEnd also retargets wizard sections so both share the knob.
    assert.equal(existingGap, rhythm.after_rule);
  });

  it("Cardinal added sections preserve every rule's right edge and rule-to-body gap", () => {
    // Cardinal centres a thin rule on the visible heading caps, which places
    // its rectangle fractionally above the heading's stored `top`. The section
    // sampler must still copy that rule instead of assigning it to the previous
    // section or falling back to a rule-less generic style.
    let id = 0;
    const doc = cardinalTemplate.map((element, index) => ({
      ...element,
      element_id: `cardinal-${index}`,
      page: 1,
      isDeleted: false,
    }));
    const lastSection = listDocumentSections(doc, pageHeight).at(-1);
    const sampled = deriveSectionStyle(doc, pageHeight, lastSection.headingId);
    const { elements: additions, headingId } = buildSectionElements({
      name: "CERTYFIKATY",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style: sampled,
      idFactory: () => `added-cardinal-${(id += 1)}`,
    });
    const appended = appendSectionAtEnd(doc, additions, pageHeight, {});
    const absolute = (element) => ((element.page || 1) - 1) * pageHeight + element.top;
    const geometry = listDocumentSections(appended, pageHeight).map((section) => {
      const ids = sectionElementIds(appended, section.headingId, pageHeight);
      const members = appended.filter((element) => ids.has(element.element_id));
      const heading = members.find((element) => element.element_id === section.headingId);
      const rule = members.find((element) => element.category === "line" && element.width >= 120);
      const body = members
        .filter((element) => element.flowRole === "content")
        .sort((left, right) => absolute(left) - absolute(right))[0];
      const estimatedHeadingWidth = heading.content.length
        * (heading.fontSize * 0.58 + heading.letterSpacing);
      return {
        headingId: section.headingId,
        ruleId: rule?.element_id,
        right: rule.left + rule.width,
        labelGap: rule.left - heading.left - estimatedHeadingWidth,
        gap: absolute(body) - absolute(rule) - rule.height,
      };
    });

    assert.ok(geometry.find((section) => section.headingId === headingId)?.ruleId);
    assert.deepEqual(new Set(geometry.map((section) => section.right)), new Set([545]));
    assert.deepEqual(
      new Set(geometry.map((section) => Number(section.labelGap.toFixed(6)))),
      new Set([14]),
    );
    assert.equal(
      new Set(geometry.map((section) => Number(section.gap.toFixed(6)))).size,
      1,
    );
  });
});
