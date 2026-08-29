import { slateTemplate } from "./src/templates/slate.js";
import { transferSectionLane, resolveSectionLaneTransfer } from "./src/utils/transferSectionLane.js";
import { sidebarSectionElementIds, sectionElementIds } from "./src/utils/sectionStructure.js";

const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };
const withIds = (t) => t.map((el, i) => ({ ...el, element_id: el.element_id || `el-${i}` }));

function eduHead(els) {
  return els.find((e) => e.category === "text" && String(e.content).toUpperCase().includes("WYKSZTA"));
}

function dumpEdu(label, els, memberIds) {
  console.log(`  [${label}]`);
  for (const id of memberIds) {
    const a = els.find((e) => e.element_id === id);
    if (!a) { console.log("    (removed)", id); continue; }
    if (a.category === "textarea" || a.category === "text")
      console.log("    ", { id: a.element_id, role: a.flowRole, lane: a.flowLane, fs: a.fontSize, w: a.width, left: a.left, c: (a.content||"").slice(0,18) });
  }
}

function roundTrip(name, template) {
  console.log(`\n=== ${name} round trip (sidebar -> main -> sidebar) ===`);
  let els = withIds(template);
  const hid = eduHead(els).element_id;

  let ids = sidebarSectionElementIds(els, hid, 842);
  dumpEdu("start (sidebar)", els, ids);

  console.log("dir1:", resolveSectionLaneTransfer(els, hid, 842));
  els = transferSectionLane(els, hid, 842, SPACING);
  // now in main
  ids = sectionElementIds(els, hid, 842);
  dumpEdu("after -> main", els, ids);

  console.log("dir2:", resolveSectionLaneTransfer(els, hid, 842));
  els = transferSectionLane(els, hid, 842, SPACING);
  ids = sidebarSectionElementIds(els, hid, 842);
  dumpEdu("after -> sidebar", els, ids);
}

roundTrip("SLATE", slateTemplate);
