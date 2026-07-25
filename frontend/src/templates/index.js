import { meridianTemplate, onyxTemplate, verdantTemplate } from "./meridian";
import { gazetteTemplate } from "./gazette";
import { ledgerTemplate } from "./ledger";
import { nimbusTemplate } from "./nimbus";
import { cinderTemplate } from "./cinder";
import { riftTemplate } from "./rift";
import { vectorTemplate } from "./vector";
import { kernelTemplate } from "./kernel";
import { relayTemplate } from "./relay";
import { latticeTemplate } from "./lattice";

// Every template declares a category (drives the modal tabs) and the page-size
// preset it is designed for (applied on load).
export const TEMPLATE_CATEGORIES = [
    { id: "cv",      label: "CV" },
    { id: "deck",    label: "Prezentacje" },
    { id: "article", label: "Artykuły" },
];

export const TEMPLATES = [
    { id: "ledger",    name: "Ledger",    industry: "Finanse · Instytucjonalny",        accent: "#2E5E86", category: "cv",      pageSize: "a4-portrait", elements: ledgerTemplate },
    { id: "nimbus",    name: "Nimbus",    industry: "Finanse · Jasny i minimalistyczny", accent: "#5F8EAD", category: "cv",      pageSize: "a4-portrait", elements: nimbusTemplate },
    { id: "cinder",    name: "Cinder",    industry: "Finanse · Ciemny i wyrazisty",      accent: "#C93F3F", category: "cv",      pageSize: "a4-portrait", elements: cinderTemplate },
    { id: "rift",      name: "Rift",      industry: "Finanse · Abstrakcyjny i redakcyjny", accent: "#E21B1B", category: "cv",      pageSize: "a4-portrait", elements: riftTemplate },
    { id: "vector",    name: "Vector",    industry: "IT · Sieci i platformy",             accent: "#26D8FF", category: "cv",      pageSize: "a4-portrait", elements: vectorTemplate },
    { id: "kernel",    name: "Kernel",    industry: "IT · Architektura systemów",         accent: "#D69B22", category: "cv",      pageSize: "a4-portrait", elements: kernelTemplate },
    { id: "relay",     name: "Relay",     industry: "IT · DevOps i niezawodność",         accent: "#EE2525", category: "cv",      pageSize: "a4-portrait", elements: relayTemplate },
    { id: "lattice",   name: "Lattice",   industry: "IT · Produkty i usługi cyfrowe",     accent: "#5B62BA", category: "cv",      pageSize: "a4-portrait", elements: latticeTemplate },
    { id: "meridian",  name: "Meridian",  industry: "Prezentacja · Szeryf redakcyjny", accent: "#3E6DB5", category: "deck", pageSize: "deck-16-9",   elements: meridianTemplate },
    { id: "onyx",      name: "Onyx",      industry: "Prezentacja · Ciemna i odważna",  accent: "#F25F4C", category: "deck", pageSize: "deck-16-9",   elements: onyxTemplate },
    { id: "verdant",   name: "Verdant",   industry: "Prezentacja · Spokojna zieleń",   accent: "#3E7A5E", category: "deck", pageSize: "deck-16-9",   elements: verdantTemplate },
    { id: "gazette",   name: "Gazette",   industry: "Artykuł · Gazeta",                accent: "#8C2F39", category: "article", pageSize: "a4-portrait", elements: gazetteTemplate },
];
