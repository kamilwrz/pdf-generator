/**
 * Curated colour and typography system for the Meridian CV template.
 *
 * Meridian always prints on white paper. Palettes therefore recolour only
 * recognised text, rules, section ticks, page numbers, hidden title specs,
 * and contact icons. The full-page background is forced back to white even
 * when an older saved document carries a different recognised paper colour.
 *
 * Typography presets scale from immutable authored metrics. Repeated
 * S -> XL -> M changes restore the original Cormorant/Montserrat sizes and
 * line heights without accumulating rounding drift.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_MERIDIAN_PALETTE = "navy";
export const DEFAULT_MERIDIAN_TEXT_SIZE = "M";

export const MERIDIAN_PALETTES = Object.freeze([
  {
    id: "navy",
    name: "Granatowy Horyzont",
    tagline: "Chłodny i strategiczny",
    iconTheme: "meridian",
    colors: {
      paper: "#FFFFFF", ink: "#1B2A41", body: "#33475A",
      muted: "#657287", rule: "#D7DEE6", accent: "#3D5A80",
    },
  },
  {
    id: "monochrome",
    name: "Czysty Monochrom",
    tagline: "Czerń, biel i szarość",
    iconTheme: "meridian-monochrome",
    colors: {
      paper: "#FFFFFF", ink: "#171717", body: "#3E3E3E",
      muted: "#6B6B6B", rule: "#D1D1D1", accent: "#242424",
    },
  },
  {
    id: "burgundy",
    name: "Burgundowy Rejestr",
    tagline: "Redakcyjny i zdecydowany",
    iconTheme: "meridian-burgundy",
    colors: {
      paper: "#FFFFFF", ink: "#3D2028", body: "#593A43",
      muted: "#765F66", rule: "#DCCBD0", accent: "#8A3F53",
    },
  },
  {
    id: "forest",
    name: "Zielony Gabinet",
    tagline: "Naturalny i analityczny",
    iconTheme: "meridian-forest",
    colors: {
      paper: "#FFFFFF", ink: "#1F342B", body: "#385147",
      muted: "#61766D", rule: "#CAD8D1", accent: "#2E6B52",
    },
  },
  {
    id: "copper",
    name: "Miedziany Raport",
    tagline: "Ciepły i dojrzały",
    iconTheme: "meridian-copper",
    colors: {
      paper: "#FFFFFF", ink: "#3A281F", body: "#58443A",
      muted: "#76645A", rule: "#DECFC5", accent: "#A35732",
    },
  },
  {
    id: "teal",
    name: "Turkusowy Brief",
    tagline: "Świeży i precyzyjny",
    iconTheme: "meridian-teal",
    colors: {
      paper: "#FFFFFF", ink: "#17343A", body: "#36545A",
      muted: "#5F757B", rule: "#C8D9DB", accent: "#0B6B70",
    },
  },
]);

export const MERIDIAN_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

// The 34 pt Cormorant name already dominates Meridian's letterhead. Compact
// Montserrat body copy and the right metadata rail receive the strongest lift.
const TEXT_SCALE = {
  S: {
    display: [0.98, 0.99], job: [0.97, 0.98], heading: [0.96, 0.97],
    title: [0.96, 0.97], body: [0.95, 0.96], meta: [0.96, 0.97], contact: [0.96, 0.97],
  },
  M: {
    display: [1, 1], job: [1, 1], heading: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1],
  },
  L: {
    display: [1.025, 1.02], job: [1.04, 1.03], heading: [1.045, 1.04],
    title: [1.055, 1.05], body: [1.075, 1.06], meta: [1.06, 1.045], contact: [1.055, 1.04],
  },
  XL: {
    display: [1.05, 1.04], job: [1.075, 1.06], heading: [1.09, 1.08],
    title: [1.11, 1.09], body: [1.14, 1.11], meta: [1.11, 1.085], contact: [1.10, 1.08],
  },
};

const MIN_FONT_SIZE = {
  display: 30, job: 8.2, heading: 7.5, title: 9,
  body: 8, meta: 7.4, contact: 7.5,
};

const paletteById = new Map(MERIDIAN_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of MERIDIAN_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    colorRoleByHex.set(value.toUpperCase(), role);
  }
}
// Saved Meridian documents created before Appearance used the lighter steel
// metadata colour. Keep it semantic so opening one can adopt any new palette.
colorRoleByHex.set("#7A8699", "muted");

const round = (value) => Math.round(value * 100) / 100;
const CONTACT_ICON_PATH = /\/template-assets\/iconic\/(?:regent|meridian(?:-[a-z0-9]+)?)\//;

function isPageBackground(element) {
  return element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

function recolorMastheadTitleDescriptor(element, palette) {
  const title = element.mastheadIdentity?.title;
  if (!title?.spec) return element;
  const colorFor = (value) => {
    const role = colorRoleByHex.get(String(value || "").toUpperCase());
    return role ? palette.colors[role] : value;
  };
  const spec = { ...title.spec, colorHex: colorFor(title.spec.colorHex) };
  const decorations = (title.decorations || []).map((decoration) => {
    const next = { ...decoration };
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      if (property in next) next[property] = colorFor(next[property]);
    }
    return next;
  });
  return {
    ...element,
    mastheadIdentity: {
      ...element.mastheadIdentity,
      title: { ...title, spec, decorations },
    },
  };
}

function resizeMastheadTitleDescriptor(element, scale, restoreBaseline) {
  const title = element.mastheadIdentity?.title;
  const spec = title?.spec;
  if (!spec || !Number.isFinite(Number(spec.fontSizePt))) return element;
  const role = spec.appearanceTypographyRole || "job";
  const [fontFactor, lineFactor] = scale[role] || scale.job;
  const baseFontSize = Number(spec.appearanceBaseFontSize ?? spec.fontSizePt);
  const nextSpec = {
    ...spec,
    appearanceTypographyRole: role,
    appearanceBaseFontSize: baseFontSize,
    fontSizePt: restoreBaseline
      ? baseFontSize
      : round(Math.max(
        MIN_FONT_SIZE[role] || MIN_FONT_SIZE.job,
        baseFontSize * fontFactor,
      )),
  };
  if (Number.isFinite(Number(spec.lineHeight))) {
    const baseLineHeight = Number(spec.appearanceBaseLineHeight ?? spec.lineHeight);
    nextSpec.appearanceBaseLineHeight = baseLineHeight;
    nextSpec.lineHeight = restoreBaseline
      ? baseLineHeight
      : round(Math.max(
        nextSpec.fontSizePt * 1.12,
        baseLineHeight * lineFactor,
      ));
  }
  if (Number.isFinite(Number(spec.height))) {
    const baseHeight = Number(spec.appearanceBaseHeight ?? spec.height);
    nextSpec.appearanceBaseHeight = baseHeight;
    nextSpec.height = restoreBaseline
      ? baseHeight
      : round(Math.max(
        Number(nextSpec.lineHeight) || 0,
        baseHeight * lineFactor,
      ));
  }
  return {
    ...element,
    mastheadIdentity: {
      ...element.mastheadIdentity,
      title: { ...title, spec: nextSpec },
    },
  };
}

function settingsAnchorIndex(elements) {
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "meridian");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex(isPageBackground);
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "meridian-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "meridian",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Meridian appearance intent with defaults for older files.
 *
 * @param {object[]} elements - Current Meridian canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getMeridianAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "meridian")
    ?? elements.find((element) => element.contactBand?.id === "meridian-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_MERIDIAN_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_MERIDIAN_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply a Meridian palette while preserving white paper and custom colours.
 * Contact paths switch to real palette-specific PNG files so the editor and
 * ReportLab export use the same icon ink.
 *
 * @param {object[]} elements - Current Meridian canvas elements.
 * @param {string} paletteId - Identifier from `MERIDIAN_PALETTES`.
 * @returns {object[]} Recoloured elements with persisted appearance intent.
 */
