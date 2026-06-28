import { financeTemplate } from "./finance";
import { itTemplate } from "./it";
import { educationTemplate } from "./education";

export const TEMPLATES = [
    { id: "finance", name: "Finance", industry: "Finance · Classic", accent: "#16243A", elements: financeTemplate },
    { id: "it", name: "IT", industry: "IT · Modern + photo", accent: "#2BB3C0", elements: itTemplate },
    { id: "education", name: "Education", industry: "Education · Academic", accent: "#4E7A6B", elements: educationTemplate },
];
