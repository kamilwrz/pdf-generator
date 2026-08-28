/**
 * Curated visual system for the Sterling CV template.
 *
 * Palette updates replace only colours that belong to Sterling's semantic
 * colour system. A colour manually assigned by the user is left untouched.
 * Typography updates always start from stored baseline values, which makes
 * S -> XL -> M deterministic and prevents cumulative scaling drift.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_STERLING_PALETTE = "northstar";
export const DEFAULT_STERLING_TEXT_SIZE = "M";

export const STERLING_PALETTES = Object.freeze([
  {
    id: "northstar",
    name: "Błękit Północy",
    tagline: "Precyzyjny i instytucjonalny",
    iconTheme: "sterling",
    colors: {
      paper: "#F7F8FA", ink: "#26313F", accent: "#4A6FA5",
      accentDeep: "#33517A", muted: "#6B7684", sidebar: "#EDF1F6", rule: "#C7CFDA",
    },
  },
  {
    id: "graphite",
    name: "Grafitowe Atelier",
    tagline: "Spokojny i architektoniczny",
    iconTheme: "sterling-graphite",
    colors: {
      paper: "#F8F8F7", ink: "#232421", accent: "#5B625E",
      accentDeep: "#343936", muted: "#747872", sidebar: "#EDEEEB", rule: "#C9CCC7",
    },
  },
  {
    id: "sage",
    name: "Szałwiowa Rezerwa",
    tagline: "Wyważony i współczesny",
    iconTheme: "sterling-sage",
    colors: {
      paper: "#F7F8F4", ink: "#25322D", accent: "#557565",
      accentDeep: "#385547", muted: "#6F7D75", sidebar: "#EBF0EC", rule: "#C7D1CA",
    },
  },
  {
    id: "burgundy",
    name: "Burgundowy List",
    tagline: "Dojrzały i redakcyjny",
    iconTheme: "sterling-burgundy",
    colors: {
      paper: "#FAF7F6", ink: "#35292B", accent: "#7A4650",
      accentDeep: "#593039", muted: "#7D6D70", sidebar: "#F2EAEB", rule: "#D8C6C9",
    },
  },
  {
    id: "amber",
    name: "Bursztynowa Księga",
    tagline: "Ciepły i dyplomatyczny",
    iconTheme: "sterling-amber",
    colors: {
      paper: "#FAF8F3", ink: "#342E27", accent: "#8A603F",
      accentDeep: "#66442D", muted: "#786E63", sidebar: "#F2ECE2", rule: "#DACFC0",
    },
  },
  {
    id: "midnight",
    name: "Nocny Fiord",
    tagline: "Głęboki i techniczny",
    iconTheme: "sterling-midnight",
    colors: {
      paper: "#F5F7F8", ink: "#182734", accent: "#315A70",
      accentDeep: "#1F4052", muted: "#667784", sidebar: "#E7EEF1", rule: "#BFCED5",
    },
  },
]);

export const STERLING_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

const TEXT_SCALE = {
  S: {
    display: [0.98, 0.99], job: [0.97, 0.98], heading: [0.96, 0.97],
    title: [0.95, 0.97], body: [0.93, 0.95], meta: [0.94, 0.96], contact: [0.94, 0.96],
  },
  M: {
    display: [1, 1], job: [1, 1], heading: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1],
  },
  L: {
    display: [1.03, 1.02], job: [1.04, 1.03], heading: [1.05, 1.04],
    title: [1.07, 1.05], body: [1.08, 1.06], meta: [1.06, 1.04], contact: [1.06, 1.04],
  },
  XL: {
    display: [1.06, 1.04], job: [1.08, 1.06], heading: [1.10, 1.08],
    title: [1.13, 1.10], body: [1.16, 1.12], meta: [1.12, 1.09], contact: [1.11, 1.08],
  },
};

const MIN_FONT_SIZE = {
  display: 24, job: 8.5, heading: 8, title: 8.5,
  body: 8.2, meta: 7.6, contact: 8.2,
};

const paletteById = new Map(STERLING_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of STERLING_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    colorRoleByHex.set(value.toUpperCase(), role);
  }
}

const round = (value) => Math.round(value * 100) / 100;
const SIDEBAR_HAIRLINE_HEIGHT = 1;

/**
 * Upgrades persisted Sterling/Linden rail rules created before the uniform
 * one-point hairline contract.
 *
 * Only the two known legacy shapes are changed: 1.4-point section ticks in
 * either template and Linden's 0.8-point fixed footer rule. This deliberately
 * avoids rewriting user-authored lines or geometry in other Sterling-derived
 * templates such as Cadenza and Vestige.
 *
 * @param {object[]} elements - Materialized canvas elements from persistence.
 * @param {string|null|undefined} templateId - Saved document template id.
 * @returns {object[]} The original array when no migration is required.
 */
