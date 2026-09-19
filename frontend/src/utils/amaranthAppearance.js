import { t as uiText } from "../i18n/index.js";
import { measureTextareaHeight } from "./textareaHeight.js";

/**
 * Curated colour and typography system for the Amaranth CV template.
 *
 * Amaranth always prints on white paper. A palette therefore recolours only
 * recognised roles — name/record ink, body and metadata copy, the claret
 * accent used by the section chips / role line / accent bar / page number, the
 * photo ornament plate and well, the summary field, structural rules, and the
 * real-ink contact/portrait icon theme. The full-page background is forced back
 * to white even when an older saved document carries a different paper colour.
 *
 * Typography presets scale the *content* — record titles, body copy, metadata,
 * the role line, and contacts — while the display name and the rounded section
 * chip labels stay a constant size (factor 1.0). Keeping the name fixed avoids
 * disturbing its wrapped-name fit; keeping the chip labels fixed prevents a
 * larger label from overflowing its authored rounded rectangle. Baselines are
 * immutable, so XL -> S -> M restores the exact authored metrics without drift.
 */

export const DEFAULT_AMARANTH_PALETTE = "claret";
export const DEFAULT_AMARANTH_TEXT_SIZE = "M";

export const AMARANTH_PALETTES = Object.freeze([
  {
    id: "claret",
    get name() { return uiText("editor:amaranthAppearance.claretAmaranth"); },
    get tagline() { return uiText("editor:amaranthAppearance.whitePaperAndDeepWineAccents"); },
    iconTheme: "amaranth-claret",
    colors: {
      paper: "#FFFFFF", ink: "#2C1A22", body: "#3A2E33", muted: "#7E6870",
      accent: "#78304A", ornament: "#9A5568", field: "#F5EDEF",
      photo: "#EFE4E8", rule: "#E4D8DC",
    },
  },
  {
    id: "ink",
    get name() { return uiText("editor:amaranthAppearance.inkBlue"); },
    get tagline() { return uiText("editor:amaranthAppearance.whitePaperAndDeepNavyAccents"); },
    iconTheme: "amaranth-ink",
    colors: {
      paper: "#FFFFFF", ink: "#1B2733", body: "#333F4A", muted: "#6A7681",
      accent: "#2E4A63", ornament: "#5C7690", field: "#EDF1F5",
      photo: "#E2E9F0", rule: "#D6DEE6",
    },
  },
  {
    id: "forest",
    get name() { return uiText("editor:amaranthAppearance.forestLaurel"); },
    get tagline() { return uiText("editor:amaranthAppearance.whitePaperAndDeepGreenAccents"); },
    iconTheme: "amaranth-forest",
    colors: {
      paper: "#FFFFFF", ink: "#1E2B24", body: "#333F38", muted: "#6A766E",
      accent: "#2F5C43", ornament: "#5E8570", field: "#EBF1ED",
      photo: "#E0EBE4", rule: "#D5E0D9",
    },
  },
  {
    id: "copper",
    get name() { return uiText("editor:amaranthAppearance.copperDusk"); },
    get tagline() { return uiText("editor:amaranthAppearance.whitePaperAndWarmTerracottaAccents"); },
    iconTheme: "amaranth-copper",
    colors: {
      paper: "#FFFFFF", ink: "#2E211A", body: "#40352E", muted: "#7C6C63",
      accent: "#9E5230", ornament: "#BE7E5C", field: "#F6ECE4",
      photo: "#F0E1D6", rule: "#E6D8CC",
    },
  },
  {
    id: "plum",
    get name() { return uiText("editor:amaranthAppearance.plumVelvet"); },
    get tagline() { return uiText("editor:amaranthAppearance.whitePaperAndMutedAubergineAccents"); },
    iconTheme: "amaranth-plum",
    colors: {
      paper: "#FFFFFF", ink: "#251C2B", body: "#3A3340", muted: "#746A7C",
      accent: "#593F6B", ornament: "#7E6592", field: "#F1ECF5",
      photo: "#E9E1EF", rule: "#DED5E5",
    },
  },
  {
    id: "graphite",
    get name() { return uiText("editor:amaranthAppearance.graphiteModern"); },
    get tagline() { return uiText("editor:amaranthAppearance.whitePaperAndCharcoalGreyAccents"); },
    iconTheme: "amaranth-graphite",
    colors: {
      paper: "#FFFFFF", ink: "#1E1F21", body: "#38393B", muted: "#6E7276",
      accent: "#3A3E42", ornament: "#6B7075", field: "#EEEFF0",
      photo: "#E4E5E7", rule: "#DADBDD",
    },
  },
]);

