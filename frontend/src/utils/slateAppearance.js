/**
 * Curated colour and typography system for the Slate CV template.
 *
 * Slate's paper, sidebar rail, drafting marks, title field, footer tab, photo
 * frame, contact row, and section badges belong to one semantic colour
 * contract. Palette changes replace only recognised template colours and the
 * accent-coloured icon assets; white section glyphs remain shared because
 * they are designed to sit inside every palette's filled badge.
 *
 * Typography presets always scale from immutable authored metrics. Repeated
 * S -> XL -> M changes therefore restore the exact original font sizes and
 * line heights instead of accumulating rounding drift.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_SLATE_PALETTE = "steelgrid";
export const DEFAULT_SLATE_TEXT_SIZE = "M";

export const SLATE_PALETTES = Object.freeze([
  {
    id: "steelgrid",
    name: "Stalowa Siatka",
    tagline: "Chłodna i precyzyjna",
    accentIconTheme: "slate-accent",
    colors: {
      paper: "#FFFFFF", sidebar: "#F1F4F8", ink: "#1C2530",
      body: "#3A424C", muted: "#626F7C", accent: "#3E5C76",
      rule: "#D3DAE2", photo: "#E7ECF2", badgeText: "#FFFFFF",
    },
  },
  {
    id: "monochrome",
    name: "Czysty Monochrom",
    tagline: "Czerń, biel i szarość",
    accentIconTheme: "slate-monochrome-accent",
    colors: {
      paper: "#FFFFFF", sidebar: "#F0F0F0", ink: "#151515",
      body: "#383838", muted: "#686868", accent: "#242424",
      rule: "#CCCCCC", photo: "#E4E4E4", badgeText: "#FFFFFF",
    },
  },
  {
    id: "copper",
    name: "Miedziany Warsztat",
    tagline: "Ciepły i rzemieślniczy",
    accentIconTheme: "slate-copper-accent",
    colors: {
      paper: "#FFFDF9", sidebar: "#F6EDE3", ink: "#33251D",
      body: "#534338", muted: "#76665B", accent: "#A14F2B",
      rule: "#DDC9B8", photo: "#EEDFD0", badgeText: "#FFFFFF",
    },
  },
  {
    id: "forest",
    name: "Leśny Raster",
    tagline: "Naturalny i zdecydowany",
    accentIconTheme: "slate-forest-accent",
    colors: {
      paper: "#FBFDFB", sidebar: "#EAF2ED", ink: "#1D3028",
      body: "#3C5047", muted: "#5F6F66", accent: "#2F6A50",
      rule: "#C7D7CE", photo: "#DDEAE2", badgeText: "#FFFFFF",
    },
  },
  {
    id: "plum",
    name: "Śliwkowy Moduł",
    tagline: "Kreatywny i redakcyjny",
    accentIconTheme: "slate-plum-accent",
    colors: {
      paper: "#FEFBFD", sidebar: "#F3EAF1", ink: "#352530",
      body: "#55434F", muted: "#74656F", accent: "#764466",
      rule: "#D8C5D1", photo: "#EADCE5", badgeText: "#FFFFFF",
    },
  },
  {
    id: "teal",
    name: "Morska Matryca",
    tagline: "Świeża i technologiczna",
    accentIconTheme: "slate-teal-accent",
    colors: {
      paper: "#F9FDFD", sidebar: "#E5F2F1", ink: "#173134",
      body: "#385154", muted: "#5A6D6F", accent: "#007473",
      rule: "#BFD6D4", photo: "#D6E9E7", badgeText: "#FFFFFF",
    },
  },
]);

export const SLATE_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

// Slate's tracked 24 pt name already anchors the main column, so it grows more
// gently than body copy. Narrow sidebar prose receives the strongest lift.
const TEXT_SCALE = {
  S: {
    display: [0.98, 0.99], job: [0.98, 0.99], heading: [0.97, 0.98],
    title: [0.96, 0.97], body: [0.95, 0.96], meta: [0.96, 0.97], contact: [0.96, 0.97],
  },
  M: {
    display: [1, 1], job: [1, 1], heading: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1],
  },
  L: {
    display: [1.03, 1.02], job: [1.04, 1.03], heading: [1.05, 1.04],
    title: [1.06, 1.05], body: [1.075, 1.06], meta: [1.055, 1.04], contact: [1.055, 1.04],
  },
  XL: {
    display: [1.06, 1.04], job: [1.08, 1.06], heading: [1.10, 1.08],
    title: [1.12, 1.09], body: [1.14, 1.11], meta: [1.10, 1.08], contact: [1.10, 1.08],
  },
};

const MIN_FONT_SIZE = {
  display: 22, job: 7.8, heading: 7.3, title: 8,
  body: 8, meta: 7.2, contact: 7.4,
};

const paletteById = new Map(SLATE_PALETTES.map((palette) => [palette.id, palette]));
const colorRolesByHex = new Map();
for (const palette of SLATE_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    const hex = value.toUpperCase();
    const roles = colorRolesByHex.get(hex) ?? new Set();
    roles.add(role);
    colorRolesByHex.set(hex, roles);
  }
}

// Documents saved before the AA contrast refinement still carry the former
// muted tokens. Keep them in the semantic lookup so the next palette change
// upgrades those values instead of misclassifying them as manual colours.
for (const legacyMuted of [
  "#7A8794", "#707070", "#837468", "#718178", "#81727C", "#6D8082",
]) {
  colorRolesByHex.set(legacyMuted, new Set(["muted"]));
}

const round = (value) => Math.round(value * 100) / 100;
const ACCENT_ICON_PATH = /\/template-assets\/iconic\/slate(?:-[a-z0-9]+)*-accent\//;

/**
 * Return the central Slate font factor for a semantic typography role.
 *
 * Photo-less chrome is materialized after a size preset may already have been
 * applied. Exposing the factor keeps that late-created label on the same S–XL
 * scale even when the document no longer contains a sidebar heading to copy.
 *
 * @param {string} textSizeId - Slate S, M, L, or XL preset identifier.
 * @param {string} role - Semantic role such as `heading` or `contact`.
 * @returns {number} The font-size multiplier, defaulting to M.
 */
