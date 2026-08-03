/**
 * CV template list for wizards and change-template flows.
 * Always returns templates sorted by the seven product collections so every
 * picker (carousel, grid) shares the same Finanse → … → Iconic order.
 */
import { sortTemplatesByCollection } from "./templateCollections.js";

export const selectCvTemplates = (templates) => sortTemplatesByCollection(templates);
