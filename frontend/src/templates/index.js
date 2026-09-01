/**
 * Registry of built-in CV templates shown in pickers and Hero mockups.
 *
 * Each entry is an individual product template: `name` + short stylistic
 * `description` for the UI. `layouts` is code-only metadata so generators and
 * reflow can share sidebar / icons / dark behaviour without industry or style
 * collections. `tier` drives Free vs paid gating. Only Free starter packs are
 * shipped to the browser; Pro geometry is materialized by the entitlement-
 * gated backend generator after selection.
 */
import { sterlingTemplate } from "./sterling";
import { meridianTemplate } from "./meridian";
import { lindenTemplate } from "./linden";

export { TEMPLATE_LAYOUT_TAGS } from "../utils/templateLayouts";

export const TEMPLATES = [
    { id: "monument", tier: "paid", name: "Monument", description: "Monochromatyczny editorial", layouts: ["single"], accent: "#343434", serverMaterialized: true },
    { id: "slate", tier: "paid", name: "Slate", description: "Stalowy sidebar, siatka i prostokątne zdjęcie", layouts: ["sidebar", "icons"], accent: "#3E5C76", serverMaterialized: true },
    { id: "atrium", tier: "paid", name: "Atrium", description: "Architektoniczny editorial z sześcioma paletami Wyglądu", layouts: ["single", "icons"], accent: "#556158", serverMaterialized: true },
    { id: "sterling", tier: "free", name: "Sterling", description: "Elegancki, niebiesko-szary układ z szerokim sidebarem", layouts: ["sidebar"], accent: "#4A6FA5", elements: sterlingTemplate },
    { id: "regent", tier: "paid", name: "Regent", description: "Klasyczna monochromatyczna typografia executive", layouts: ["single", "icons"], accent: "#151515", serverMaterialized: true },
    { id: "meridian", tier: "free", name: "Meridian", description: "Granatowo-niebieski układ executive w jednej kolumnie", layouts: ["single", "icons"], accent: "#3D5A80", elements: meridianTemplate },
    { id: "linden", tier: "free", name: "Linden", description: "Botaniczny editorial, prostokątne zdjęcie i leśna zieleń", layouts: ["sidebar", "icons"], accent: "#285548", elements: lindenTemplate },
    { id: "cadenza", tier: "paid", name: "Cadenza", description: "Klasyczny editorial, pasy sekcji i prawa oś dat", layouts: ["single", "icons"], accent: "#855C46", serverMaterialized: true },
    { id: "vellum", tier: "paid", name: "Vellum", description: "Portretowy editorial, miękkie pole résumé i prawa oś dat", layouts: ["single", "icons"], accent: "#8A5E47", serverMaterialized: true },
];
