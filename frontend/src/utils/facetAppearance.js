/** Facet document palettes. Authored geometry and custom colours stay intact. */
import { t } from "../i18n/index.js";
import { applyColumnTextSize, STERLING_TEXT_SIZES } from "./sterlingAppearance.js";
import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { reconcileDocumentPages } from "./structureOperation.js";
import { applySterlingRenderedHeightsLayout } from "./sterlingTypographyLayout.js";

export const FACET_PALETTES = Object.freeze([
  { id: "olive", colors: { paper: "#FFFFFF", ink: "#252C24", accent: "#657537", accentDeep: "#47552B", muted: "#62685D", sidebar: "#F3F5EC", rule: "#CDD4BD" } },
  { id: "cobalt", colors: { paper: "#FFFFFF", ink: "#202D42", accent: "#315F9C", accentDeep: "#274A79", muted: "#5C6879", sidebar: "#EEF3FA", rule: "#C9D7E9" } },
  { id: "copper", colors: { paper: "#FFFFFF", ink: "#342820", accent: "#9B522F", accentDeep: "#763D25", muted: "#736359", sidebar: "#F8F0E9", rule: "#E3CDBE" } },
  { id: "plum", colors: { paper: "#FFFFFF", ink: "#352B39", accent: "#7A4B80", accentDeep: "#603B65", muted: "#716376", sidebar: "#F5EEF6", rule: "#DCCBDF" } },
  { id: "carbon", colors: { paper: "#1E241F", ink: "#F3F5EC", accent: "#C0D875", accentDeep: "#DBE9B4", muted: "#B8C2B3", sidebar: "#282F27", rule: "#56634C" } },
  { id: "midnight", colors: { paper: "#1B2533", ink: "#F0F4FA", accent: "#8FC8F2", accentDeep: "#C2E0F7", muted: "#B2C3D6", sidebar: "#243244", rule: "#4C657F" } },
].map((palette) => ({
  ...palette,
  get name() { return t(`editor:facet.${palette.id}`); },
  get tagline() { return t(`editor:facet.${palette.id}Detail`); },
  iconTheme: `facet-${palette.id}`,
})));

export const FACET_TEXT_SIZES = STERLING_TEXT_SIZES;
const palettes = new Map(FACET_PALETTES.map((palette) => [palette.id, palette]));

/** Read saved palette/size intent; unknown values fall back to white Olive/M. */
export function getFacetAppearance(elements = []) {
  const settings = elements.find((element) => element.appearanceTemplateId === "facet")?.appearanceSettings;
  return {
    palette: palettes.has(settings?.palette) ? settings.palette : "olive",
    textSize: FACET_TEXT_SIZES.some((size) => size.id === settings?.textSize) ? settings.textSize : "M",
  };
}

function stampSettings(elements, settings) {
  return elements.map((element) => element.appearanceTemplateId === "facet"
    ? { ...element, appearanceSettings: settings } : element);
}

/**
 * Recolour document roles, latent title and future contact rows together.
 * Only values matching the CURRENT palette are replaced. This preserves a
 * user's manual colour even when it happens to occur in another edition.
 * Real local icon assets ensure browser and PDF colours remain identical.
 */
export function applyFacetPalette(elements = [], paletteId) {
  const palette = palettes.get(paletteId);
  if (!palette) return elements;
  const settings = getFacetAppearance(elements);
  const current = palettes.get(settings.palette);
  const recolour = (value, explicitRole) => {
    const role = explicitRole ?? Object.keys(current.colors).find((key) => current.colors[key] === value);
    return role && value === current.colors[role] ? palette.colors[role] : value;
  };
  const result = elements.map((element) => {
    const next = { ...element };
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      if (property in next) next[property] = recolour(next[property]);
    }
    if (next.src?.includes(`/template-assets/iconic/${current.iconTheme}/`)) {
      next.src = next.src.replace(`/${current.iconTheme}/`, `/${palette.iconTheme}/`);
    }
    if (next.contactBand?.id === "facet-contact") {
      next.contactBand = {
        ...next.contactBand,
        text: { ...next.contactBand.text, colorHex: recolour(next.contactBand.text.colorHex, "muted") },
        icon: { ...next.contactBand.icon, theme: palette.iconTheme },
      };
    }
    const identity = next.mastheadIdentity;
    if (identity?.title?.spec) {
      next.mastheadIdentity = {
        ...identity, title: {
          ...identity.title,
          spec: { ...identity.title.spec, colorHex: recolour(identity.title.spec.colorHex, "accent") },
        },
      };
    }
    return next;
  });
  return stampSettings(result, { ...settings, palette: paletteId });
}

/** Scale Facet from immutable baseline metrics; no state or network effects. */
export function applyFacetTextSize(elements, textSizeId, { measureTextWidth = null } = {}) {
  return applyColumnTextSize(elements, textSizeId, {
    measureTextWidth, contactBandId: "facet-contact",
    getAppearance: getFacetAppearance, persistSettings: stampSettings,
  });
}

/** Rebuild contacts, pack both lanes and reconcile continuation furniture once. */
export function applyFacetTextSizeLayout(elements, textSizeId, options) {
  const { spacing, pageHeight = 842, createId, measureTextWidth = null } = options;
  const resized = applyFacetTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(resized, "facet-contact", null, createId).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

// Browser-height reconciliation is lane-based and contains no Sterling theme
// assumptions. Share that transaction rather than duplicating its race handling.
export const applyFacetRenderedHeightsLayout = applySterlingRenderedHeightsLayout;
