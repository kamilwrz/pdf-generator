/**
 * Curated colour and typography system for the Monument CV template.
 *
 * Monument's frame, ordinal plates, masthead rails, footer, portrait glyph,
 * and contact row all participate in the same semantic palette. Recolouring
 * therefore updates recognised template colours and icon assets together,
 * while a colour assigned manually by the user remains untouched.
 *
 * Typography presets are calculated from immutable authored metrics. This
 * makes XL -> S -> M reversible and avoids cumulative rounding drift.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_MONUMENT_PALETTE = "inkstone";
export const DEFAULT_MONUMENT_TEXT_SIZE = "M";

export const MONUMENT_PALETTES = Object.freeze([
  {
    id: "inkstone",
    name: "Kamień i Atrament",
    tagline: "Klasyczny i typograficzny",
    iconTheme: "monument",
    colors: {
      paper: "#F7F7F7", badgeText: "#FFFFFF", ink: "#111111",
      body: "#343434", muted: "#6D6D6D", rule: "#C8C8C8", pale: "#E8E8E8",
    },
  },
  {
    id: "blueprint",
    name: "Błękit Architekta",
    tagline: "Chłodny i precyzyjny",
    iconTheme: "monument-blueprint",
    colors: {
      paper: "#F6F8F8", badgeText: "#FCFEFE", ink: "#223338",
      body: "#3D4C50", muted: "#718084", rule: "#C5CFD0", pale: "#E6ECEC",
    },
  },
  {
    id: "olive",
    name: "Oliwne Archiwum",
    tagline: "Naturalny i wyważony",
    iconTheme: "monument-olive",
    colors: {
      paper: "#F8F8F3", badgeText: "#FEFEFA", ink: "#30372C",
      body: "#485044", muted: "#777F70", rule: "#C9CEC0", pale: "#E9EBE2",
    },
  },
  {
    id: "oxblood",
    name: "Bordowy Manuskrypt",
    tagline: "Redakcyjny i szlachetny",
    iconTheme: "monument-oxblood",
    colors: {
      paper: "#FAF7F6", badgeText: "#FFFCFB", ink: "#4B3034",
      body: "#59464A", muted: "#817174", rule: "#D5C7C9", pale: "#F0E7E8",
    },
  },
  {
    id: "travertine",
    name: "Ciepły Trawertyn",
    tagline: "Miękki i dyplomatyczny",
    iconTheme: "monument-travertine",
    colors: {
      paper: "#FAF8F3", badgeText: "#FFFDF8", ink: "#493A2F",
      body: "#594C42", muted: "#81766B", rule: "#D4CABD", pale: "#EFE9DF",
    },
  },
  {
    id: "midnight",
    name: "Nocny Granit",
    tagline: "Głęboki i nowoczesny",
    iconTheme: "monument-midnight",
    colors: {
      paper: "#F6F8FA", badgeText: "#FCFDFE", ink: "#243141",
      body: "#3D4A59", muted: "#718091", rule: "#C6D0D9", pale: "#E6ECF1",
    },
  },
]);

export const MONUMENT_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

// Monument's 33 pt Cormorant name already dominates the page, so display type
// grows gently. The 9 pt Montserrat body receives the largest readability lift.
const TEXT_SCALE = {
  S: {
    display: [0.98, 0.99], job: [0.97, 0.98], heading: [0.96, 0.97],
    title: [0.96, 0.97], body: [0.94, 0.95], meta: [0.94, 0.96], contact: [0.94, 0.96],
  },
  M: {
    display: [1, 1], job: [1, 1], heading: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1],
  },
  L: {
    display: [1.025, 1.02], job: [1.04, 1.03], heading: [1.045, 1.04],
    title: [1.06, 1.05], body: [1.075, 1.06], meta: [1.055, 1.04], contact: [1.055, 1.04],
  },
  XL: {
    display: [1.05, 1.04], job: [1.075, 1.06], heading: [1.09, 1.08],
    title: [1.11, 1.09], body: [1.14, 1.11], meta: [1.10, 1.08], contact: [1.10, 1.08],
  },
};

const MIN_FONT_SIZE = {
  display: 27, job: 10.5, heading: 10, title: 9.3,
  body: 8.4, meta: 8, contact: 8.2,
};

const paletteById = new Map(MONUMENT_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of MONUMENT_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    colorRoleByHex.set(value.toUpperCase(), role);
  }
}

const round = (value) => Math.round(value * 100) / 100;

function settingsAnchorIndex(elements) {
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "monument");
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
  return elements.findIndex((element) => element.contactBand?.id === "monument-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "monument",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Monument appearance intent, using authored defaults for
 * starter arrays and saved documents created before appearance controls.
 *
 * @param {object[]} elements - Current canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getMonumentAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "monument")
    ?? elements.find((element) => element.contactBand?.id === "monument-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_MONUMENT_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_MONUMENT_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply one semantic Monument palette without changing geometry or custom
 * user colours. Contact and portrait image paths switch to matching real PNGs
 * so browser and ReportLab output use the same glyph colour.
 *
 * @param {object[]} elements - Current canvas elements.
 * @param {string} paletteId - Identifier from `MONUMENT_PALETTES`.
 * @returns {object[]} Recoloured elements with persisted appearance intent.
 */
