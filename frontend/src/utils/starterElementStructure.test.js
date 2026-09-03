import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyStarterElementStructure,
  prepareStarterElementsForRender,
} from "./starterElementStructure.js";
import { buildStarterDocument, createDefaultStarterConfig } from "./cvStarter.js";
import { atriumTemplate } from "../templates/atrium.js";
import { aureliaTemplate } from "../templates/aurelia.js";
import { cadenzaTemplate } from "../templates/cadenza.js";
import { lindenTemplate } from "../templates/linden.js";
import { meridianTemplate } from "../templates/meridian.js";
import { monumentTemplate } from "../templates/monument.js";
import { regentTemplate } from "../templates/regent.js";
import { slateTemplate } from "../templates/slate.js";
import { sterlingTemplate } from "../templates/sterling.js";
import { vellumTemplate } from "../templates/vellum.js";

const templateFixtures = {
  atrium: atriumTemplate,
  aurelia: aureliaTemplate,
  cadenza: cadenzaTemplate,
  linden: lindenTemplate,
  meridian: meridianTemplate,
  monument: monumentTemplate,
  regent: regentTemplate,
  slate: slateTemplate,
  sterling: sterlingTemplate,
  vellum: vellumTemplate,
};

const contactBand = {
  id: "meridian-contact",
  mode: "centered",
  anchor: { centerX: 300, startY: 100, maxWidth: 400 },
  text: { fontFamily: "Inter", fontSizePt: 8, colorHex: "#161616" },
  icon: { sizePt: 10, theme: "meridian" },
  metrics: { iconGap: 16, itemPad: 14, lineStep: 16, charWidth: 5 },
  order: ["phone", "email", "location"],
};

function contactPair(channel, content, left) {
  return [
    {
      element_id: `${channel}-icon`, category: "image", contactBandId: contactBand.id,
      contactChannel: channel, src: `/${channel}.svg`, left, top: 100, page: 1,
    },
    {
      element_id: `${channel}-label`, category: "text", contactBandId: contactBand.id,
      contactChannel: channel, content, left: left + 16, top: 100, page: 1,
    },
  ];
}

