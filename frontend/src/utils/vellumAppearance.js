/**
 * Premium colour and typography system for the Vellum CV template.
 *
 * Vellum always prints on white paper. Its palette contract separates the
 * full-width résumé field, the copy placed inside that field, the circular
 * portrait halo, the portrait well, short section rules, job title, page
 * number, and real contact/portrait icons. This is intentionally more precise
 * than replacing every occurrence of the authored copper or sage values.
 *
 * Typography presets scale from immutable authored metrics. Repeated
 * S -> XL -> M changes therefore restore exact Cormorant/Lora/Montserrat sizes
 * and line heights instead of accumulating rounded multipliers.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_VELLUM_PALETTE = "sage";
export const DEFAULT_VELLUM_TEXT_SIZE = "M";

export const VELLUM_PALETTES = Object.freeze([
  {
    id: "sage",
    name: "Szałwiowy Welin",
    tagline: "Lekka · papierniczy spokój",
    tone: "light",
    iconTheme: "vellum-sage",
    colors: {
      paper: "#FFFFFF", ink: "#202623", body: "#3B4540", muted: "#66706B",
      rule: "#D4DCD7", field: "#EDF2EF", accent: "#8A5E47",
      ornament: "#B47B5B", photo: "#E5ECE8", headingOnPaper: "#263B33",
      headingOnField: "#263B33", summaryText: "#3B4540",
    },
  },
  {
    id: "mist",
    name: "Błękitna Kalka",
    tagline: "Lekka · chłodna precyzja",
    tone: "light",
    iconTheme: "vellum-mist",
    colors: {
      paper: "#FFFFFF", ink: "#20262A", body: "#3A444A", muted: "#64717A",
      rule: "#D2DCE2", field: "#EDF3F6", accent: "#3F7086",
      ornament: "#A7745C", photo: "#E4EDF1", headingOnPaper: "#274F61",
      headingOnField: "#274F61", summaryText: "#3A444A",
    },
  },
  {
    id: "rose",
    name: "Różany Welin",
    tagline: "Lekka · miękki editorial",
    tone: "light",
    iconTheme: "vellum-rose",
    colors: {
      paper: "#FFFFFF", ink: "#262123", body: "#463C40", muted: "#71646A",
      rule: "#E0D5D8", field: "#F5EFF1", accent: "#805064",
      ornament: "#B57F67", photo: "#F0E5E8", headingOnPaper: "#633647",
      headingOnField: "#633647", summaryText: "#463C40",
    },
  },
  {
    id: "ink",
    name: "Atramentowy Welin",
    tagline: "Mocna · autorytet i rytm",
    tone: "strong",
    iconTheme: "vellum-ink",
    colors: {
      paper: "#FFFFFF", ink: "#1D2328", body: "#394148", muted: "#5F6972",
      rule: "#CBD5DC", field: "#243E55", accent: "#345F7B",
      ornament: "#C39A62", photo: "#DFE8EE", headingOnPaper: "#243E55",
      headingOnField: "#FFFFFF", summaryText: "#F4F7F9",
    },
  },
  {
    id: "burgundy",
    name: "Bordowa Pieczęć",
    tagline: "Mocna · kolekcjonerski druk",
    tone: "strong",
    iconTheme: "vellum-burgundy",
    colors: {
      paper: "#FFFFFF", ink: "#241E20", body: "#44393D", muted: "#6A5D62",
      rule: "#DCCDD1", field: "#6B3040", accent: "#843E51",
      ornament: "#C69A6A", photo: "#F0E2E6", headingOnPaper: "#6B3040",
      headingOnField: "#FFFFFF", summaryText: "#FFF8FA",
    },
  },
  {
    id: "emerald",
    name: "Szmaragdowy Foliał",
    tagline: "Mocna · szlachetna głębia",
    tone: "strong",
    iconTheme: "vellum-emerald",
    colors: {
      paper: "#FFFFFF", ink: "#1D2421", body: "#39443F", muted: "#5F6C66",
      rule: "#CDD9D3", field: "#205544", accent: "#2D6A57",
      ornament: "#BBA66C", photo: "#E1ECE7", headingOnPaper: "#205544",
      headingOnField: "#FFFFFF", summaryText: "#F7FBF9",
    },
  },
]);

export const VELLUM_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

// The portrait and 28.5 pt name already establish Vellum's hierarchy. Larger
// presets favour long-form Lora copy, metadata and contacts while keeping the
// widely tracked masthead and section labels editorially restrained.
const TEXT_SCALE = {
  S: {
    display: [0.98, 0.99], job: [0.97, 0.98], heading: [0.97, 0.98],
    title: [0.97, 0.98], body: [0.96, 0.97], meta: [0.97, 0.98], contact: [0.97, 0.98],
  },
  M: {
    display: [1, 1], job: [1, 1], heading: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1],
  },
  L: {
    display: [1.02, 1.02], job: [1.04, 1.035], heading: [1.04, 1.035],
    title: [1.055, 1.05], body: [1.07, 1.06], meta: [1.06, 1.05], contact: [1.055, 1.045],
  },
  XL: {
    display: [1.04, 1.035], job: [1.075, 1.06], heading: [1.075, 1.06],
    title: [1.10, 1.085], body: [1.13, 1.105], meta: [1.105, 1.08], contact: [1.095, 1.075],
  },
};

const MIN_FONT_SIZE = {
  display: 27, job: 7.8, heading: 7.2, title: 8.8,
  body: 8.1, meta: 7.2, contact: 6.8,
};

const paletteById = new Map(VELLUM_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
const GENERIC_COLOR_ROLES = ["ink", "body", "muted", "rule", "accent"];
for (const palette of VELLUM_PALETTES) {
  for (const role of GENERIC_COLOR_ROLES) {
    colorRoleByHex.set(palette.colors[role].toUpperCase(), role);
  }
}

// Documents saved before Vellum received Appearance carry these authored
// values. Ambiguous band/accent uses are resolved structurally below so the
// old page upgrades completely without recolouring unrelated manual choices.
for (const [value, role] of Object.entries({
  "#FFFEFA": "paper",
  "#20352F": "ink",
  "#3E4944": "body",
  "#6F7873": "muted",
  "#C8D1CC": "rule",
  "#A16049": "accent",
  "#E7ECE8": "field",
})) {
  colorRoleByHex.set(value, role);
}

const round = (value) => Math.round(value * 100) / 100;
const CONTACT_ICON_PATH = /\/template-assets\/iconic\/(?:cadenza|vellum(?:-[a-z0-9]+)?)\//;
const PORTRAIT_ICON_PATH = /\/template-assets\/iconic\/(?:monument(?:-[a-z0-9]+)?|vellum(?:-[a-z0-9]+)?)\/portrait\.png/;

function isPageBackground(element) {
  return element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

function isSummaryField(element) {
  return element.id === "vellum-summary-background"
    || (
      element.flowRole === "section-chrome"
      && element.category === "line"
      && Number(element.width) >= 590
      && Number(element.height) >= 12
    );
}

function isPhotoOrnament(element) {
  return element.appearanceColorRole === "ornament" || element.photoSlot === "ornament";
}

function isPhotoFrame(element) {
  return element.appearanceColorRole === "photo"
    || element.id === "vellum-photo-frame"
    || element.photoSlot === "frame";
}

function isSectionAccentRule(element) {
  return element.appearanceColorRole === "ornament"
    || (
      element.flowRole === "section-chrome"
      && element.category === "line"
      && Number(element.width) <= 30
      && Number(element.height) <= 2.5
    );
}

function isSectionHeading(element) {
  return ["text", "textarea"].includes(element.category)
    && element.flowRole === "section-chrome";
}

function isHeadingOnField(element, fields) {
  if (element.appearanceColorRole === "headingOnField") return true;
  if (element.appearanceColorRole === "headingOnPaper") return false;
  const top = Number(element.top);
  const page = Number(element.page || 1);
  return fields.some((field) => (
    Number(field.page || 1) === page
    && top >= Number(field.top) - 0.5
    && top <= Number(field.top) + Number(field.height) + 0.5
  ));
}

function isSummaryText(element, summaryBackgrounds) {
  if (element.appearanceColorRole === "summaryText") return true;
  if (element.category !== "textarea") return false;
  const top = Number(element.top);
  const page = Number(element.page || 1);
  return summaryBackgrounds.some((background) => (
    Number(background.page || 1) === page
    && top >= Number(background.top) - 0.5
    && top < Number(background.top) + Number(background.height)
  ));
}

function colorFor(value, palette) {
  const role = colorRoleByHex.get(String(value || "").toUpperCase());
  return role && palette.colors[role] ? palette.colors[role] : value;
}

function recolorMastheadTitleDescriptor(element, palette) {
  const title = element.mastheadIdentity?.title;
  if (!title?.spec) return element;
  const spec = { ...title.spec, colorHex: colorFor(title.spec.colorHex, palette) };
  const decorations = (title.decorations || []).map((decoration) => {
    const next = { ...decoration };
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      if (property in next) next[property] = colorFor(next[property], palette);
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

function recolorInlineRuns(element, palette) {
  if (!Array.isArray(element.runs)) return element;
  return {
    ...element,
    runs: element.runs.map((run) => (
      run?.color ? { ...run, color: colorFor(run.color, palette) } : run
    )),
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
      : round(Math.max(MIN_FONT_SIZE[role] || MIN_FONT_SIZE.job, baseFontSize * fontFactor)),
  };
  if (Number.isFinite(Number(spec.lineHeight))) {
    const baseLineHeight = Number(spec.appearanceBaseLineHeight ?? spec.lineHeight);
    nextSpec.appearanceBaseLineHeight = baseLineHeight;
    nextSpec.lineHeight = restoreBaseline
      ? baseLineHeight
      : round(Math.max(nextSpec.fontSizePt * 1.12, baseLineHeight * lineFactor));
  }
  if (Number.isFinite(Number(spec.height))) {
    const baseHeight = Number(spec.appearanceBaseHeight ?? spec.height);
    nextSpec.appearanceBaseHeight = baseHeight;
    nextSpec.height = restoreBaseline
      ? baseHeight
      : round(Math.max(Number(nextSpec.lineHeight) || 0, baseHeight * lineFactor));
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
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "vellum");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex(isPageBackground);
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "vellum-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "vellum",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Vellum appearance intent with safe legacy defaults.
 *
 * @param {object[]} elements - Current Vellum canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getVellumAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "vellum")
    ?? elements.find((element) => element.contactBand?.id === "vellum-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_VELLUM_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_VELLUM_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply one semantic Vellum palette without changing document geometry.
 *
 * Paper is forced to white. Field-bound text and field headings use explicit
 * contrast roles, while ordinary copy remains near-black or dark grey. Contact
 * and portrait paths switch to real PNG assets so browser and PDF ink match.
 *
 * @param {object[]} elements - Current Vellum canvas elements.
 * @param {string} paletteId - Identifier from `VELLUM_PALETTES`.
 * @returns {object[]} Recoloured elements with persisted appearance intent.
 */
