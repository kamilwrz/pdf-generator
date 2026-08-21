import { readFileSync } from "node:fs";
import { transferSectionLane, resolveSectionLaneTransfer } from "./src/utils/transferSectionLane.js";
import { sidebarSectionElementIds, sectionElementIds } from "./src/utils/sectionStructure.js";

const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };
const els0 = JSON.parse(readFileSync("./slate_gen.json", "utf8"));

const eduHead = els0.find((e) => e.category === "text" && String(e.content).toUpperCase().includes("WYKSZTA"));
const hid = eduHead.element_id;

console.log("=== REAL GENERATED SLATE: education sidebar -> main ===");
console.log("dir:", resolveSectionLaneTransfer(els0, hid, 842));
let ids = sidebarSectionElementIds(els0, hid, 842);
console.log("member count:", ids.size, "ids:", [...ids]);

const after = transferSectionLane(els0, hid, 842, SPACING);
if (!after) { console.log("TRANSFER RETURNED NULL"); process.exit(0); }

console.log("--- education records AFTER transfer to main ---");
for (const id of ids) {
  const a = after.find((e) => e.element_id === id);
  if (!a) { console.log("  removed:", id); continue; }
  if (a.category === "textarea" || a.category === "text")
    console.log("  ", { id, cat: a.category, role: a.flowRole, lane: a.flowLane, fs: a.fontSize, w: a.width, left: a.left, c: String(a.content||"").slice(0,22) });
}