export function slateTypographyFontFactor(textSizeId, role) {
  return TEXT_SCALE[textSizeId]?.[role]?.[0] ?? 1;
}

function isPageBackground(element, property) {
  return property === "backgroundColor"
    && element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

/**
 * Resolve a Slate colour to its semantic role.
 *
 * White is intentionally shared by paper and glyph text. Geometry separates
 * the full-page background from white title/page-number text so a tinted paper
 * palette does not accidentally tint glyphs inside dark accent fields.
 */
function colorRole(element, property, value) {
  const roles = colorRolesByHex.get(String(value || "").toUpperCase());
  if (!roles || roles.size === 0) return null;
  if (roles.size === 1) return roles.values().next().value;
  if (roles.has("paper") && roles.has("badgeText")) {
    return isPageBackground(element, property) ? "paper" : "badgeText";
  }
  return roles.values().next().value;
}

function recolorMastheadTitleDescriptor(element, palette) {
  const title = element.mastheadIdentity?.title;
  if (!title?.spec) return element;
  const colorFor = (property, value, descriptor = title.spec) => {
    const role = colorRole(descriptor, property, value);
    return role ? palette.colors[role] : value;
  };
  const spec = { ...title.spec, colorHex: colorFor("color", title.spec.colorHex) };
  const decorations = (title.decorations || []).map((decoration) => {
    const next = { ...decoration };
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      if (property in next) next[property] = colorFor(property, next[property], next);
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

function recolorContactBandDescriptor(descriptor, palette) {
  if (descriptor?.id !== "contact-main") return descriptor;
  return {
    ...descriptor,
    text: { ...descriptor.text, colorHex: palette.colors.muted },
    icon: { ...descriptor.icon, theme: palette.accentIconTheme },
  };
}

function resizeContactBandDescriptor(descriptor, scale) {
  if (descriptor?.id !== "contact-main") return descriptor;
  const baseContactSize = Number(
    descriptor.appearanceBaseFontSize
    ?? descriptor.text?.fontSizePt
    ?? 7.8,
  );
  const nextContactSize = round(Math.max(
    MIN_FONT_SIZE.contact,
    baseContactSize * scale.contact[0],
  ));
  const baseMetrics = descriptor.appearanceBaseMetrics ?? descriptor.metrics;
  return {
    ...descriptor,
    appearanceBaseFontSize: baseContactSize,
    appearanceBaseMetrics: baseMetrics,
    text: { ...descriptor.text, fontSizePt: nextContactSize },
    metrics: {
      ...descriptor.metrics,
      charWidth: round(baseMetrics.charWidth * scale.contact[0]),
      lineStep: round(baseMetrics.lineStep * scale.contact[1]),
    },
  };
}

function resizeMastheadTitleDescriptor(element, scale) {
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
    fontSizePt: round(Math.max(
      MIN_FONT_SIZE[role] || MIN_FONT_SIZE.job,
      baseFontSize * fontFactor,
    )),
  };
  if (Number.isFinite(Number(spec.lineHeight))) {
    const baseLineHeight = Number(spec.appearanceBaseLineHeight ?? spec.lineHeight);
    nextSpec.appearanceBaseLineHeight = baseLineHeight;
    nextSpec.lineHeight = round(Math.max(
      nextSpec.fontSizePt * 1.12,
      baseLineHeight * lineFactor,
    ));
  }
  if (Number.isFinite(Number(spec.height))) {
    const baseHeight = Number(spec.appearanceBaseHeight ?? spec.height);
    nextSpec.appearanceBaseHeight = baseHeight;
    nextSpec.height = round(Math.max(
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
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "slate");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex((element) => isPageBackground(element, "backgroundColor"));
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "contact-main");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "slate",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Slate appearance intent with safe defaults for documents
 * saved before appearance controls were available.
 *
 * @param {object[]} elements - Current Slate canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getSlateAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "slate")
    ?? elements.find((element) => element.contactBand?.id === "contact-main");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_SLATE_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_SLATE_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply a semantic Slate palette without changing geometry or custom colours.
 * Accent contact/portrait paths switch to real palette-specific PNG files;
 * white section-badge glyphs remain on their shared `slate` theme.
 *
 * @param {object[]} elements - Current Slate canvas elements.
 * @param {string} paletteId - Identifier from `SLATE_PALETTES`.
 * @returns {object[]} Recoloured elements with persisted appearance intent.
 */
export function applySlatePalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getSlateAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorMastheadTitleDescriptor(element, palette);
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      const role = colorRole(next, property, next[property]);
      if (role) next = { ...next, [property]: palette.colors[role] };
    }
    if (ACCENT_ICON_PATH.test(String(next.src || ""))) {
      next = {
        ...next,
        src: String(next.src).replace(
          ACCENT_ICON_PATH,
          `/template-assets/iconic/${palette.accentIconTheme}/`,
        ),
      };
    }
    if (ACCENT_ICON_PATH.test(String(next.photoPlaceholder?.src || ""))) {
      next = {
        ...next,
        photoPlaceholder: {
          ...next.photoPlaceholder,
          src: String(next.photoPlaceholder.src).replace(
            ACCENT_ICON_PATH,
            `/template-assets/iconic/${palette.accentIconTheme}/`,
          ),
        },
      };
    }
    if (next.contactBand?.id === "contact-main") {
      next = {
        ...next,
        contactBand: recolorContactBandDescriptor(next.contactBand, palette),
        ...(next.profilePhotoMainContactBand ? {
          profilePhotoMainContactBand: recolorContactBandDescriptor(
            next.profilePhotoMainContactBand,
            palette,
          ),
        } : {}),
      };
    }
    return next;
  });
  return stampSettings(recolored, { ...currentSettings, palette: palette.id });
}