export function normalizeSterlingFamilySidebarHairlines(elements = [], templateId = null) {
  const normalizedId = String(templateId || "").toLowerCase();
  if (normalizedId !== "sterling" && normalizedId !== "linden") return elements;

  let changed = false;
  const normalized = elements.map((element) => {
    const height = Number(element.height);
    const isLegacySectionTick = element.category === "line"
      && element.flowRole === "sidebar-chrome"
      && height === 1.4;
    const isLegacyLindenFooter = normalizedId === "linden"
      && element.category === "line"
      && element.fixedToPage
      && Number(element.left) === 34
      && Number(element.top) === 806
      && Number(element.width) === 152
      && height === 0.8;
    if (!isLegacySectionTick && !isLegacyLindenFooter) return element;
    changed = true;
    return { ...element, height: SIDEBAR_HAIRLINE_HEIGHT };
  });

  return changed ? normalized : elements;
}

function settingsAnchorIndex(elements) {
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "sterling");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex((element) => (
    element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840
  ));
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "sterling-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "sterling",
    appearanceSettings: nextSettings,
  } : element);
}

/** Returns persisted Sterling appearance intent, with safe defaults for legacy documents. */
export function getSterlingAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "sterling")
    ?? elements.find((element) => element.contactBand?.id === "sterling-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_STERLING_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_STERLING_TEXT_SIZE;
  return { palette, textSize };
}

/** Detects Sterling documents reopened without an active template identifier. */
export function isSterlingDocument(elements = []) {
  return elements.some((element) => (
    element.appearanceTemplateId === "sterling"
    || element.contactBand?.id === "sterling-contact"
    || /\/template-assets\/iconic\/sterling(?:-[^/]+)?\//.test(String(element.src || ""))
  ));
}

/**
 * Applies a semantic palette to all recognised Sterling colours and icons.
 * Geometry and unrecognised custom colours are intentionally preserved.
 */
export function applySterlingPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getSterlingAppearance(elements);
  const recolored = elements.map((element) => {
    let next = element;
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      const role = colorRoleByHex.get(String(element[property] || "").toUpperCase());
      if (role) next = { ...next, [property]: palette.colors[role] };
    }
    if (/\/template-assets\/iconic\/sterling(?:-[^/]+)?\//.test(String(element.src || ""))) {
      next = {
        ...next,
        src: String(element.src).replace(
          /\/template-assets\/iconic\/sterling(?:-[^/]+)?\//,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (element.contactBand?.id === "sterling-contact") {
      next = {
        ...next,
        contactBand: {
          ...element.contactBand,
          text: { ...element.contactBand.text, colorHex: palette.colors.muted },
          icon: { ...element.contactBand.icon, theme: palette.iconTheme },
        },
      };
    }
    return next;
  });
  return stampSettings(recolored, { ...currentSettings, palette: palette.id });
}