describe("starter render copy", () => {
  it("reflows selected starter contacts in every built-in template", () => {
    for (const [templateId, specs] of Object.entries(templateFixtures)) {
      const config = { ...createDefaultStarterConfig(), templateId };
      const { cvData, fillProfile } = buildStarterDocument(config);
      const selected = new Set(cvData.starter_structure.contacts);
      const raw = specs
        .map((element, index) => ({
          ...element,
          element_id: `${templateId}-${index + 1}`,
          page: element.page ?? 1,
        }))
        .filter((element) => !element.contactChannel || selected.has(element.contactChannel))
        .map((element) => (
          element.contactChannel && element.category === "text"
            ? { ...element, content: fillProfile[element.contactChannel] }
            : element
        ));
      const result = applyStarterElementStructure(raw, cvData, templateId);
      const labels = result.filter((element) => (
        element.contactChannel && element.category === "text"
      ));
      assert.deepEqual(
        labels.map((element) => element.contactChannel).sort(),
        ["email", "location", "phone"],
        `${templateId}: selected channels survive`,
      );
      assert.ok(labels.every((element) => element.content === ""), `${templateId}: sentinels removed`);
      assert.ok(labels.every((element) => element.placeholder), `${templateId}: guidance retained`);

      const rows = new Map();
      for (const label of labels) {
        const row = Number(label.top).toFixed(3);
        rows.set(row, [...(rows.get(row) || []), Number(label.left)]);
      }
      for (const positions of rows.values()) {
        const sorted = [...positions].sort((left, right) => left - right);
        assert.deepEqual(positions, sorted, `${templateId}: horizontal order is stable`);
        assert.equal(new Set(positions).size, positions.length, `${templateId}: contacts do not overlap`);
      }
    }
  });

  it("reflows marker-generated contacts to their editor placeholder widths", () => {
    const { cvData, fillProfile } = buildStarterDocument(createDefaultStarterConfig());
    const source = [
      {
        element_id: "contact-anchor", category: "text", content: "", page: 1,
        flowRole: "masthead-anchor", contactBandId: contactBand.id, contactBand,
      },
      ...contactPair("phone", fillProfile.phone, 1),
      ...contactPair("email", fillProfile.email, 2),
      ...contactPair("location", fillProfile.location, 3),
    ];
    const result = applyStarterElementStructure(source, cvData, "meridian");
    const phoneIcon = result.find((element) => element.element_id === "phone-icon");
    const emailIcon = result.find((element) => element.element_id === "email-icon");
    assert.equal(result.find((element) => element.element_id === "email-label").content, "");
    assert.equal(
      emailIcon.left - phoneIcon.left,
      16 + "+48 000 000 000".length * 5 + 14,
    );
  });

  it("drops an empty contact channel without mutating the editor elements", () => {
    const source = [
      { element_id: "icon", category: "image", contactChannel: "email", src: "/mail.svg" },
      { element_id: "label", category: "text", contactChannel: "email", content: "", starterPlaceholder: true, cvDataBindings: [{ path: ["email"] }] },
      { element_id: "name", category: "text", content: "Ada" },
    ];
    const rendered = prepareStarterElementsForRender(source);
    assert.deepEqual(rendered.map((element) => element.element_id), ["name"]);
    assert.equal(source.length, 3);
  });

  it("keeps a completed starter field", () => {
    const rendered = prepareStarterElementsForRender([{
      element_id: "email",
      category: "text",
      content: "ada@example.com",
      contactChannel: "email",
      starterPlaceholder: false,
      cvDataBindings: [{ path: ["email"] }],
    }]);
    assert.equal(rendered.length, 1);
  });

  it("closes the horizontal gap after omitting an empty contact from render", () => {
    const source = [
      {
        element_id: "contact-anchor", category: "text", content: "", page: 1,
        flowRole: "masthead-anchor", contactBandId: contactBand.id, contactBand,
      },
      ...contactPair("phone", "+48 111 222 333", 10),
      ...contactPair("email", "", 300).map((element) => (
        element.category === "text"
          ? { ...element, starterPlaceholder: true, cvDataBindings: [{ path: ["email"] }] }
          : element
      )),
      ...contactPair("location", "Warszawa", 500),
    ];
    const rendered = prepareStarterElementsForRender(source, 842, "meridian");
    const phoneIcon = rendered.find((element) => element.element_id === "phone-icon");
    const locationIcon = rendered.find((element) => element.element_id === "location-icon");
    assert.equal(rendered.some((element) => element.contactChannel === "email"), false);
    assert.equal(
      locationIcon.left - phoneIcon.left,
      16 + "+48 111 222 333".length * 5 + 14,
    );
    assert.equal(source.find((element) => element.element_id === "location-icon").left, 500);
  });

  it("keeps a real starter photo and its frame", () => {
    const source = [
      { element_id: "frame", category: "rectangle", photoSlot: "frame", starterSectionKey: "photo", starterPlaceholder: false },
      { element_id: "photo", category: "image", photoSlot: "image", src: "/owned/photo.png", starterSectionKey: "photo", starterPlaceholder: false },
    ];
    const rendered = prepareStarterElementsForRender(source);
    assert.deepEqual(rendered.map((element) => element.element_id), ["frame", "photo"]);
  });

  it("drops the untouched starter photo cluster", () => {
    const source = [
      { element_id: "frame", category: "rectangle", photoSlot: "frame", starterSectionKey: "photo", starterPlaceholder: false },
      { element_id: "glyph", category: "image", photoSlot: "glyph", src: "/portrait-placeholder.png", starterSectionKey: "photo", starterPlaceholder: true },
    ];
    assert.deepEqual(prepareStarterElementsForRender(source), []);
  });
});
