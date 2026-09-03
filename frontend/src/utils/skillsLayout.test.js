import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSkillsMainGroups,
  collectSkillGroups,
  formatSkillsSidebarContent,
  isSkillsSectionHeading,
  layoutSkillChips,
  parseSkillsSidebarContent,
  restyleSkillsMembersAsMain,
  restyleSkillsMembersAsSidebar,
} from "./skillsLayout.js";
import { syncCvDataFromCanvas } from "./syncCvDataFromCanvas.js";

describe("isSkillsSectionHeading", () => {
  it("matches Polish and English skills titles", () => {
    assert.equal(isSkillsSectionHeading("UMIEJĘTNOŚCI"), true);
    assert.equal(isSkillsSectionHeading("Skills"), true);
    assert.equal(isSkillsSectionHeading("JĘZYKI"), false);
  });
});

describe("parseSkillsSidebarContent", () => {
  it("splits category lines from bullet items", () => {
    const groups = parseSkillsSidebarContent(
      "Python\n• Backend development\n• REST APIs (FastAPI)\nC++\n• OOP\n• basic STL",
    );
    assert.deepEqual(groups, [
      { category: "Python", items: ["Backend development", "REST APIs (FastAPI)"] },
      { category: "C++", items: ["OOP", "basic STL"] },
    ]);
  });

  it("accepts hyphen bullets from the rail", () => {
    const groups = parseSkillsSidebarContent("Tools\n- Git\n- Docker");
    assert.deepEqual(groups, [
      { category: "Tools", items: ["Git", "Docker"] },
    ]);
  });

  it("treats a flat mid-dot list as one untitled group", () => {
    const groups = parseSkillsSidebarContent("SQL  ·  Python  ·  Git");
    assert.deepEqual(groups, [
      { category: "", items: ["SQL", "Python", "Git"] },
    ]);
  });
});

describe("layoutSkillChips", () => {
  it("uses the deterministic text estimate when no canvas measurer is available", () => {
    const { placements } = layoutSkillChips(["React"], 300, 10);

    assert.equal(placements.length, 1);
    assert.ok(
      placements[0].width > 40,
      "the chip must include estimated label width in addition to its 20px padding",
    );
  });
});

describe("buildSkillsMainGroups + collapse", () => {
  it("emits bold category + inline body with shared flowGroup", () => {
    const bodies = buildSkillsMainGroups(
      [
        { category: "Python", items: ["Backend", "FastAPI"] },
        { category: "C++", items: ["OOP"] },
      ],
      {
        bodyLeft: 245,
        recordWidth: 300,
        body: { fontSize: 9.5, lineHeight: 13.8, color: "#26313F", fontFamily: "Montserrat" },
        appendTop: 400,
        idFactory: (() => {
          let n = 0;
          return () => `s${++n}`;
        })(),
        stackGap: 4,
        recordGap: 10,
      },
    );
    assert.equal(bodies.length, 4);
    assert.equal(bodies[0].content, "Python");
    assert.equal(bodies[0].bold, true);
    assert.equal(bodies[0].fontSize, 9.5);
    assert.ok(bodies[1].content.includes("·"));
    assert.equal(bodies[1].bold, false);
    assert.equal(bodies[0].flowGroup, bodies[1].flowGroup);
    assert.notEqual(bodies[0].flowGroup, bodies[2].flowGroup);
    assert.equal(bodies[0].left, 245);
    assert.ok((Number(bodies[0].width) || 0) >= 280);
    assert.equal(bodies[0].preserveInitialLayout, false);
  });

  it("round-trips through sidebar content", () => {
    const groups = [
      { category: "Python", items: ["Backend", "FastAPI"] },
      { category: "Soft Skills", items: ["Teamwork"] },
    ];
    const text = formatSkillsSidebarContent(groups);
    assert.match(text, /Python/);
    assert.match(text, /• Backend/);
    assert.deepEqual(parseSkillsSidebarContent(text), groups);
  });
});