function typographyRole(element) {
  if (element.contactBandId === "contact-main" && element.category === "text") return "contact";
  if (element.flowRole === "masthead" && element.mastheadRole === "name") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome" || element.flowRole === "sidebar-chrome") return "heading";
  if (element.flowRole === "content" && element.bold && Number(element.fontSize) >= 8.2) return "title";

  const semanticColorRole = colorRole(element, "color", element.color);
  if (
    element.flowRole === "content"
    && (semanticColorRole === "muted" || Number(element.lineHeight) <= 11.6)
  ) {
    return "meta";
  }
  // Sidebar prose starts at 8.3 pt, but its generous 12.04 pt leading marks it
  // as body copy. Treating it as metadata would under-scale the narrowest lane.
  if (element.flowRole === "content") return "body";
  return Number(element.fontSize) <= 8 ? "meta" : "body";
}

/**
 * Apply a role-aware Slate text preset from immutable baseline metrics.
 * Auto-height textareas receive conservative pre-paint heights so the shared
 * document packer can move complete records before Chromium's final measure.
 *
 * @param {object[]} elements - Current Slate canvas elements.
 * @param {string} textSizeId - Slate S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applySlateTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const currentSettings = getSlateAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale);
    if (source.contactBand?.id === "contact-main") {
      return {
        ...source,
        contactBand: resizeContactBandDescriptor(source.contactBand, scale),
        ...(source.profilePhotoMainContactBand ? {
          profilePhotoMainContactBand: resizeContactBandDescriptor(
            source.profilePhotoMainContactBand,
            scale,
          ),
        } : {}),
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
      fontSize: round(Math.max(MIN_FONT_SIZE[role] || MIN_FONT_SIZE.body, baseFontSize * fontFactor)),
    };
    if (baseLineHeight !== null) {
      next.appearanceBaseLineHeight = baseLineHeight;
      next.lineHeight = round(Math.max(next.fontSize * 1.12, baseLineHeight * lineFactor));
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
        // The editor estimator includes a 6 px editing/caret allowance for a
        // newly inserted box. Existing template records need only line boxes.
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
