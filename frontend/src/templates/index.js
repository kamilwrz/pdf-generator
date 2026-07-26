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

export const TEMPLATES = [
    { id: "ledger",    name: "Ledger",    industry: "Finanse · Instytucjonalny",        accent: "#2E5E86", pageSize: "a4-portrait", elements: ledgerTemplate },
    { id: "nimbus",    name: "Nimbus",    industry: "Finanse · Jasny i minimalistyczny", accent: "#5F8EAD", pageSize: "a4-portrait", elements: nimbusTemplate },
    { id: "cinder",    name: "Cinder",    industry: "Finanse · Ciemny i wyrazisty",      accent: "#C93F3F", pageSize: "a4-portrait", elements: cinderTemplate },
    { id: "rift",      name: "Rift",      industry: "Finanse · Abstrakcyjny i redakcyjny", accent: "#E21B1B", pageSize: "a4-portrait", elements: riftTemplate },
    { id: "vector",    name: "Vector",    industry: "IT · Sieci i platformy",             accent: "#26D8FF", pageSize: "a4-portrait", elements: vectorTemplate },
    { id: "kernel",    name: "Kernel",    industry: "IT · Architektura systemów",         accent: "#D69B22", pageSize: "a4-portrait", elements: kernelTemplate },
    { id: "relay",     name: "Relay",     industry: "IT · DevOps i niezawodność",         accent: "#EE2525", pageSize: "a4-portrait", elements: relayTemplate },
    { id: "lattice",   name: "Lattice",   industry: "IT · Produkty i usługi cyfrowe",     accent: "#5B62BA", pageSize: "a4-portrait", elements: latticeTemplate },
    { id: "scribe",    name: "Scribe",    industry: "Classic · Redakcyjny i formalny",    accent: "#34516A", pageSize: "a4-portrait", elements: scribeTemplate },
    { id: "regent",    name: "Regent",    industry: "Classic · Executive",                accent: "#733B43", pageSize: "a4-portrait", elements: regentTemplate },
    { id: "aldine",    name: "Aldine",    industry: "Classic · Szlachetny papier",        accent: "#486151", pageSize: "a4-portrait", elements: aldineTemplate },
    { id: "merit",     name: "Merit",     industry: "Classic · Dyplomatyczny minimalizm", accent: "#4F6679", pageSize: "a4-portrait", elements: meritTemplate },
    { id: "quarry",    name: "Quarry",    industry: "Sidebar · Nocny system",             accent: "#37D1EE", pageSize: "a4-portrait", elements: quarryTemplate },
    { id: "moss",      name: "Moss",      industry: "Sidebar · Botaniczna elegancja",     accent: "#B99854", pageSize: "a4-portrait", elements: mossTemplate },
    { id: "garnet",    name: "Garnet",    industry: "Sidebar · Art déco executive",       accent: "#C7A66A", pageSize: "a4-portrait", elements: garnetTemplate },
    { id: "harbor",    name: "Harbor",    industry: "Sidebar · Morski minimalizm",        accent: "#B78355", pageSize: "a4-portrait", elements: harborTemplate },
    { id: "vault",     name: "Vault",     industry: "Banking · Private banking",           accent: "#B79A56", pageSize: "a4-portrait", elements: vaultTemplate },
    { id: "clearing",  name: "Clearing",  industry: "Banking · Operacje i płatności",      accent: "#48B8C8", pageSize: "a4-portrait", elements: clearingTemplate },
    { id: "herald",    name: "Herald",    industry: "Banking · Wealth management",         accent: "#9D3341", pageSize: "a4-portrait", elements: heraldTemplate },
    { id: "signal",    name: "Signal",    industry: "Banking · Ryzyko i treasury",         accent: "#3BD2C7", pageSize: "a4-portrait", elements: signalTemplate },
];