describe("restyleSkillsMembersAsMain / AsSidebar", () => {
  const railMembers = [
    { element_id: "sk-h", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 34, top: 400, fontSize: 9.4, height: 12, page: 1, bold: true, color: "#33517A" },
    { element_id: "sk-r", category: "line",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 34, top: 416, width: 22, height: 1.4, page: 1, backgroundColor: "#4A6FA5" },
    { element_id: "sk-b", category: "textarea",
      content: "Python\n• Backend development\n• REST APIs\nC++\n• OOP",
      flowRole: "content", flowLane: "sidebar", autoHeight: true, bulletList: true,
      left: 34, top: 430, width: 152, height: 200, fontSize: 8.3, lineHeight: 12, page: 1 },
  ];
  const mainStyle = {
    left: 245,
    bodyLeft: 245,
    recordWidth: 300,
    heading: {
      fontSize: 14, fontFamily: "Montserrat", color: "#26313F", letterSpacing: 0.8, bold: true,
    },
    rule: { width: 300, height: 1, backgroundColor: "#C7CFDA", relLeft: 0 },
    body: { fontSize: 9.5, lineHeight: 13.8, color: "#26313F", fontFamily: "Montserrat" },
  };

  it("expands rail skills into main subcategory records with Experience type", () => {
    const next = restyleSkillsMembersAsMain(railMembers, "sk-h", mainStyle, 10000, {
      stack: 4, record: 10, after_rule: 8,
    });
    assert.ok(next);
    const heading = next.find((element) => element.element_id === "sk-h");
    assert.equal(Number(heading.fontSize), 14);
    assert.equal(heading.color, "#26313F");
    assert.equal(heading.flowRole, "section-chrome");
    assert.equal(heading.flowLane, undefined);
    const categories = next.filter((element) => element.bold && element.flowRole === "content");
    assert.equal(categories.length, 2);
    assert.equal(categories[0].content, "Python");
    assert.ok(categories.every((element) => Number(element.width) >= 280));
    assert.ok(categories.every((element) => Number(element.left) === 245));
    const bodies = next.filter((element) => (
      element.flowRole === "content" && !element.bold
    ));
    assert.equal(bodies.length, 2);
    assert.equal(Number(bodies[0].fontSize), 9.5);
    assert.ok(bodies[0].content.includes("Backend"));
    assert.ok(bodies[1].content.includes("OOP"));
  });

  it("collapses main groups back to one sidebar textarea", () => {
    const main = restyleSkillsMembersAsMain(railMembers, "sk-h", mainStyle, 10000);
    const sourceIds = new Set(main.map((element) => element.element_id));
    const railStyle = {
      left: 34,
      bodyLeft: 34,
      recordWidth: 152,
      heading: { fontSize: 9.4, color: "#33517A", bold: true, letterSpacing: 1.3 },
      rule: { width: 22, height: 1.4, relLeft: 0 },
      body: { fontSize: 8.3, lineHeight: 12, color: "#26313F", fontFamily: "Montserrat" },
    };
    const back = restyleSkillsMembersAsSidebar(main, "sk-h", railStyle, 10000);
    assert.ok(back);
    const body = back.find((element) => element.element_id === "sk-b" || element.bulletList);
    assert.ok(body);
    assert.equal(sourceIds.has(body.element_id), false);
    assert.equal(body.flowLane, "sidebar");
    assert.ok((Number(body.width) || 0) < 200);
    const groups = collectSkillGroups(back, "sk-h");
    assert.equal(groups.length, 2);
    assert.equal(groups[0].category, "Python");
    assert.ok(groups[0].items.includes("Backend development"));

    const profileBeforeTransfer = {
      skills: [
        { category: "Python", items: ["Backend development", "REST APIs"] },
        { category: "C++", items: ["OOP"] },
      ],
    };
    assert.equal(
      syncCvDataFromCanvas(profileBeforeTransfer, main, back),
      profileBeforeTransfer,
    );
  });
});
