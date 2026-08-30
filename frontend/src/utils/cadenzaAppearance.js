/**
 * Premium colour and typography system for the Cadenza CV template.
 *
 * Cadenza always prints on white paper. Its six palettes are deliberately
 * split into three light editorial fields and three strong colour fields.
 * Section labels own an explicit field/text pair, so light variants use dark
 * tonal labels while strong variants reverse to white without changing the
 * geometry of the authored 479 pt heading band.
 *
 * Palette changes target recognised semantic colours, Cadenza section chrome,
 * the latent masthead title, inline accent runs, and real PNG contact assets.
 * Unrecognised user colours remain untouched. Typography presets scale from
 * immutable authored metrics so returning to M restores the exact baseline.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_CADENZA_PALETTE = "porcelain";
export const DEFAULT_CADENZA_TEXT_SIZE = "M";

export const CADENZA_PALETTES = Object.freeze([
  {
    id: "porcelain",
    name: "Porcelanowa Sepia",
    tagline: "Lekka · ciepły editorial",
    tone: "light",
    iconTheme: "cadenza-porcelain",
    colors: {
      paper: "#FFFFFF", ink: "#24292C", body: "#3F4547", muted: "#606A6E",
      rule: "#D6DDE0", band: "#F0F2F2", accent: "#855C46",
      mark: "#B88465", headingText: "#2D3437",
    },
  },
  {
    id: "mist",
    name: "Mglisty Błękit",
    tagline: "Lekka · chłodna precyzja",
    tone: "light",
    iconTheme: "cadenza-mist",
    colors: {
      paper: "#FFFFFF", ink: "#20282C", body: "#3B464B", muted: "#5C6A70",
      rule: "#D1DCE0", band: "#ECF2F4", accent: "#3F6F85",
      mark: "#78A0B1", headingText: "#243A44",
    },
  },
  {
    id: "sage",
    name: "Szałwiowa Perła",
    tagline: "Lekka · naturalny spokój",
    tone: "light",
    iconTheme: "cadenza-sage",
    colors: {
      paper: "#FFFFFF", ink: "#222824", body: "#3D4740", muted: "#5F6C63",
      rule: "#D3DDD6", band: "#EEF3EF", accent: "#4B725C",
      mark: "#80A08B", headingText: "#2A4133",
    },
  },
  {
    id: "cobalt",
    name: "Kobaltowa Partytura",
    tagline: "Mocna · pewna i nowoczesna",
    tone: "strong",
    iconTheme: "cadenza-cobalt",
    colors: {
      paper: "#FFFFFF", ink: "#1B2026", body: "#353D45", muted: "#596570",
      rule: "#C9D3DC", band: "#244F78", accent: "#245F91",
      mark: "#D6AE68", headingText: "#FFFFFF",
    },
  },
  {
    id: "burgundy",
    name: "Burgundowy Akord",
    tagline: "Mocna · głęboki editorial",
    tone: "strong",
    iconTheme: "cadenza-burgundy",
    colors: {
      paper: "#FFFFFF", ink: "#211B1D", body: "#41363A", muted: "#685A60",
      rule: "#D8CBD0", band: "#6C2A3E", accent: "#85364F",
      mark: "#D4A06A", headingText: "#FFFFFF",
    },
  },
  {
    id: "emerald",
    name: "Szmaragdowa Kadencja",
    tagline: "Mocna · szlachetny kontrast",
    tone: "strong",
    iconTheme: "cadenza-emerald",
    colors: {
      paper: "#FFFFFF", ink: "#19211D", body: "#35413C", muted: "#5C6963",
      rule: "#CDD8D2", band: "#1F5944", accent: "#23664F",
      mark: "#B4C67A", headingText: "#FFFFFF",
    },
  },
]);

export const CADENZA_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

// Cadenza's Playfair identity already dominates the page. L and XL therefore
// favour Lora body copy and small metadata, while keeping the section bands
// compact and preserving the template's refined editorial rhythm.
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
  display: 26, job: 7.9, heading: 7.2, title: 8.9,
  body: 8.1, meta: 7.2, contact: 7,
};

const paletteById = new Map(CADENZA_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of CADENZA_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    colorRoleByHex.set(value.toUpperCase(), role);
  }
}

// Documents saved before Cadenza received Appearance carry these authored
// values. Register them as semantic aliases so one palette selection upgrades
// the complete document while still preserving unrelated manual colours.
for (const [value, role] of Object.entries({
  "#FFFEFB": "paper",
  "#263238": "ink",
  "#42494B": "body",
  "#72797B": "muted",
  "#E8EDEE": "band",
  "#CCD4D5": "rule",
  "#9B735A": "accent",
})) {
  colorRoleByHex.set(value, role);
}

const round = (value) => Math.round(value * 100) / 100;
const CONTACT_ICON_PATH = /\/template-assets\/iconic\/cadenza(?:-[a-z0-9]+)?\//;

function isPageBackground(element) {
  return element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

function isSectionBand(element) {
  return element.category === "line"
    && element.flowRole === "section-chrome"
    && Number(element.width) >= 450
    && Number(element.height) >= 12;
}

function isSectionMark(element) {
  return element.category === "line"
    && element.flowRole === "section-chrome"
    && Number(element.width) <= 6
    && Number(element.height) >= 12;
}

function isSectionHeading(element) {
  return ["text", "textarea"].includes(element.category)
    && element.flowRole === "section-chrome";
}

function colorFor(value, palette) {
  const role = colorRoleByHex.get(String(value || "").toUpperCase());
  return role ? palette.colors[role] : value;
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
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "cadenza");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex(isPageBackground);
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "cadenza-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "cadenza",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Cadenza appearance intent with safe legacy defaults.
 *
 * @param {object[]} elements - Current Cadenza canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getCadenzaAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "cadenza")
    ?? elements.find((element) => element.contactBand?.id === "cadenza-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_CADENZA_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_CADENZA_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply one semantic Cadenza palette without changing document geometry.
 *
 * Paper is forced to white. Section fields, contrasting labels and register
 * marks use structural roles because older Cadenza documents stored the same
 * copper value for multiple purposes. Contact paths switch to real PNG assets
 * so the editor and ReportLab export use identical icon ink.
 *
 * @param {object[]} elements - Current Cadenza canvas elements.
 * @param {string} paletteId - Identifier from `CADENZA_PALETTES`.
 * @returns {object[]} Recoloured elements with persisted appearance intent.
 */
