import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findProfilePhotoSlot,
  listDocumentSections,
  reorderSection,
} from "./sectionStructure.js";

describe("listDocumentSections", () => {
  it("returns chrome headings in reading order", () => {
    const sections = listDocumentSections([
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "Skills", page: 1, top: 200 },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Experience", page: 1, top: 80 },
      { element_id: "body", category: "textarea", flowRole: "content", top: 100, page: 1 },
    ]);
    assert.deepEqual(sections.map((section) => section.title), ["Experience", "Skills"]);
  });

  it("detects untagged Cinder-style labels above a rule", () => {
    const sections = listDocumentSections([
      {
        element_id: "job-title",
        category: "text",
        content: "DYREKTORKA FINANSOWA",
        fontSize: 9.5,
        left: 78,
        top: 86,
        page: 1,
      },
      {
        element_id: "summary-h",
        category: "text",
        content: "PODSUMOWANIE ZAWODOWE",
        fontSize: 8.7,
        left: 76,
        top: 207,
        page: 1,
      },
      {
        element_id: "summary-rule",
        category: "line",
        left: 76,
        top: 226,
        width: 466,
        height: 1,
        page: 1,
      },
      {
        element_id: "exp-h",
        category: "text",
        content: "DOŚWIADCZENIE ZAWODOWE",
        fontSize: 8.7,
        left: 76,
        top: 319,
        page: 1,
      },
      {
        element_id: "exp-rule",
        category: "line",
        left: 76,
        top: 338,
        width: 466,
        height: 1,
        page: 1,
      },
    ]);
    assert.deepEqual(
      sections.map((section) => section.title),
      ["PODSUMOWANIE ZAWODOWE", "DOŚWIADCZENIE ZAWODOWE"],
    );
  });
});

describe("reorderSection", () => {
  it("swaps adjacent section clusters", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "A", page: 1, top: 80, height: 14 },
      { element_id: "a1", category: "textarea", flowRole: "content", page: 1, top: 100, height: 40 },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "B", page: 1, top: 160, height: 14 },
      { element_id: "b1", category: "textarea", flowRole: "content", page: 1, top: 180, height: 40 },
    ];
    const next = reorderSection(elements, "h2", "up");
    assert.ok(next);
    const byId = Object.fromEntries(next.map((element) => [element.element_id, element]));
    assert.ok(byId.h2.top < byId.h1.top);
    assert.ok(byId.b1.top < byId.a1.top);
  });
});

describe("findProfilePhotoSlot", () => {
  it("prefers large near-top non-icon images", () => {
    const slot = findProfilePhotoSlot([
      { element_id: "icon", category: "image", src: "/template-assets/iconic/x.svg", width: 14, height: 14, top: 40 },
      { element_id: "photo", category: "image", src: "/images/2/content", width: 90, height: 90, top: 50 },
      { element_id: "logo", category: "image", src: "/images/3/content", width: 40, height: 20, top: 400 },
    ]);
    assert.equal(slot.element_id, "photo");
  });
});