export function applyMeridianPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getMeridianAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorMastheadTitleDescriptor(element, palette);
    if (isPageBackground(next)) {
      next = { ...next, backgroundColor: "#FFFFFF" };
    } else {
      for (const property of ["color", "backgroundColor", "borderColor"]) {
        const role = colorRoleByHex.get(String(next[property] || "").toUpperCase());
        if (role && role !== "paper") next = { ...next, [property]: palette.colors[role] };
      }
    }
    if (CONTACT_ICON_PATH.test(String(next.src || ""))) {
      next = {
        ...next,
        src: String(next.src).replace(
          CONTACT_ICON_PATH,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (next.contactBand?.id === "meridian-contact") {
      next = {
        ...next,
        contactBand: {
          ...next.contactBand,
          text: { ...next.contactBand.text, colorHex: palette.colors.muted },
          icon: { ...next.contactBand.icon, theme: palette.iconTheme },
        },
      };
    }
    return next;
  });
  return stampSettings(recolored, { ...currentSettings, palette: palette.id });
}

function typographyRole(element) {
  if (element.contactBandId === "meridian-contact" && element.category === "text") return "contact";
  if (element.flowRole === "masthead" && element.fontFamily === "CormorantGaramond") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome") return "heading";
  if (element.flowRole === "record-overlay") return "meta";

  const semanticColorRole = colorRoleByHex.get(String(element.color || "").toUpperCase());
  if (
    element.flowRole === "content"
    && Number(element.fontSize) >= 9.8
    && (element.bold || semanticColorRole === "ink")
  ) {
    return "title";
  }
  if (
    element.flowRole === "content"
    && (semanticColorRole === "muted" || Number(element.lineHeight) <= 10.8)
  ) {
    return "meta";
  }
  if (element.flowRole === "content") return "body";
  return Number(element.fontSize) <= 8 ? "meta" : "body";
}

