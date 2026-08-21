/**
 * Registry of built-in CV templates shown in pickers and Hero mockups.
 *
 * Each entry is an individual product template: `name` + short stylistic
 * `description` for the UI. `layouts` is code-only metadata so generators and
 * reflow can share sidebar / icons / dark behaviour without industry or style
 * collections. `tier` drives Free vs paid gating; `elements` are static specs
 * materialized by useA4Elements.handleLoadTemplate (ids assigned at load time).
 */
import { novaTemplate, voltTemplate } from "./iconic";
import { monumentTemplate } from "./monument";
import { harborTemplate } from "./harbor";
import { tesseraTemplate } from "./tessera";
import { slateTemplate } from "./slate";
import { porticoTemplate } from "./portico";
import { axisTemplate } from "./axis";
import { atriumTemplate } from "./atrium";
import { sterlingTemplate } from "./sterling";
import { regentTemplate } from "./regent";
import { vestigeTemplate } from "./vestige";

export { TEMPLATE_LAYOUT_TAGS } from "../utils/templateLayouts";

export const TEMPLATES = [
    { id: "monument", tier: "paid", name: "Monument", description: "Monochromatyczny editorial", layouts: ["single"], accent: "#343434", elements: monumentTemplate },
    { id: "harbor", tier: "paid", name: "Harbor", description: "Dwukolumnowy, ikony kontaktu", layouts: ["sidebar", "icons"], accent: "#17A2B8", elements: harborTemplate },
    { id: "nova", tier: "free", name: "Nova", description: "Redakcyjny masthead z ikonami", layouts: ["icons"], accent: "#C45C26", elements: novaTemplate },
    { id: "volt", tier: "paid", name: "Volt", description: "Ciemny sygnał, bursztynowe akcenty", layouts: ["icons", "dark"], accent: "#E8A838", elements: voltTemplate },
    { id: "tessera", tier: "paid", name: "Tessera", description: "Mozaikowy sidebar, prostokątne zdjęcie", layouts: ["sidebar", "icons"], accent: "#E15D4F", elements: tesseraTemplate },
    { id: "slate", tier: "paid", name: "Slate", description: "Stalowy sidebar, siatka i prostokątne zdjęcie", layouts: ["sidebar", "icons"], accent: "#3E5C76", elements: slateTemplate },
    { id: "portico", tier: "paid", name: "Portico", description: "Wycentrowany nagłówek, ikony, spokojny minimalizm", layouts: ["icons"], accent: "#7C6A52", elements: porticoTemplate },
    { id: "axis", tier: "paid", name: "Axis", description: "Oś czasu z datami na marginesie, akcenty pomarańczowo-morskie", layouts: ["icons"], accent: "#E2740C", elements: axisTemplate },
    { id: "atrium", tier: "paid", name: "Atrium", description: "Wycentrowana editorialna kompozycja z drukarskim mikro-ornamentem", layouts: ["single", "icons"], accent: "#556158", elements: atriumTemplate },
    { id: "sterling", tier: "paid", name: "Sterling", description: "Elegancki, niebiesko-szary układ z szerokim sidebarem", layouts: ["sidebar"], accent: "#4A6FA5", elements: sterlingTemplate },
    { id: "regent", tier: "paid", name: "Regent", description: "Klasyczna monochromatyczna typografia executive", layouts: ["single", "icons"], accent: "#151515", elements: regentTemplate },
    { id: "vestige", tier: "paid", name: "Vestige", description: "Klasyczny, monochromatyczny układ z wąskim sidebarem", layouts: ["sidebar", "icons"], accent: "#3E3E3C", elements: vestigeTemplate },
];