export const AMARANTH_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", get description() { return uiText("editor:atriumAppearance.compact"); } },
  { id: "M", label: "M", get description() { return uiText("editor:atriumAppearance.original"); } },
  { id: "L", label: "L", get description() { return uiText("editor:atriumAppearance.readable"); } },
  { id: "XL", label: "XL", get description() { return uiText("editor:atriumAppearance.bold"); } },
]);

// The Playfair name and the rounded chip labels stay fixed (factor 1.0): the
// name has a wrapped-fit contract and the chip label must not outgrow its
// authored rounded rectangle. Only the reading content scales.
const TEXT_SCALE = {
  S: {
    display: [1, 1], heading: [1, 1], job: [0.97, 0.98], title: [0.97, 0.98],
    body: [0.95, 0.96], meta: [0.96, 0.97], contact: [0.96, 0.97],
  },
  M: {
    display: [1, 1], heading: [1, 1], job: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1],
  },
  L: {
    display: [1, 1], heading: [1, 1], job: [1.05, 1.04], title: [1.05, 1.04],
    body: [1.075, 1.06], meta: [1.06, 1.05], contact: [1.05, 1.04],
  },
  XL: {
    display: [1, 1], heading: [1, 1], job: [1.1, 1.08], title: [1.1, 1.08],
    body: [1.14, 1.11], meta: [1.1, 1.08], contact: [1.1, 1.08],
  },
};

const MIN_FONT_SIZE = {
  display: 20, heading: 7, job: 8, title: 9, body: 8, meta: 7.2, contact: 7,
};

const paletteById = new Map(AMARANTH_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of AMARANTH_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    colorRoleByHex.set(value.toUpperCase(), role);
  }
}
// Explicit tag -> palette colour role. Amaranth stamps these on the elements
// whose default hex could otherwise be ambiguous (the white chip label, the
// photo well and ornament plate, the summary field, the accent chips/bar).
const APPEARANCE_ROLE_TO_COLOR = {
  ink: "ink", body: "body", muted: "muted", accent: "accent",
  ornament: "ornament", field: "field", photo: "photo", rule: "rule",
  headingOnAccent: "chipText",
};

const round = (value) => Math.round(value * 100) / 100;
// Chip labels stay white on the accent fill in every palette.
const CHIP_TEXT = "#FFFFFF";
const CONTACT_ICON_PATH = /\/template-assets\/iconic\/amaranth(?:-[a-z0-9]+)?\//;

