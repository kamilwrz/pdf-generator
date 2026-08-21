import { readFileSync } from "node:fs";
import { transferSectionLane } from "./src/utils/transferSectionLane.js";
import { sidebarSectionElementIds } from "./src/utils/sectionStructure.js";
import { reconcileDocumentPages } from "./src/utils/structureOperation.js";
import { collapseSpilledMainIntoSidebar } from "./src/utils/collapseMainIntoSidebar.js";

const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };
const els0 = JSON.parse(readFileSync("./slate_gen.json", "utf8"));
const eduHead = els0.find((e) => e.category === "text" && String(e.content).toUpperCase().includes("WYKSZTA"));
const hid = eduHead.element_id;
const ids = sidebarSectionElementIds(els0, hid, 842);

let id = 0;
const createId = () => `new-${++id}`;

const afterTransfer = transferSectionLane(els0, hid, 842, SPACING);

function report(label, els) {
  const maxPage = Math.max(...els.map((e) => e.page || 1));
  console.log(`\n[${label}] pages=${maxPage}`);
  for (const eid of ids) {
    const a = els.find((e) => e.element_id === eid);
    if (!a) { console.log("  removed:", eid); continue; }
    if (a.category === "textarea")
      console.log("  ", { role: a.flowRole, lane: a.flowLane, w: a.width, left: a.left, page: a.page, c: String(a.content||"").slice(0,18) });
  }
}

report("after transferSectionLane", afterTransfer);

const reconciled = reconcileDocumentPages(afterTransfer, createId, { collapseEmpty: true });
report("after reconcileDocumentPages", reconciled.elements);

const collapsed = collapseSpilledMainIntoSidebar(reconciled.elements, { pageHeight: 842, spacing: SPACING });
report("after collapseSpilledMainIntoSidebar", collapsed);
