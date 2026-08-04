/**
 * CV template list for wizards and change-template flows.
 * Preserves registry order so every picker shows the same individual templates
 * (no industry/style collections).
 */
import { listTemplatesInRegistryOrder } from "./templateLayouts.js";

export const selectCvTemplates = (templates) => listTemplatesInRegistryOrder(templates);
