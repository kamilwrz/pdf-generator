/**
 * Registry of built-in CV templates shown in pickers and Hero mockups.
 * `tier` drives Free vs paid gating; `elements` are static specs materialized
 * by useA4Elements.handleLoadTemplate (ids assigned at load time).
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

export const TEMPLATES = [
    { id: "ledger", tier: "free",    name: "Ledger",    industry: "Finanse · Instytucjonalny",        accent: "#2E5E86", elements: ledgerTemplate },
    { id: "nimbus", tier: "free",    name: "Nimbus",    industry: "Finanse · Jasny i minimalistyczny", accent: "#5F8EAD", elements: nimbusTemplate },
    { id: "cinder", tier: "paid",    name: "Cinder",    industry: "Finanse · Ciemny i wyrazisty",      accent: "#C93F3F", elements: cinderTemplate },
    { id: "rift", tier: "paid",      name: "Rift",      industry: "Finanse · Abstrakcyjny i redakcyjny", accent: "#E21B1B", elements: riftTemplate },
    { id: "vector", tier: "free",    name: "Vector",    industry: "IT · Sieci i platformy",             accent: "#26D8FF", elements: vectorTemplate },
    { id: "kernel", tier: "free",    name: "Kernel",    industry: "IT · Architektura systemów",         accent: "#D69B22", elements: kernelTemplate },
    { id: "relay", tier: "paid",     name: "Relay",     industry: "IT · DevOps i niezawodność",         accent: "#EE2525", elements: relayTemplate },
    { id: "scribe", tier: "free",    name: "Scribe",    industry: "Classic · Redakcyjny i formalny",    accent: "#34516A", elements: scribeTemplate },
    { id: "regent", tier: "free",    name: "Regent",    industry: "Classic · Executive",                accent: "#733B43", elements: regentTemplate },
    { id: "aldine", tier: "paid",    name: "Aldine",    industry: "Classic · Szlachetny papier",        accent: "#486151", elements: aldineTemplate },
    { id: "merit", tier: "paid",     name: "Merit",     industry: "Classic · Dyplomatyczny minimalizm", accent: "#4F6679", elements: meritTemplate },
    { id: "moss", tier: "paid",      name: "Moss",      industry: "Sidebar · Botaniczna elegancja",     accent: "#B99854", elements: mossTemplate },
    { id: "signal", tier: "paid",    name: "Signal",    industry: "Banking · Ryzyko i treasury",         accent: "#3BD2C7", elements: signalTemplate },
    { id: "obsidian", tier: "paid",  name: "Obsidian",  industry: "Darktheme · Panel boczny",            accent: "#C9A24B", elements: obsidianTemplate },
    { id: "raven", tier: "paid",     name: "Raven",     industry: "Darktheme · Pasek górny",             accent: "#3FBFA6", elements: ravenTemplate },
    { id: "graphite", tier: "free",  name: "Graphite",  industry: "Darktheme · Minimalistyczny",         accent: "#B7C3CC", elements: graphiteTemplate },
    { id: "onyx", tier: "paid",      name: "Onyx",      industry: "Darktheme · Rama dyplomatyczna",      accent: "#B08D57", elements: onyxTemplate },
    { id: "nova", tier: "free",      name: "Nova",      industry: "Iconic · Redakcyjny masthead",        accent: "#C45C26", elements: novaTemplate },
    { id: "ridge", tier: "paid",     name: "Ridge",     industry: "Iconic · Szyna ikon",                 accent: "#1F7A6C", elements: ridgeTemplate },
    { id: "loom", tier: "paid",      name: "Loom",      industry: "Iconic · Sidebar rzemieślniczy",      accent: "#C4A35A", elements: loomTemplate },
    { id: "volt", tier: "paid",      name: "Volt",      industry: "Iconic · Ciemny sygnał",              accent: "#E8A838", elements: voltTemplate },
    { id: "monument", tier: "paid",  name: "Monument",  industry: "Classic · Monochromatyczny editorial", accent: "#343434", elements: monumentTemplate },
    { id: "words", tier: "paid",     name: "Words",     industry: "Classic · Dokument Word",              accent: "#555555", elements: wordsTemplate },
];