export function applyMonumentPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getMonumentAppearance(elements);
  const recolored = elements.map((element) => {
    let next = element;
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      const role = colorRoleByHex.get(String(element[property] || "").toUpperCase());
      if (role) next = { ...next, [property]: palette.colors[role] };
    }
    if (/\/template-assets\/iconic\/monument(?:-[^/]+)?\//.test(String(element.src || ""))) {
      next = {
        ...next,
        src: String(element.src).replace(
          /\/template-assets\/iconic\/monument(?:-[^/]+)?\//,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (element.contactBand?.id === "monument-contact") {
      next = {
        ...next,
        contactBand: {
          ...element.contactBand,
          text: { ...element.contactBand.text, colorHex: palette.colors.ink },
          icon: { ...element.contactBand.icon, theme: palette.iconTheme },
        },
      };
    }
    return next;
  });
  return stampSettings(recolored, { ...currentSettings, palette: palette.id });
}

function typographyRole(element) {
  if (element.contactBandId === "monument-contact" && element.category === "text") return "contact";
  if (element.flowRole === "masthead" && element.fontFamily === "CormorantGaramond") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome") return "heading";
  if (element.flowRole === "content" && element.bold && Number(element.fontSize) >= 9.8) return "title";

  // Both metadata and body start at 9 pt. Leading and semantic colour, not raw
  // font size, distinguish a compact company/date row from 14 pt body leading.
  const semanticColorRole = colorRoleByHex.get(String(element.color || "").toUpperCase());
  if (
    element.flowRole === "content"
    && (semanticColorRole === "muted" || Number(element.lineHeight) <= 12)
  ) {
    return "meta";
  }
  if (element.flowRole === "content") return "body";
  return Number(element.fontSize) <= 9 ? "meta" : "body";
}

/**
 * Apply a role-aware Monument text preset from immutable baseline metrics.
 * Auto-height flow fields receive a conservative fresh height so the document
 * packer can move later records before the browser's final measurement pass.
 *
 * @param {object[]} elements - Current canvas elements.
 * @param {string} textSizeId - Monument S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applyMonumentTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const currentSettings = getMonumentAppearance(elements);
  const resized = elements.map((element) => {
    if (element.contactBand?.id === "monument-contact") {
      const baseContactSize = Number(
        element.contactBand.appearanceBaseFontSize
        ?? element.contactBand.text?.fontSizePt
        ?? 9,
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
    if (!["text", "textarea"].includes(element.category) || Number(element.fontSize) <= 1) {
      return element;
    }
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
        // The editor estimator includes a 6 px caret allowance intended for a
        // newly inserted field. Template flow boxes need rendered line boxes
        // only; retaining the allowance for every record creates false pages.
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
