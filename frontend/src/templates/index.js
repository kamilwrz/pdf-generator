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
import { riftTemplate } from "./rift";
import { vectorTemplate } from "./vector";
import { kernelTemplate } from "./kernel";
import { relayTemplate } from "./relay";
import { scribeTemplate } from "./scribe";
import { regentTemplate } from "./regent";
import { aldineTemplate } from "./aldine";
import { meritTemplate } from "./merit";
import { mossTemplate } from "./moss";
import { signalTemplate } from "./banking";
import { obsidianTemplate } from "./obsidian";
import { ravenTemplate } from "./raven";
import { graphiteTemplate } from "./graphite";
import { onyxTemplate } from "./onyx";
import { loomTemplate, novaTemplate, ridgeTemplate, voltTemplate } from "./iconic";
import { monumentTemplate } from "./monument";
import { wordsTemplate } from "./words";
import { cardinalTemplate } from "./cardinal";
import { harborTemplate } from "./harbor";
import { tesseraTemplate } from "./tessera";

export { TEMPLATE_LAYOUT_TAGS } from "../utils/templateLayouts";

export const TEMPLATES = [
    { id: "ledger", tier: "free", name: "Ledger", description: "Instytucjonalny, spokojna typografia", layouts: ["single"], accent: "#2E5E86", elements: ledgerTemplate },
    { id: "nimbus", tier: "free", name: "Nimbus", description: "Jasny i minimalistyczny", layouts: ["single"], accent: "#5F8EAD", elements: nimbusTemplate },
    { id: "cinder", tier: "paid", name: "Cinder", description: "Ciemny i wyrazisty", layouts: ["single"], accent: "#C93F3F", elements: cinderTemplate },
    { id: "rift", tier: "paid", name: "Rift", description: "Abstrakcyjny i redakcyjny", layouts: ["single"], accent: "#E21B1B", elements: riftTemplate },
    { id: "vector", tier: "free", name: "Vector", description: "Sieci i platformy", layouts: ["single"], accent: "#26D8FF", elements: vectorTemplate },
    { id: "kernel", tier: "free", name: "Kernel", description: "Architektura systemów", layouts: ["single"], accent: "#D69B22", elements: kernelTemplate },
    { id: "relay", tier: "paid", name: "Relay", description: "DevOps i niezawodność", layouts: ["single"], accent: "#EE2525", elements: relayTemplate },
    { id: "scribe", tier: "free", name: "Scribe", description: "Redakcyjny i formalny", layouts: ["single"], accent: "#34516A", elements: scribeTemplate },
    { id: "regent", tier: "free", name: "Regent", description: "Executive, wyważona elegancja", layouts: ["single"], accent: "#733B43", elements: regentTemplate },
    { id: "aldine", tier: "paid", name: "Aldine", description: "Szlachetny papier", layouts: ["single"], accent: "#486151", elements: aldineTemplate },
    { id: "merit", tier: "paid", name: "Merit", description: "Dyplomatyczny minimalizm", layouts: ["single"], accent: "#4F6679", elements: meritTemplate },
    { id: "monument", tier: "paid", name: "Monument", description: "Monochromatyczny editorial", layouts: ["single"], accent: "#343434", elements: monumentTemplate },
    { id: "words", tier: "paid", name: "Words", description: "Dokument w stylu Word", layouts: ["single"], accent: "#555555", elements: wordsTemplate },
    { id: "cardinal", tier: "paid", name: "Cardinal", description: "Szlachetna czerwień, ikony przy sekcjach", layouts: ["icons"], accent: "#9E2532", elements: cardinalTemplate },
    { id: "moss", tier: "paid", name: "Moss", description: "Botaniczny sidebar ze zdjęciem", layouts: ["sidebar"], accent: "#B99854", elements: mossTemplate },
    { id: "harbor", tier: "paid", name: "Harbor", description: "Dwukolumnowy, ikony kontaktu", layouts: ["sidebar", "icons"], accent: "#17A2B8", elements: harborTemplate },
    { id: "signal", tier: "paid", name: "Signal", description: "Ryzyko i treasury", layouts: ["single"], accent: "#3BD2C7", elements: signalTemplate },
    { id: "obsidian", tier: "paid", name: "Obsidian", description: "Ciemny panel boczny", layouts: ["sidebar", "dark"], accent: "#C9A24B", elements: obsidianTemplate },
    { id: "raven", tier: "paid", name: "Raven", description: "Ciemny pasek górny", layouts: ["dark"], accent: "#3FBFA6", elements: ravenTemplate },
    { id: "graphite", tier: "free", name: "Graphite", description: "Minimalistyczny, chłodne srebro", layouts: ["dark"], accent: "#B7C3CC", elements: graphiteTemplate },
    { id: "onyx", tier: "paid", name: "Onyx", description: "Rama dyplomatyczna", layouts: ["dark"], accent: "#B08D57", elements: onyxTemplate },
    { id: "nova", tier: "free", name: "Nova", description: "Redakcyjny masthead z ikonami", layouts: ["icons"], accent: "#C45C26", elements: novaTemplate },
    { id: "ridge", tier: "paid", name: "Ridge", description: "Szyna ikon przy nagłówkach", layouts: ["icons"], accent: "#1F7A6C", elements: ridgeTemplate },
    { id: "loom", tier: "paid", name: "Loom", description: "Sidebar rzemieślniczy z ikonami", layouts: ["sidebar", "icons"], accent: "#C4A35A", elements: loomTemplate },
    { id: "volt", tier: "paid", name: "Volt", description: "Ciemny sygnał, bursztynowe akcenty", layouts: ["icons", "dark"], accent: "#E8A838", elements: voltTemplate },
    { id: "tessera", tier: "paid", name: "Tessera", description: "Mozaikowy sidebar, prostokątne zdjęcie", layouts: ["sidebar", "icons"], accent: "#E15D4F", elements: tesseraTemplate },
];
