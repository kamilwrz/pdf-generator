import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applySelectedSectionIcon,
  buildIconicSrc,
  findSectionIconSlot,
  listSectionIconOptions,
  parseIconicSrc,
  suggestSectionIconName,
} from "./sectionIcons.js";
import { deriveSectionStyle } from "./sectionStructure.js";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";

const styleBase = {
  left: 66,
  bodyLeft: 66,
  recordWidth: 466,
  heading: {
    fontSize: 8.5, fontFamily: "Inter", color: "#24201E", letterSpacing: 1.4, bold: false,
  },
  rule: { width: 466, height: 1, backgroundColor: "#BFB4AA", relLeft: 0 },
  markers: [],
  badgeNumber: null,
  body: { fontSize: 9.3, fontFamily: "Inter", lineHeight: 13, color: "#24201E" },
  mutedColor: "#756F6B",
};

function makeIdFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe("parseIconicSrc / buildIconicSrc", () => {
  it("parses theme and name from an absolute iconic URL", () => {
    const parsed = parseIconicSrc("https://example.com/template-assets/iconic/nova/experience.png");
    assert.deepEqual(parsed, { theme: "nova", name: "experience" });
  });

  it("builds a src that round-trips through parseIconicSrc", () => {
    const src = buildIconicSrc("nova", "skills");
    assert.deepEqual(parseIconicSrc(src), { theme: "nova", name: "skills" });
  });
});

describe("listSectionIconOptions", () => {
  it("lists nova heading icons for the nova template", () => {
    const options = listSectionIconOptions({ templateId: "nova", elements: [] });
    assert.ok(options.length >= 8);
    assert.ok(options.some((option) => option.name === "experience"));
    assert.ok(options.every((option) => option.src.includes("/iconic/nova/")));
  });

  it("hides the gallery for an unmapped template unless a heading icon already exists", () => {
    assert.deepEqual(listSectionIconOptions({ templateId: "sterling", elements: [] }), []);
  });

  it("shows icons from an existing section-heading icon even for an unmapped template", () => {
    const elements = [
      {
        element_id: "h1", category: "text", flowRole: "section-chrome", content: "Referencje",
        left: 76, top: 100, fontSize: 8.7, fontFamily: "Inter", color: "#111",
      },
      {
        element_id: "i1", category: "image", flowRole: "section-chrome",
        src: "/template-assets/iconic/slate/references.png",
        left: 52, top: 100, width: 12, height: 12, alignWithText: true,
      },
      {
        element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 112, width: 200, height: 1, backgroundColor: "#ccc",
      },
    ];
    const options = listSectionIconOptions({ templateId: "sterling", elements });
    assert.ok(options.some((option) => option.name === "references"));
  });
});

describe("suggestSectionIconName", () => {
  it("maps Polish education titles to the education glyph", () => {
    assert.equal(
      suggestSectionIconName("Wykształcenie", ["education", "other"]),
      "education",
    );
  });
});

describe("applySelectedSectionIcon", () => {
  it("replaces the sampled iconic marker src and builds it into the section", () => {
    const elements = [
      {
        element_id: "icon", category: "image", flowRole: "section-chrome",
        src: "https://api.test/template-assets/iconic/nova/summary.png",
        left: 48, top: 100, width: 15, height: 15, alignWithText: true,
      },
      {
        element_id: "h1", category: "text", flowRole: "section-chrome", content: "PODSUMOWANIE",
        left: 66, top: 100, fontSize: 8.8, fontFamily: "Helvetica", color: "#9E2532",
      },
      {
        element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 66, top: 117, width: 463, height: 1, backgroundColor: "#8A8A8A",
      },
      {
        element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 66, top: 130, width: 463, height: 30, fontSize: 9.3, fontFamily: "Helvetica",
        lineHeight: 13, color: "#333",
      },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.markers.length, 1);
    assert.equal(style.markers[0].category, "image");
    assert.equal(style.markers[0].alignWithText, true);
    assert.match(style.markers[0].src, /nova\/summary\.png$/);

    const withIcon = applySelectedSectionIcon(style, elements, 842, {
      templateId: "nova",
      iconName: "certifications",
    });
    assert.match(withIcon.markers[0].src, /nova\/certifications\.png$/);
    assert.equal(withIcon.markers[0].relLeft, 48 - 66);
    assert.equal(withIcon.markers[0].width, 15);

    const { elements: built, headingId } = buildSectionElements({
      name: "Certyfikaty",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style: withIcon,
      idFactory: makeIdFactory("sec"),
    });
    const heading = built.find((element) => element.element_id === headingId);
    const icon = built.find((element) => element.category === "image");
    assert.ok(icon);
    assert.match(icon.src, /nova\/certifications\.png$/);
    assert.equal(icon.alignWithText, true);
    assert.equal(icon.left, heading.left + (48 - 66));
    assert.equal(icon.top, heading.top);
    assert.equal(icon.flowRole, "section-chrome");
  });

  it("injects an icon marker when the last section style lost its image", () => {
    const elements = [
      {
        element_id: "icon", category: "image", flowRole: "section-chrome",
        src: "/template-assets/iconic/nova/experience.png",
        left: 48, top: 100, width: 14, height: 14, alignWithText: true,
      },
      {
        element_id: "h1", category: "text", flowRole: "section-chrome", content: "DOŚWIADCZENIE",
        left: 66, top: 100, fontSize: 8.6, fontFamily: "Montserrat", color: "#C45C26",
      },
      {
        element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 66, top: 117, width: 400, height: 1, backgroundColor: "#E0D2C0",
      },
      {
        element_id: "b1", category: "textarea", flowRole: "content",
        left: 66, top: 130, width: 400, height: 20, fontSize: 9, fontFamily: "Montserrat",
        lineHeight: 13, color: "#2C241C",
      },
    ];
    assert.ok(findSectionIconSlot(elements));
    const style = { ...styleBase, markers: [] };
    const withIcon = applySelectedSectionIcon(style, elements, 842, {
      templateId: "nova",
      iconName: "skills",
    });
    assert.equal(withIcon.markers.length, 1);
    assert.match(withIcon.markers[0].src, /nova\/skills\.png$/);
    assert.equal(withIcon.markers[0].relLeft, 48 - 66);
  });
});