function typographyRole(element) {
  if (element.contactBandId === "sterling-contact" && element.category === "text") return "contact";
  if (element.flowRole === "masthead" && element.fontFamily === "CormorantGaramond") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome" || element.flowRole === "sidebar-chrome") return "heading";
  if (element.flowRole === "content" && Number(element.fontSize) >= 10.5 && element.bold) return "title";
  // Sterling's sidebar prose is intentionally 8.3 pt with a generous 12.04 pt
  // leading. It is body copy, not metadata, so it receives the stronger body
  // scale and the 8.2 pt body readability floor.
  if (element.flowRole === "content" && Number(element.fontSize) <= 8.4) return "body";
  if (element.flowRole === "content" && Number(element.fontSize) <= 8.8) return "meta";
  if (element.flowRole === "content") return "body";
  return Number(element.fontSize) <= 9 ? "meta" : "body";
}

/**
 * Applies a role-aware Sterling text preset from immutable baseline metrics.
 * Auto-height textareas opt into a fresh measurement so existing canvas
 * reflow and pagination can respond to the selected size.
 */
export function applySterlingTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const currentSettings = getSterlingAppearance(elements);
  const resized = elements.map((element) => {
    if (element.contactBand?.id === "sterling-contact") {
      const baseContactSize = Number(
        element.contactBand.appearanceBaseFontSize
        ?? element.contactBand.text?.fontSizePt
        ?? 9.4,
      );
      const nextContactSize = round(Math.max(
        MIN_FONT_SIZE.contact,
        baseContactSize * scale.contact[0],
      ));
      const baseMetrics = element.contactBand.appearanceBaseMetrics
        ?? element.contactBand.metrics;
      return {
        ...element,
        contactBand: {
          ...element.contactBand,
          appearanceBaseFontSize: baseContactSize,
          appearanceBaseMetrics: baseMetrics,
          text: { ...element.contactBand.text, fontSizePt: nextContactSize },
          metrics: {
            ...element.contactBand.metrics,
            charWidth: round(baseMetrics.charWidth * scale.contact[0]),
            lineStep: round(baseMetrics.lineStep * scale.contact[1]),
          },
        },
      };
    }
    if (!["text", "textarea"].includes(element.category) || Number(element.fontSize) <= 1) return element;
    const role = element.appearanceTypographyRole || typographyRole(element);
    const baseFontSize = Number(element.appearanceBaseFontSize ?? element.fontSize);
    const hasLineHeight = Number.isFinite(Number(element.lineHeight));
    const baseLineHeight = hasLineHeight
      ? Number(element.appearanceBaseLineHeight ?? element.lineHeight)
      : null;
    const [fontFactor, lineFactor] = scale[role] || scale.body;
    const next = {
      ...element,
      appearanceTypographyRole: role,
      appearanceBaseFontSize: baseFontSize,
      fontSize: round(Math.max(MIN_FONT_SIZE[role] || MIN_FONT_SIZE.body, baseFontSize * fontFactor)),
    };
    if (baseLineHeight !== null) {
      next.appearanceBaseLineHeight = baseLineHeight;
      next.lineHeight = round(Math.max(next.fontSize * 1.12, baseLineHeight * lineFactor));
    }
    if (element.category === "textarea" && element.autoHeight) {
      next.preserveInitialLayout = false;
      // A type preset changes every textarea in one state update. Waiting for
      // independent DOM measurements leaves the structural packer with a mix
      // of old heights and new font metrics, so later blocks can be placed on
      // top of text that has already wrapped. Seed a conservative height from
      // the same canvas-side estimator used by structural builders; the live
      // browser measurement still refines it after render.
      if (element.flowRole !== "masthead") {
        const estimatedHeight = measureTextareaHeight(
          next.content,
          next.width,
          next.fontSize,
          next.lineHeight,
          {
            bulletList: next.bulletList,
            measureTextWidth,
            textStyle: next,
          },
        );
        // `measureTextareaHeight` includes a 6px editing/caret allowance used
        // when creating a new field. Existing template boxes need only their
        // rendered line boxes; carrying that allowance into every record would
        // add it dozens of times and create a spurious continuation page.
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