export function applyVellumPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getVellumAppearance(elements);
  const fields = elements.filter((element) => isSummaryField(element));
  const summaryBackgrounds = elements.filter(
    (element) => element.id === "vellum-summary-background",
  );
  const recolored = elements.map((element) => {
    let next = recolorInlineRuns(recolorMastheadTitleDescriptor(element, palette), palette);
    if (isPageBackground(next)) {
      next = { ...next, backgroundColor: "#FFFFFF" };
    } else if (isPhotoOrnament(next) || isSectionAccentRule(next)) {
      next = { ...next, backgroundColor: palette.colors.ornament };
    } else if (isPhotoFrame(next)) {
      next = { ...next, backgroundColor: palette.colors.photo };
    } else if (isSummaryField(next)) {
      next = { ...next, backgroundColor: palette.colors.field };
    } else if (isSectionHeading(next)) {
      next = {
        ...next,
        color: isHeadingOnField(next, fields)
          ? palette.colors.headingOnField
          : palette.colors.headingOnPaper,
      };
    } else if (isSummaryText(next, summaryBackgrounds)) {
      next = { ...next, color: palette.colors.summaryText };
    } else {
      for (const property of ["color", "backgroundColor", "borderColor"]) {
        const role = colorRoleByHex.get(String(next[property] || "").toUpperCase());
        if (role && role !== "paper" && palette.colors[role]) {
          next = { ...next, [property]: palette.colors[role] };
        }
      }
    }
    if (
      next.contactBandId === "vellum-contact"
      && CONTACT_ICON_PATH.test(String(next.src || ""))
    ) {
      next = {
        ...next,
        src: String(next.src).replace(
          CONTACT_ICON_PATH,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (next.id === "vellum-photo-glyph" && PORTRAIT_ICON_PATH.test(String(next.src || ""))) {
      next = {
        ...next,
        src: String(next.src).replace(
          PORTRAIT_ICON_PATH,
          `/template-assets/iconic/${palette.iconTheme}/portrait.png`,
        ),
      };
    }
    if (next.contactBand?.id === "vellum-contact") {
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
  if (element.contactBandId === "vellum-contact" && element.category === "text") return "contact";
  if (element.flowRole === "masthead" && element.fontFamily === "CormorantGaramond") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome") return "heading";
  if (element.flowRole === "record-overlay") return "meta";

  const semanticColorRole = colorRoleByHex.get(String(element.color || "").toUpperCase());
  if (
    element.flowRole === "content"
    && Number(element.fontSize) >= 9.2
    && (element.bold || semanticColorRole === "ink")
  ) {
    return "title";
  }
  if (
    element.flowRole === "content"
    && (semanticColorRole === "muted" || Number(element.lineHeight) <= 10.5)
  ) {
    return "meta";
  }
  if (element.flowRole === "content" || element.flowRole === "grid-member") return "body";
  return Number(element.fontSize) <= 8 ? "meta" : "body";
}

/**
 * Apply a role-aware Vellum text preset from immutable authored metrics.
 *
 * Auto-height fields receive conservative pre-paint heights so the structural
 * packer can move complete records before Chromium's final measurement pass.
 * Photo geometry and decorative fills are intentionally untouched.
 *
 * @param {object[]} elements - Current Vellum canvas elements.
 * @param {string} textSizeId - Vellum S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applyVellumTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const restoreBaseline = textSizeId === DEFAULT_VELLUM_TEXT_SIZE;
  const currentSettings = getVellumAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale, restoreBaseline);
    if (source.contactBand?.id === "vellum-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 6.9,
      );
      const nextContactSize = restoreBaseline
        ? baseContactSize
        : round(Math.max(MIN_FONT_SIZE.contact, baseContactSize * scale.contact[0]));
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
        : round(Math.max(MIN_FONT_SIZE[role] || MIN_FONT_SIZE.body, baseFontSize * fontFactor)),
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
        // Existing fields need rendered line boxes, not the extra caret room
        // that the editor adds when it creates a new textarea interactively.
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
