import { ledgerTemplate } from "./ledger";
import { nimbusTemplate } from "./nimbus";
import { cinderTemplate } from "./cinder";
import { riftTemplate } from "./rift";
import { vectorTemplate } from "./vector";
import { kernelTemplate } from "./kernel";
import { relayTemplate } from "./relay";
import { latticeTemplate } from "./lattice";
import { scribeTemplate } from "./scribe";
import { regentTemplate } from "./regent";
import { aldineTemplate } from "./aldine";
import { meritTemplate } from "./merit";
import { quarryTemplate } from "./quarry";
import { mossTemplate } from "./moss";
import { garnetTemplate } from "./garnet";
import { harborTemplate } from "./harbor";
import { clearingTemplate, heraldTemplate, signalTemplate, vaultTemplate } from "./banking";
import { obsidianTemplate } from "./obsidian";
import { ravenTemplate } from "./raven";
import { graphiteTemplate } from "./graphite";
import { onyxTemplate } from "./onyx";

export const TEMPLATES = [
    { id: "ledger", tier: "free",    name: "Ledger",    industry: "Finanse · Instytucjonalny",        accent: "#2E5E86", elements: ledgerTemplate },
    { id: "nimbus", tier: "free",    name: "Nimbus",    industry: "Finanse · Jasny i minimalistyczny", accent: "#5F8EAD", elements: nimbusTemplate },
    { id: "cinder", tier: "paid",    name: "Cinder",    industry: "Finanse · Ciemny i wyrazisty",      accent: "#C93F3F", elements: cinderTemplate },
    { id: "rift", tier: "paid",      name: "Rift",      industry: "Finanse · Abstrakcyjny i redakcyjny", accent: "#E21B1B", elements: riftTemplate },
    { id: "vector", tier: "free",    name: "Vector",    industry: "IT · Sieci i platformy",             accent: "#26D8FF", elements: vectorTemplate },
    { id: "kernel", tier: "free",    name: "Kernel",    industry: "IT · Architektura systemów",         accent: "#D69B22", elements: kernelTemplate },
    { id: "relay", tier: "paid",     name: "Relay",     industry: "IT · DevOps i niezawodność",         accent: "#EE2525", elements: relayTemplate },
    { id: "lattice", tier: "paid",   name: "Lattice",   industry: "IT · Produkty i usługi cyfrowe",     accent: "#5B62BA", elements: latticeTemplate },
    { id: "scribe", tier: "free",    name: "Scribe",    industry: "Classic · Redakcyjny i formalny",    accent: "#34516A", elements: scribeTemplate },
    { id: "regent", tier: "free",    name: "Regent",    industry: "Classic · Executive",                accent: "#733B43", elements: regentTemplate },
    { id: "aldine", tier: "paid",    name: "Aldine",    industry: "Classic · Szlachetny papier",        accent: "#486151", elements: aldineTemplate },
    { id: "merit", tier: "paid",     name: "Merit",     industry: "Classic · Dyplomatyczny minimalizm", accent: "#4F6679", elements: meritTemplate },
    { id: "quarry", tier: "free",    name: "Quarry",    industry: "Sidebar · Nocny system",             accent: "#37D1EE", elements: quarryTemplate },
    { id: "moss", tier: "paid",      name: "Moss",      industry: "Sidebar · Botaniczna elegancja",     accent: "#B99854", elements: mossTemplate },
    { id: "garnet", tier: "paid",    name: "Garnet",    industry: "Sidebar · Art déco executive",       accent: "#C7A66A", elements: garnetTemplate },
    { id: "harbor", tier: "paid",    name: "Harbor",    industry: "Sidebar · Morski minimalizm",        accent: "#B78355", elements: harborTemplate },
    { id: "vault", tier: "paid",     name: "Vault",     industry: "Banking · Private banking",           accent: "#B79A56", elements: vaultTemplate },
    { id: "clearing", tier: "paid",  name: "Clearing",  industry: "Banking · Operacje i płatności",      accent: "#48B8C8", elements: clearingTemplate },
    { id: "herald", tier: "paid",    name: "Herald",    industry: "Banking · Wealth management",         accent: "#9D3341", elements: heraldTemplate },
    { id: "signal", tier: "paid",    name: "Signal",    industry: "Banking · Ryzyko i treasury",         accent: "#3BD2C7", elements: signalTemplate },
    { id: "obsidian", tier: "paid",  name: "Obsidian",  industry: "Darktheme · Panel boczny",            accent: "#C9A24B", elements: obsidianTemplate },
    { id: "raven", tier: "paid",     name: "Raven",     industry: "Darktheme · Pasek górny",             accent: "#3FBFA6", elements: ravenTemplate },
    { id: "graphite", tier: "free",  name: "Graphite",  industry: "Darktheme · Minimalistyczny",         accent: "#B7C3CC", elements: graphiteTemplate },
    { id: "onyx", tier: "paid",      name: "Onyx",      industry: "Darktheme · Rama dyplomatyczna",      accent: "#B08D57", elements: onyxTemplate },
];