function isPageBackground(element) {
  return element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

function paletteColorForRole(palette, role) {
  if (role === "chipText") return CHIP_TEXT;
  return palette.colors[role];
}

function recolorMastheadTitleDescriptor(element, palette) {
  const title = element.mastheadIdentity?.title;
  if (!title?.spec) return element;
  const colorFor = (value) => {
    const role = colorRoleByHex.get(String(value || "").toUpperCase());
    return role ? paletteColorForRole(palette, role) : value;
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
    mastheadIdentity: { ...element.mastheadIdentity, title: { ...title, spec, decorations } },
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
    mastheadIdentity: { ...element.mastheadIdentity, title: { ...title, spec: nextSpec } },
  };
}

function settingsAnchorIndex(elements) {
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "amaranth");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex(isPageBackground);
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "amaranth-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "amaranth",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Amaranth appearance intent with defaults for older files.
 *
 * @param {object[]} elements - Current Amaranth canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getAmaranthAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "amaranth")
    ?? elements.find((element) => element.contactBand?.id === "amaranth-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_AMARANTH_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_AMARANTH_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply an Amaranth palette while preserving white paper and custom colours.
 *
 * Elements carrying an explicit ``appearanceColorRole`` are recoloured by role;
 * every other recognised text/rule/fill colour is matched by hex. Contact icon
 * paths switch to the palette's real-ink theme so the canvas and the ReportLab
 * export use the same ink.
 *
 * @param {object[]} elements - Current Amaranth canvas elements.
 * @param {string} paletteId - Identifier from ``AMARANTH_PALETTES``.
 * @returns {object[]} Recoloured elements with persisted appearance intent.
 */
export function applyAmaranthPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getAmaranthAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorMastheadTitleDescriptor(element, palette);
    if (isPageBackground(next)) {
      return { ...next, backgroundColor: palette.colors.paper };
    }
    // Explicit role tags win: they carry the semantic even when two roles share
    // a similar hex (e.g. the summary field vs the photo well).
    const taggedRole = APPEARANCE_ROLE_TO_COLOR[next.appearanceColorRole];
    if (taggedRole) {
      const value = paletteColorForRole(palette, taggedRole);
      if (value) {
        if (next.category === "text" || next.category === "textarea") next = { ...next, color: value };
        else next = { ...next, backgroundColor: value };
      }
    } else {
      for (const property of ["color", "backgroundColor", "borderColor"]) {
        const role = colorRoleByHex.get(String(next[property] || "").toUpperCase());
        if (role && role !== "paper" && role !== "chipText") {
          next = { ...next, [property]: paletteColorForRole(palette, role) };
        }
      }
    }
    if (CONTACT_ICON_PATH.test(String(next.src || ""))) {
      next = {
        ...next,
        src: String(next.src).replace(CONTACT_ICON_PATH, `/template-assets/iconic/${palette.iconTheme}/`),
      };
    }
    if (next.contactBand?.id === "amaranth-contact") {
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
  if (element.contactBandId === "amaranth-contact" && ["text", "textarea"].includes(element.category)) return "contact";
  if (element.flowRole === "masthead" && element.fontFamily === "PlayfairDisplay") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome") return "heading";
  if (element.flowRole === "record-overlay") return "meta";

  const semanticColorRole = colorRoleByHex.get(String(element.color || "").toUpperCase());
  if (element.flowRole === "content" && Number(element.fontSize) >= 9.4
    && (element.bold || semanticColorRole === "ink")) {
    return "title";
  }
  if (element.flowRole === "content"
    && (semanticColorRole === "muted" || Number(element.lineHeight) <= 10.6)) {
    return "meta";
  }
  if (element.flowRole === "content") return "body";
  return Number(element.fontSize) <= 8 ? "meta" : "body";
}

/**
 * Apply a role-aware Amaranth text preset from immutable baseline metrics.
 * Auto-height fields receive conservative pre-paint heights so the structural
 * packer can move complete records before Chromium's final measurement pass.
 *
 * @param {object[]} elements - Current Amaranth canvas elements.
 * @param {string} textSizeId - Amaranth S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applyAmaranthTextSize(elements = [], textSizeId, { measureTextWidth = null } = {}) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const restoreBaseline = textSizeId === DEFAULT_AMARANTH_TEXT_SIZE;
  const currentSettings = getAmaranthAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale, restoreBaseline);
    if (source.contactBand?.id === "amaranth-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 7,
      );
      const nextContactSize = restoreBaseline
        ? baseContactSize
        : round(Math.max(MIN_FONT_SIZE.contact, baseContactSize * scale.contact[0]));
      const baseMetrics = source.contactBand.appearanceBaseMetrics ?? source.contactBand.metrics;
      return {
        ...source,
        contactBand: {
          ...source.contactBand,
          appearanceBaseFontSize: baseContactSize,
          appearanceBaseMetrics: baseMetrics,
          text: {
            ...source.contactBand.text, fontSizePt: nextContactSize,
            ...(source.contactBand.text.lineHeightPt == null ? {} : {
              lineHeightPt: restoreBaseline
                ? (source.contactBand.appearanceBaseLineHeight ?? source.contactBand.text.lineHeightPt)
                : round((source.contactBand.appearanceBaseLineHeight ?? source.contactBand.text.lineHeightPt) * scale.contact[1]),
            }),
          },
          appearanceBaseLineHeight: source.contactBand.appearanceBaseLineHeight ?? source.contactBand.text.lineHeightPt,
          metrics: {
            ...source.contactBand.metrics,
            charWidth: restoreBaseline ? baseMetrics.charWidth : round(baseMetrics.charWidth * scale.contact[0]),
            lineStep: restoreBaseline ? baseMetrics.lineStep : round(baseMetrics.lineStep * scale.contact[1]),
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
    const baseLineHeight = hasLineHeight ? Number(source.appearanceBaseLineHeight ?? source.lineHeight) : null;
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
          next.content, next.width, next.fontSize, next.lineHeight,
          { bulletList: next.bulletList, measureTextWidth, textStyle: next },
        );
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