/**
 * Apply a role-aware Meridian text preset from immutable baseline metrics.
 * Auto-height fields receive conservative pre-paint heights so the structural
 * packer can move complete records before Chromium's final measurement pass.
 *
 * @param {object[]} elements - Current Meridian canvas elements.
 * @param {string} textSizeId - Meridian S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applyMeridianTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const restoreBaseline = textSizeId === DEFAULT_MERIDIAN_TEXT_SIZE;
  const currentSettings = getMeridianAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale, restoreBaseline);
    if (source.contactBand?.id === "meridian-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 8,
      );
      const nextContactSize = restoreBaseline
        ? baseContactSize
        : round(Math.max(
          MIN_FONT_SIZE.contact,
          baseContactSize * scale.contact[0],
        ));
      const baseMetrics = source.contactBand.appearanceBaseMetrics
        ?? source.contactBand.metrics;
      return {
        ...source,
        contactBand: {
          ...source.contactBand,
          appearanceBaseFontSize: baseContactSize,
          appearanceBaseMetrics: baseMetrics,
          text: { ...source.contactBand.text, fontSizePt: nextContactSize },
          metrics: {
            ...source.contactBand.metrics,
            charWidth: restoreBaseline
              ? baseMetrics.charWidth
              : round(baseMetrics.charWidth * scale.contact[0]),
            lineStep: restoreBaseline
              ? baseMetrics.lineStep
              : round(baseMetrics.lineStep * scale.contact[1]),
          },
        },
      };
    }
    if (!["text", "textarea"].includes(source.category) || Number(source.fontSize) <= 1) {
      return source;
    }
    const role = source.appearanceTypographyRole || typographyRole(source);
    const baseFontSize = Number(source.appearanceBaseFontSize ?? source.fontSize);
    const hasLineHeight = Number.isFinite(Number(source.lineHeight));
    const baseLineHeight = hasLineHeight
      ? Number(source.appearanceBaseLineHeight ?? source.lineHeight)
      : null;
    const [fontFactor, lineFactor] = scale[role] || scale.body;
    const next = {
      ...source,
      appearanceTypographyRole: role,
      appearanceBaseFontSize: baseFontSize,
      fontSize: restoreBaseline
        ? baseFontSize
        : round(Math.max(
          MIN_FONT_SIZE[role] || MIN_FONT_SIZE.body,
          baseFontSize * fontFactor,
        )),
    };
    if (baseLineHeight !== null) {
      next.appearanceBaseLineHeight = baseLineHeight;
      next.lineHeight = restoreBaseline
        ? baseLineHeight
        : round(Math.max(next.fontSize * 1.12, baseLineHeight * lineFactor));
    }
    if (source.category === "textarea" && source.autoHeight) {
      next.preserveInitialLayout = false;
      if (source.flowRole !== "masthead") {
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
        // Existing template fields need rendered line boxes, not the editor's
        // extra 6 px caret allowance used when a new textarea is inserted.
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
