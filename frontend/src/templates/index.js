import { financeTemplate } from "./finance";
import { itTemplate } from "./it";
import { educationTemplate } from "./education";
import { nocturneTemplate } from "./nocturne";
import { ampersandTemplate } from "./ampersand";
import { blueprintTemplate } from "./blueprint";

export const TEMPLATES = [
    { id: "finance", name: "Finance", industry: "Finance · Classic", accent: "#16243A", elements: financeTemplate },
    { id: "it", name: "IT", industry: "IT · Modern + photo", accent: "#2BB3C0", elements: itTemplate },
    { id: "education", name: "Education", industry: "Education · Academic", accent: "#4E7A6B", elements: educationTemplate },
    { id: "nocturne", name: "Nocturne", industry: "Bold · Dark header", accent: "#F25F4C", elements: nocturneTemplate },
    { id: "ampersand", name: "Ampersand", industry: "Editorial · Serif", accent: "#7B2D3A", elements: ampersandTemplate },
    { id: "blueprint", name: "Blueprint", industry: "Technical · Grid", accent: "#2B6CB0", elements: blueprintTemplate },
];
