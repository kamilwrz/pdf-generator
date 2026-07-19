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

// Every template declares a category (drives the modal tabs) and the page-size
// preset it is designed for (applied on load).
export const TEMPLATE_CATEGORIES = [
    { id: "cv",   label: "CV" },
    { id: "deck", label: "Decks" },
];

export const TEMPLATES = [
    { id: "finance",   name: "Finance",   industry: "Finance · Classic",       accent: "#16243A", category: "cv",   pageSize: "a4-portrait", elements: financeTemplate },
    { id: "sterling",  name: "Sterling",  industry: "Finance · Engraved frame", accent: "#2E5E9E", category: "cv",   pageSize: "a4-portrait", elements: sterlingTemplate },
    { id: "it",        name: "IT",        industry: "IT · Modern + photo",      accent: "#2BB3C0", category: "cv",   pageSize: "a4-portrait", elements: itTemplate },
    { id: "education", name: "Education", industry: "Education · Academic",     accent: "#4E7A6B", category: "cv",   pageSize: "a4-portrait", elements: educationTemplate },
    { id: "nocturne",  name: "Nocturne",  industry: "Bold · Dark header",       accent: "#F25F4C", category: "cv",   pageSize: "a4-portrait", elements: nocturneTemplate },
    { id: "ampersand", name: "Ampersand", industry: "Editorial · Serif",        accent: "#7B2D3A", category: "cv",   pageSize: "a4-portrait", elements: ampersandTemplate },
    { id: "blueprint", name: "Blueprint", industry: "Technical · Grid",         accent: "#2B6CB0", category: "cv",   pageSize: "a4-portrait", elements: blueprintTemplate },
    { id: "monolith",  name: "Monolith",  industry: "Stark · Black & White",    accent: "#0A0A0A", category: "cv",   pageSize: "a4-portrait", elements: monolithTemplate },
    { id: "prism",     name: "Prism",     industry: "Creative · Colourful",     accent: "#6B21A8", category: "cv",   pageSize: "a4-portrait", elements: prismTemplate },
    { id: "aria",      name: "Aria",      industry: "Minimal · Breathing room", accent: "#AAAAAA", category: "cv",   pageSize: "a4-portrait", elements: ariaTemplate },
    { id: "meridian",  name: "Meridian",  industry: "Deck · Editorial serif",   accent: "#3E6DB5", category: "deck", pageSize: "deck-16-9",   elements: meridianTemplate },
    { id: "onyx",      name: "Onyx",      industry: "Deck · Dark & bold",       accent: "#F25F4C", category: "deck", pageSize: "deck-16-9",   elements: onyxTemplate },
    { id: "verdant",   name: "Verdant",   industry: "Deck · Calm green",        accent: "#3E7A5E", category: "deck", pageSize: "deck-16-9",   elements: verdantTemplate },
];
