import { meridianTemplate, onyxTemplate, verdantTemplate } from "./meridian";
import { gazetteTemplate } from "./gazette";

// Every template declares a category (drives the modal tabs) and the page-size
// preset it is designed for (applied on load).
export const TEMPLATE_CATEGORIES = [
    { id: "deck",    label: "Prezentacje" },
    { id: "article", label: "Artykuły" },
];

export const TEMPLATES = [
    { id: "meridian",  name: "Meridian",  industry: "Prezentacja · Szeryf redakcyjny", accent: "#3E6DB5", category: "deck", pageSize: "deck-16-9",   elements: meridianTemplate },
    { id: "onyx",      name: "Onyx",      industry: "Prezentacja · Ciemna i odważna",  accent: "#F25F4C", category: "deck", pageSize: "deck-16-9",   elements: onyxTemplate },
    { id: "verdant",   name: "Verdant",   industry: "Prezentacja · Spokojna zieleń",   accent: "#3E7A5E", category: "deck", pageSize: "deck-16-9",   elements: verdantTemplate },
    { id: "gazette",   name: "Gazette",   industry: "Artykuł · Gazeta",                accent: "#8C2F39", category: "article", pageSize: "a4-portrait", elements: gazetteTemplate },
];
