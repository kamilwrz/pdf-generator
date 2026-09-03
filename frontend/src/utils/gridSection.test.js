import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  insertGridSectionEntry,
  listGridSectionEntryAnchors,
  removeGridSectionEntry,
} from "./gridSection.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { reflowTextareaHeight } from "./textareaReflow.js";

const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };

function idFactory(prefix = "new") {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function heading(elementId, content, top, extra = {}) {
  return {
    element_id: elementId,
    category: "text",
    content,
    left: 84,
    top,
    width: 400,
    height: 14,
    fontSize: 10,
    page: 1,
    bold: true,
    flowRole: "section-chrome",
    ...extra,
  };
}

function rule(elementId, top, width = 300) {
  return {
    element_id: elementId,
    category: "line",
    left: 84,
    top,
    width,
    height: 1,
    page: 1,
    flowRole: "section-chrome",
  };
}

function cell(elementId, content, left, top, extra = {}) {
  return {
    element_id: elementId,
    category: "textarea",
    content,
    left,
    top,
    width: 92,
    height: 19,
    fontSize: 9,
    lineHeight: 13,
    fontFamily: "Montserrat",
    color: "#242424",
    page: 1,
    bold: false,
    italic: false,
    autoHeight: true,
    flowRole: "grid-member",
    flowGroup: "row-original",
    ...extra,
  };
}

function languageDocument(entries = [
  cell("lang-1", "Polski — C2", 84, 128, {
    runs: [{ start: 9, end: 11, italic: true, color: "#8A664F" }],
  }),
  cell("lang-2", "Niemiecki — C1", 184, 128),
  cell("lang-3", "Angielski — B2", 284, 128),
]) {
  return [
    heading("languages-heading", "JĘZYKI", 100, { gridColumns: 3 }),
    rule("languages-rule", 116),
    ...entries,
    heading("next-heading", "CERTYFIKATY", 180),
    rule("next-rule", 196),
    {
      element_id: "next-body",
      category: "textarea",
      content: "PRINCE2",
      left: 84,
      top: 208,
      width: 300,
      height: 19,
      fontSize: 9,
      lineHeight: 13,
      page: 1,
      autoHeight: true,
      flowRole: "content",
    },
  ];
}

function byId(elements, elementId) {
  return elements.find((element) => element.element_id === elementId);
}

describe("listGridSectionEntryAnchors", () => {
  it("discovers language and explicitly managed grids but ignores ordinary skill pills", () => {
    const elements = [
      ...languageDocument(),
      heading("skills-heading", "UMIEJĘTNOŚCI", 260),
      rule("skills-rule", 276),
      cell("skill-pill", "React", 84, 288, { flowGroup: "skills-row" }),
      heading("tools-heading", "NARZĘDZIA", 330, { editorSectionLayout: "grid" }),
      rule("tools-rule", 346),
      cell("tool-cell", "Figma", 84, 358, { flowGroup: "tools-row" }),
    ];

    const anchors = listGridSectionEntryAnchors(elements);
    assert.deepEqual(
      anchors.map((anchor) => anchor.elementId),
      ["lang-1", "lang-2", "lang-3", "tool-cell"],
    );
    assert.ok(anchors.slice(0, 3).every((anchor) => anchor.gridKind === "languages"));
    assert.equal(anchors.find((anchor) => anchor.elementId === "tool-cell")?.gridKind, "entries");
    assert.ok(anchors.slice(0, 3).every((anchor) => anchor.canDelete));
    assert.equal(
      anchors.find((anchor) => anchor.elementId === "tool-cell")?.canDelete,
      false,
    );
  });
});

describe("insertGridSectionEntry", () => {
  it("keeps starter guidance as placeholder metadata in an added Języki section", () => {
    const elements = [
      heading("added-languages-heading", "JĘZYKI", 100, {
        editorSectionLayout: "grid",
        editorSectionType: "languages",
        gridKind: "entries",
      }),
      rule("added-languages-rule", 116),
      cell("added-language", "", 84, 128, {
        placeholder: "Język · Poziom",
        starterPlaceholder: true,
        editorGridEntry: true,
        gridKind: "entries",
      }),
    ];
    const result = insertGridSectionEntry(elements, "added-language", 842, {
      idFactory: idFactory("added-language"),
    });

    assert.ok(result);
    const inserted = byId(result.elements, result.entryId);
    assert.equal(inserted.content, "");
    assert.equal(inserted.placeholder, "Język · Poziom");
    assert.equal(inserted.starterPlaceholder, true);
    assert.equal(inserted.editorSectionType, "languages");
  });

  it("inserts after the hovered cell, wraps at the fixed column count, and repacks later sections", () => {
    const elements = languageDocument([
      cell("lang-1", "Polski — C2", 84, 128, {
        runs: [{ start: 9, end: 11, italic: true, color: "#8A664F" }],
      }),
      // Long copy forces the first row to use its tallest cell when the next
      // row is positioned.
      cell("lang-2", "Niemiecki — bardzo dobra znajomość", 184, 128),
      cell("lang-3", "Angielski — B2", 284, 128),
    ]);
    const nextHeadingBefore = byId(elements, "next-heading").top;
    const result = insertGridSectionEntry(elements, "lang-1", 842, {
      spacing: SPACING,
      idFactory: idFactory("insert"),
    });

    assert.ok(result);
    const inserted = byId(result.elements, result.entryId);
    const first = byId(result.elements, "lang-1");
    const second = byId(result.elements, "lang-2");
    const third = byId(result.elements, "lang-3");
    const nextHeading = byId(result.elements, "next-heading");

    assert.equal(inserted.content, "");
    assert.equal(inserted.placeholder, "Język · Poziom");
    assert.equal(inserted.starterPlaceholder, true);
    assert.equal(inserted.editorSectionType, "languages");
    assert.deepEqual(
      result.elements
        .filter((element) => ["lang-1", result.entryId, "lang-2", "lang-3"].includes(element.element_id))
        .map((element) => element.element_id),
      ["lang-1", result.entryId, "lang-2", "lang-3"],
    );
    assert.equal(first.top, inserted.top);
    assert.equal(inserted.top, second.top);
    assert.ok(third.top >= second.top + second.height - 0.01);
    assert.equal(first.flowGroup, inserted.flowGroup);
    assert.equal(inserted.flowGroup, second.flowGroup);
    assert.notEqual(second.flowGroup, third.flowGroup);
    assert.equal(first.width, inserted.width);
    assert.equal(inserted.width, second.width);
    assert.ok(nextHeading.top > nextHeadingBefore, "a new row must open space before the next section");
    assert.equal(first.runs, null);
    assert.equal(inserted.runs, null);
  });

  it("keeps a renamed semantic Languages grid managed and defaults a one-cell narrow main grid to 3 columns", () => {
    const elements = [
      heading("languages-heading", "KOMPETENCJE GLOBALNE", 100, { width: 300 }),
      rule("languages-rule", 116, 300),
      cell("only-language", "Polski — C2", 84, 128, {
        gridKind: "languages",
      }),
    ];

    const anchors = listGridSectionEntryAnchors(elements);
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].gridKind, "languages");
    assert.equal(anchors[0].columns, 3);

    const result = insertGridSectionEntry(elements, "only-language", 842, {
      spacing: SPACING,
      idFactory: idFactory("narrow-language"),
    });

    assert.ok(result);
    const original = byId(result.elements, "only-language");
    const inserted = byId(result.elements, result.entryId);
    assert.equal(original.top, inserted.top, "the second entry must stay in the first row");
    assert.deepEqual([original.left, inserted.left], [84, 184]);
    assert.equal(original.gridColumns, 3);
    assert.equal(inserted.gridColumns, 3);
    assert.equal(inserted.gridKind, "languages");
    assert.equal(inserted.content, "");
    assert.equal(inserted.placeholder, "Język · Poziom");
    assert.equal(inserted.starterPlaceholder, true);
  });
});

