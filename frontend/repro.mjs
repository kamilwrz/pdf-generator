import { slateTemplate } from "./src/templates/slate.js";
import { transferSectionLane } from "./src/utils/transferSectionLane.js";
import { isSidebarSectionHeading, sidebarSectionElementIds } from "./src/utils/sectionStructure.js";

const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };

function withIds(template) {
  return template.map((el, i) => ({ ...el, element_id: el.element_id || `el-${i}` }));
}

function run(name, template) {
  const elements = withIds(template);
  const eduHeading = elements.find(
    (e) => e.category === "text" && String(e.content).toUpperCase().includes("WYKSZTA"),
  );
  console.log(`\n=== ${name} ===`);
  if (!eduHeading) { console.log("no education heading found"); return; }
  console.log("edu heading id:", eduHeading.element_id, "flowLane:", eduHeading.flowLane, "flowRole:", eduHeading.flowRole);
  console.log("isSidebarSectionHeading:", isSidebarSectionHeading(eduHeading));

  const memberIds = sidebarSectionElementIds(elements, eduHeading.element_id, 842);
  console.log("member count:", memberIds.size);
  const members = elements.filter((e) => memberIds.has(e.element_id));
  for (const m of members) {
    console.log("  member:", { id: m.element_id, cat: m.category, role: m.flowRole, fs: m.fontSize, w: m.width, left: m.left, content: (m.content||"").slice(0,24) });
  }

  const after = transferSectionLane(elements, eduHeading.element_id, 842, SPACING);
  if (!after) { console.log("transfer returned null!"); return; }

  console.log("--- AFTER ---");
  for (const m of members) {
    const a = after.find((e) => e.element_id === m.element_id);
    if (!a) { console.log("  member removed:", m.element_id); continue; }
    console.log("  member:", { id: a.element_id, cat: a.category, role: a.flowRole, lane: a.flowLane, fs: a.fontSize, w: a.width, left: a.left });
  }
}

run("SLATE", slateTemplate);
