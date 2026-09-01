/**
 * Complete template packs for source-driven unit tests only.
 *
 * Production code must import `TEMPLATES` from `index.js`; keeping the paid
 * packs behind this test-only module prevents authored Pro geometry from being
 * bundled into the public application while preserving layout regression QA.
 */
import { monumentTemplate } from "./monument";
import { slateTemplate } from "./slate";
import { atriumTemplate } from "./atrium";
import { sterlingTemplate } from "./sterling";
import { regentTemplate } from "./regent";
import { meridianTemplate } from "./meridian";
import { lindenTemplate } from "./linden";
import { cadenzaTemplate } from "./cadenza";
import { vellumTemplate } from "./vellum";
import { aureliaTemplate } from "./aurelia";

export const TEST_TEMPLATES = [
  { id: "monument", elements: monumentTemplate },
  { id: "slate", elements: slateTemplate },
  { id: "atrium", elements: atriumTemplate },
  { id: "sterling", elements: sterlingTemplate },
  { id: "regent", elements: regentTemplate },
  { id: "meridian", elements: meridianTemplate },
  { id: "linden", elements: lindenTemplate },
  { id: "cadenza", elements: cadenzaTemplate },
  { id: "vellum", elements: vellumTemplate },
  { id: "aurelia", elements: aureliaTemplate },
];
