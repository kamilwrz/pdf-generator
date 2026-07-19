import { financeTemplate }   from "./finance";
import { itTemplate }        from "./it";
import { educationTemplate } from "./education";
import { nocturneTemplate }  from "./nocturne";
import { ampersandTemplate } from "./ampersand";
import { blueprintTemplate } from "./blueprint";
import { monolithTemplate }  from "./monolith";
import { prismTemplate }     from "./prism";
import { ariaTemplate }      from "./aria";
import { meridianTemplate, onyxTemplate, verdantTemplate } from "./meridian";
import { sterlingTemplate } from "./sterling";
import { gazetteTemplate } from "./gazette";
import { solsticeTemplate } from "./solstice";
import { mistralTemplate } from "./mistral";
import { axiomTemplate } from "./axiom";
import { vellumTemplate } from "./vellum";

// Every template declares a category (drives the modal tabs) and the page-size
// preset it is designed for (applied on load).
export const TEMPLATE_CATEGORIES = [
    { id: "cv",      label: "CV" },
    { id: "deck",    label: "Prezentacje" },
    { id: "article", label: "Artykuły" },
];

export const TEMPLATES = [
    { id: "finance",   name: "Finanse",   industry: "Finanse · Klasyczny",           accent: "#16243A", category: "cv",   pageSize: "a4-portrait", elements: financeTemplate },
    { id: "sterling",  name: "Sterling",  industry: "Finanse · Oprawa grawerowana",  accent: "#2E5E9E", category: "cv",   pageSize: "a4-portrait", elements: sterlingTemplate },
    { id: "it",        name: "IT",        industry: "IT · Nowoczesny + zdjęcie",     accent: "#2BB3C0", category: "cv",   pageSize: "a4-portrait", elements: itTemplate },
    { id: "education", name: "Edukacja",  industry: "Edukacja · Akademicki",         accent: "#4E7A6B", category: "cv",   pageSize: "a4-portrait", elements: educationTemplate },
    { id: "nocturne",  name: "Nocturne",  industry: "Odważny · Ciemny nagłówek",     accent: "#F25F4C", category: "cv",   pageSize: "a4-portrait", elements: nocturneTemplate },
    { id: "ampersand", name: "Ampersand", industry: "Redakcyjny · Szeryfowy",        accent: "#7B2D3A", category: "cv",   pageSize: "a4-portrait", elements: ampersandTemplate },
    { id: "blueprint", name: "Blueprint", industry: "Techniczny · Siatka",           accent: "#2B6CB0", category: "cv",   pageSize: "a4-portrait", elements: blueprintTemplate },
    { id: "monolith",  name: "Monolith",  industry: "Surowy · Czarno-biały",        accent: "#0A0A0A", category: "cv",   pageSize: "a4-portrait", elements: monolithTemplate },
    { id: "prism",     name: "Prism",     industry: "Kreatywny · Kolorowy",          accent: "#6B21A8", category: "cv",   pageSize: "a4-portrait", elements: prismTemplate },
    { id: "aria",      name: "Aria",      industry: "Minimalistyczny · Przestrzeń",  accent: "#AAAAAA", category: "cv",   pageSize: "a4-portrait", elements: ariaTemplate },
    { id: "solstice",  name: "Solstice",  industry: "Art Deco · Słoneczny",          accent: "#D99A32", category: "cv",   pageSize: "a4-portrait", elements: solsticeTemplate },
    { id: "mistral",   name: "Mistral",   industry: "Redakcyjny · Nadmorski",        accent: "#4D9AA6", category: "cv",   pageSize: "a4-portrait", elements: mistralTemplate },
    { id: "axiom",     name: "Axiom",     industry: "Architektoniczny · Geometryczny", accent: "#0D6E72", category: "cv",   pageSize: "a4-portrait", elements: axiomTemplate },
    { id: "vellum",    name: "Vellum",    industry: "Redakcyjny · Ciepły minimalizm",  accent: "#7C3B42", category: "cv",   pageSize: "a4-portrait", elements: vellumTemplate },
    { id: "meridian",  name: "Meridian",  industry: "Prezentacja · Szeryf redakcyjny", accent: "#3E6DB5", category: "deck", pageSize: "deck-16-9",   elements: meridianTemplate },
    { id: "onyx",      name: "Onyx",      industry: "Prezentacja · Ciemna i odważna",  accent: "#F25F4C", category: "deck", pageSize: "deck-16-9",   elements: onyxTemplate },
    { id: "verdant",   name: "Verdant",   industry: "Prezentacja · Spokojna zieleń",   accent: "#3E7A5E", category: "deck", pageSize: "deck-16-9",   elements: verdantTemplate },
    { id: "gazette",   name: "Gazette",   industry: "Artykuł · Gazeta",                accent: "#8C2F39", category: "article", pageSize: "a4-portrait", elements: gazetteTemplate },
];
