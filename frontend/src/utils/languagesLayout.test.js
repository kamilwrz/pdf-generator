import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLanguagesMainGrid,
  collectLanguageEntries,
  isLanguagesGridSection,
  isLanguagesSectionTitle,
  parseLanguageLine,
  restyleLanguagesMembersAsSidebar,
} from "./languagesLayout.js";

describe("isLanguagesSectionTitle", () => {
  it("matches generated and legacy Polish, English, German, and Italian titles", () => {
    assert.equal(isLanguagesSectionTitle("JĘZYKI"), true);
    assert.equal(isLanguagesSectionTitle("Języki obce"), true);
    assert.equal(isLanguagesSectionTitle("Languages"), true);
    assert.equal(isLanguagesSectionTitle("SPRACHEN"), true);
    assert.equal(isLanguagesSectionTitle("Lingua"), true);
    assert.equal(isLanguagesSectionTitle("LINGUE"), true);
    assert.equal(isLanguagesSectionTitle("Umiejętności"), false);
  });

  it("uses explicit grid identity before the editable heading fallback", () => {
    assert.equal(
      isLanguagesGridSection([{ gridKind: "entries" }], "JĘZYKI"),
      false,
    );
    assert.equal(
      isLanguagesGridSection([{ gridKind: "languages" }], "KOMPETENCJE GLOBALNE"),
      true,
    );
    assert.equal(isLanguagesGridSection([], "SPRACHEN"), true);
  });
});
describe("parseLanguageLine", () => {
  it("splits hyphen and em-dash forms", () => {
    assert.deepEqual(parseLanguageLine("Polski - A2"), { name: "Polski", level: "A2" });
    assert.deepEqual(parseLanguageLine("Angielski — C1"), { name: "Angielski", level: "C1" });
    assert.deepEqual(parseLanguageLine("Niemiecki"), { name: "Niemiecki", level: "" });
  });
});
describe("buildLanguagesMainGrid", () => {
  it("emits grid-member cells with one uniform text style", () => {
    const cells = buildLanguagesMainGrid(
      [
        { name: "Polski", level: "A2" },
        { name: "Niemiecki", level: "C1" },
        { name: "Angielski", level: "B2" },
      ],
      {
        bodyLeft: 245,
        recordWidth: 300,
        body: { fontSize: 9, lineHeight: 13, color: "#26313F", fontFamily: "Montserrat" },
        appendTop: 500,
        idFactory: (() => {
          let n = 0;
          return () => `c${++n}`;
        })(),
        columns: 4,
      },
    );
    assert.equal(cells.length, 3);
    assert.ok(cells.every((cell) => cell.flowRole === "grid-member"));
    assert.ok(cells.every((cell) => cell.gridKind === "languages"));
    assert.ok(cells.every((cell) => cell.flowGroup));
    assert.equal(cells[0].left, 245);
    assert.ok(cells[1].left > cells[0].left);
    assert.equal(cells[0].top, cells[1].top);
    assert.ok(cells[0].content.includes(" — "));
    assert.equal(cells[0].color, "#26313F");
    assert.equal(cells[0].italic, false);
    assert.equal(cells[0].runs, undefined);
    assert.ok((Number(cells[0].width) || 0) < 100);
  });

  it("defaults to 3 columns for a narrow (sidebar-template) main column", () => {
    // Regression: a 4th column left too little width per cell for a
    // "Name — Level" line in a narrow (~300pt) sidebar-template main column
    // (Sterling/Tessera/Slate), wrapping or cutting it off mid-word.
    // No template-id context reaches this call site (only the sampled
    // `recordWidth`), so the column count is derived from the width itself.
    // Four entries discriminate the column count directly: at 3 columns the
    // 4th entry wraps onto a new row (two distinct `top`s); at the old
    // hardcoded 4-column default all four still fit on one row.
    const entries = [
      { name: "Polski", level: "A2" },
      { name: "Niemiecki", level: "C1" },
      { name: "Angielski", level: "B2" },
      { name: "Francuski", level: "B1" },
    ];
    const idFactory = (() => {
      let n = 0;
      return () => `c${++n}`;
    })();
    const narrow = buildLanguagesMainGrid(entries, {
      bodyLeft: 245, recordWidth: 300,
      body: { fontSize: 9, lineHeight: 13 }, appendTop: 500, idFactory,
    });
    assert.equal(narrow.length, 4);
    const narrowRowTops = new Set(narrow.map((cell) => cell.top));
    assert.equal(narrowRowTops.size, 2, "4th entry must wrap onto a new row at 3 columns");
    assert.equal(narrow.filter((cell) => cell.top === narrow[0].top).length, 3);

    const wide = buildLanguagesMainGrid(entries, {
      bodyLeft: 84, recordWidth: 499,
      body: { fontSize: 9, lineHeight: 13 }, appendTop: 500, idFactory,
    });
    const wideRowTops = new Set(wide.map((cell) => cell.top));
    assert.equal(wideRowTops.size, 1, "all 4 entries fit one row at the single-column default (4 columns)");
  });
});

describe("collectLanguageEntries + restyleLanguagesMembersAsSidebar", () => {
  it("collapses a main grid back to one hyphenated sidebar body", () => {
    const members = [
      { element_id: "h", category: "text", content: "JĘZYKI",
        flowRole: "section-chrome", left: 245, top: 600, fontSize: 10, height: 14, page: 1, bold: true },
      { element_id: "r", category: "line", flowRole: "section-chrome",
        left: 245, top: 618, width: 300, height: 1, page: 1, backgroundColor: "#4A6FA5" },
      { element_id: "c1", category: "textarea", content: "Polski — A2",
        flowRole: "grid-member", flowGroup: "lang", left: 245, top: 630, width: 70, height: 14,
        fontSize: 9, page: 1 },
      { element_id: "c2", category: "textarea", content: "Niemiecki — C1",
        flowRole: "grid-member", flowGroup: "lang", left: 320, top: 630, width: 70, height: 14,
        fontSize: 9, page: 1 },
    ];
    assert.deepEqual(collectLanguageEntries(members, "h"), [
      { name: "Polski", level: "A2" },
      { name: "Niemiecki", level: "C1" },
    ]);
    const rail = restyleLanguagesMembersAsSidebar(members, "h", {
      left: 34,
      bodyLeft: 34,
      recordWidth: 152,
      heading: { fontSize: 9.4, fontFamily: "Montserrat", color: "#33517A", bold: true },
      rule: { width: 22, height: 1.4, backgroundColor: "#4A6FA5", relLeft: 0 },
      body: { fontSize: 8.3, lineHeight: 12, color: "#26313F", fontFamily: "Montserrat" },
    }, 1000);
    assert.ok(rail);
    assert.equal(rail.length, 3);
    const body = rail.find((element) => element.category === "textarea");
    assert.equal(members.some((element) => element.element_id === body.element_id), false);
    assert.equal(body.flowLane, "sidebar");
    assert.ok(body.content.includes("Polski - A2"));
    assert.ok(body.content.includes("Niemiecki - C1"));
    assert.ok(!body.content.includes("—"));
  });
});