export function applyCadenzaPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getCadenzaAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorInlineRuns(recolorMastheadTitleDescriptor(element, palette), palette);
    if (isPageBackground(next)) {
      next = { ...next, backgroundColor: "#FFFFFF" };
    } else if (isSectionMark(next)) {
      next = { ...next, backgroundColor: palette.colors.mark };
    } else if (isSectionBand(next)) {
      next = { ...next, backgroundColor: palette.colors.band };
    } else if (isSectionHeading(next)) {
      next = { ...next, color: palette.colors.headingText };
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
    if (next.contactBand?.id === "cadenza-contact") {
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
  if (element.contactBandId === "cadenza-contact" && element.category === "text") return "contact";
  if (element.flowRole === "masthead" && element.fontFamily === "PlayfairDisplay") return "display";
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
 * Apply a role-aware Cadenza text preset from immutable authored metrics.
 *
 * Auto-height fields receive conservative pre-paint heights so the structural
 * packer can move complete records before Chromium's final measurement pass.
 *
 * @param {object[]} elements - Current Cadenza canvas elements.
 * @param {string} textSizeId - Cadenza S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applyCadenzaTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const restoreBaseline = textSizeId === DEFAULT_CADENZA_TEXT_SIZE;
  const currentSettings = getCadenzaAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale, restoreBaseline);
    if (source.contactBand?.id === "cadenza-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 7.2,
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