describe("removeGridSectionEntry", () => {
  it("removes exactly one cell and compacts later entries into the open slot", () => {
    const elements = languageDocument([
      cell("lang-1", "Polski — C2", 84, 128),
      cell("lang-2", "Niemiecki — C1", 184, 128),
      cell("lang-3", "Angielski — B2", 284, 128),
      cell("lang-4", "Francuski — B1", 84, 147, { flowGroup: "row-original-2" }),
    ]);
    const result = removeGridSectionEntry(elements, "lang-2", 842, {
      spacing: SPACING,
      idFactory: idFactory("remove"),
    });

    assert.ok(result);
    assert.deepEqual([...result.removedIds], ["lang-2"]);
    assert.equal(byId(result.elements, "lang-2"), undefined);
    const remaining = ["lang-1", "lang-3", "lang-4"].map((id) => byId(result.elements, id));
    assert.ok(remaining.every(Boolean));
    assert.equal(new Set(remaining.map((entry) => entry.top)).size, 1);
    assert.deepEqual(remaining.map((entry) => entry.left), [84, 184, 284]);
    assert.equal(result.removedElements[0].deletedGridEntry, true);
    assert.equal(result.removedElements[0].gridKind, "languages");
  });

  it("protects the final cell so the section keeps a per-cell add trigger", () => {
    const elements = languageDocument([
      cell("only-language", "Polski — C2", 84, 128),
    ]);
    const anchors = listGridSectionEntryAnchors(elements);
    assert.equal(anchors.find((anchor) => anchor.elementId === "only-language")?.canDelete, false);
    assert.equal(removeGridSectionEntry(elements, "only-language"), null);
  });

  it("lets explicit entries semantics override a custom JĘZYKI title", () => {
    const elements = [
      heading("tools-heading", "JĘZYKI", 100, {
        editorSectionLayout: "grid",
        gridColumns: 2,
        gridKind: "entries",
      }),
      rule("tools-rule", 116, 200),
      cell("tool-1", "Figma", 84, 128, {
        gridKind: "entries",
        runs: [{ start: 0, end: 5, color: "#155EEF" }],
      }),
      cell("tool-2", "Sketch", 184, 128, { gridKind: "entries" }),
    ];
    const anchor = listGridSectionEntryAnchors(elements)
      .find((candidate) => candidate.elementId === "tool-1");
    assert.equal(anchor?.gridKind, "entries");

    const result = insertGridSectionEntry(elements, "tool-1", 842, {
      idFactory: idFactory("tool"),
      spacing: SPACING,
    });

    assert.ok(result);
    assert.deepEqual(byId(result.elements, "tool-1").runs, [
      { start: 0, end: 5, color: "#155EEF" },
    ]);
    assert.equal(byId(result.elements, result.entryId).content, "Nowy wpis");
    assert.equal(byId(result.elements, result.entryId).gridKind, "entries");
  });

  it("restores downstream section geometry after a same-row language add and delete", () => {
    const authored = [
      heading("languages-heading", "JĘZYKI", 100, {
        width: undefined,
        gridColumns: 3,
      }),
      rule("languages-rule", 118, 466),
      cell("lang-1", "Polski · C2", 84, 127, {
        height: 13,
        gridKind: "languages",
        gridColumns: 3,
        gridLeft: 84,
        gridWidth: 466,
      }),
      cell("lang-2", "Niemiecki · C1", 239.3, 127, {
        height: 13,
        gridKind: "languages",
        gridColumns: 3,
        gridLeft: 84,
        gridWidth: 466,
      }),
      heading("next-heading", "UMIEJĘTNOŚCI (KATEGORIE)", 161, { width: undefined }),
      { ...rule("next-accent", 179, 18), left: 84 },
      rule("next-rule", 179, 466),
      {
        element_id: "next-body",
        category: "textarea",
        content: "Kategoria umiejętności",
        left: 84,
        top: 188,
        width: 466,
        height: 13,
        fontSize: 9,
        lineHeight: 13,
        page: 1,
        autoHeight: true,
        flowRole: "content",
      },
    ];
    const initial = applyFlowSpacing(authored, SPACING, 842);
    const stripGeometry = (elements) => Object.fromEntries(
      ["next-heading", "next-accent", "next-rule", "next-body"].map((id) => {
        const element = byId(elements, id);
        return [id, { page: element.page, top: element.top }];
      }),
    );
    const baseline = stripGeometry(initial);
    const settle = (elements, ids) => ids.reduce((current, id) => (
      reflowTextareaHeight(current, id, 13, 842, {
        pageTop: 66,
        bottomMargin: 72,
        spacing: SPACING,
      }).elements
    ), elements);

    const inserted = insertGridSectionEntry(initial, "lang-2", 842, {
      spacing: SPACING,
      idFactory: idFactory("round-trip"),
    });
    assert.ok(inserted);
    const afterAdd = settle(
      inserted.elements,
      [inserted.entryId, "lang-2", "lang-1"],
    );
    assert.deepEqual(stripGeometry(afterAdd), baseline);

    const removed = removeGridSectionEntry(afterAdd, inserted.entryId, 842, {
      spacing: SPACING,
      idFactory: idFactory("round-trip-remove"),
    });
    assert.ok(removed);
    const afterDelete = settle(removed.elements, ["lang-1", "lang-2"]);
    assert.deepEqual(stripGeometry(afterDelete), baseline);
  });
});
