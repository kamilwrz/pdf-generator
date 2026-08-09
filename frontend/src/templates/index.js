/**
 * Registry of built-in CV templates shown in pickers and Hero mockups.
 *
 * Each entry is an individual product template: `name` + short stylistic
 * `description` for the UI. `layouts` is code-only metadata so generators and
 * reflow can share sidebar / icons / dark behaviour without industry or style
 * collections. `tier` drives Free vs paid gating; `elements` are static specs
 * materialized by useA4Elements.handleLoadTemplate (ids assigned at load time).
 */
import { ledgerTemplate } from "./ledger";
import { nimbusTemplate } from "./nimbus";
import { cinderTemplate } from "./cinder";
import { kernelTemplate } from "./kernel";
import { regentTemplate } from "./regent";
import { aldineTemplate } from "./aldine";
import { novaTemplate, voltTemplate } from "./iconic";
import { monumentTemplate } from "./monument";
import { wordsTemplate } from "./words";
import { cardinalTemplate } from "./cardinal";
import { harborTemplate } from "./harbor";
import { tesseraTemplate } from "./tessera";
import { slateTemplate } from "./slate";
import { porticoTemplate } from "./portico";

export { TEMPLATE_LAYOUT_TAGS } from "../utils/templateLayouts";

export const TEMPLATES = [
    { id: "ledger", tier: "free", name: "Ledger", description: "Instytucjonalny, spokojna typografia", layouts: ["single"], accent: "#2E5E86", elements: ledgerTemplate },
    { id: "nimbus", tier: "free", name: "Nimbus", description: "Jasny i minimalistyczny", layouts: ["single"], accent: "#5F8EAD", elements: nimbusTemplate },
    { id: "cinder", tier: "paid", name: "Cinder", description: "Ciemny i wyrazisty", layouts: ["single"], accent: "#C93F3F", elements: cinderTemplate },
    { id: "kernel", tier: "free", name: "Kernel", description: "Architektura systemów", layouts: ["single"], accent: "#D69B22", elements: kernelTemplate },
    { id: "regent", tier: "free", name: "Regent", description: "Executive, wyważona elegancja", layouts: ["single"], accent: "#733B43", elements: regentTemplate },
    { id: "aldine", tier: "paid", name: "Aldine", description: "Szlachetny papier", layouts: ["single"], accent: "#486151", elements: aldineTemplate },
    { id: "monument", tier: "paid", name: "Monument", description: "Monochromatyczny editorial", layouts: ["single"], accent: "#343434", elements: monumentTemplate },
    { id: "words", tier: "paid", name: "Words", description: "Dokument w stylu Word", layouts: ["single"], accent: "#555555", elements: wordsTemplate },
    { id: "cardinal", tier: "paid", name: "Cardinal", description: "Szlachetna czerwień, ikony przy sekcjach", layouts: ["icons"], accent: "#9E2532", elements: cardinalTemplate },
    { id: "harbor", tier: "paid", name: "Harbor", description: "Dwukolumnowy, ikony kontaktu", layouts: ["sidebar", "icons"], accent: "#17A2B8", elements: harborTemplate },
    { id: "nova", tier: "free", name: "Nova", description: "Redakcyjny masthead z ikonami", layouts: ["icons"], accent: "#C45C26", elements: novaTemplate },
    { id: "volt", tier: "paid", name: "Volt", description: "Ciemny sygnał, bursztynowe akcenty", layouts: ["icons", "dark"], accent: "#E8A838", elements: voltTemplate },
    { id: "tessera", tier: "paid", name: "Tessera", description: "Mozaikowy sidebar, prostokątne zdjęcie", layouts: ["sidebar", "icons"], accent: "#E15D4F", elements: tesseraTemplate },
    { id: "slate", tier: "paid", name: "Slate", description: "Stalowy sidebar, siatka i prostokątne zdjęcie", layouts: ["sidebar", "icons"], accent: "#3E5C76", elements: slateTemplate },
    { id: "portico", tier: "paid", name: "Portico", description: "Wycentrowany nagłówek, ikony, spokojny minimalizm", layouts: ["icons"], accent: "#7C6A52", elements: porticoTemplate },
];
