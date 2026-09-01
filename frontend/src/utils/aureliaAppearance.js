/**
 * Semantic Appearance contract for the framed Aurelia template.
 *
 * Palettes recolor roles rather than matching isolated elements. Geometry is
 * immutable: the identity outline, contact band, section rules, date rail,
 * and one-column flow keep the generator's authored coordinates. Typography
 * presets store their M baselines so repeated S/L/XL changes are reversible.
 */
import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_AURELIA_PALETTE = "gilded";
export const DEFAULT_AURELIA_TEXT_SIZE = "M";

export const AURELIA_PALETTES = Object.freeze([
  {
    id: "gilded",
    name: "Złocona Oliwka",
    tagline: "Lekka · jak w referencji",
    tone: "light",
    iconTheme: "aurelia-gilded",
    colors: {
      paper: "#FFFFFF", ink: "#31312F", body: "#4A4B47", muted: "#6A6C66",
      rule: "#D6D1BC", accent: "#98884D", heading: "#353632",
    },
  },
  {
    id: "pewter",
    name: "Chłodny Pewter",
    tagline: "Lekka · neutralna precyzja",
    tone: "light",
    iconTheme: "aurelia-pewter",
    colors: {
      paper: "#FFFFFF", ink: "#2D3331", body: "#48504D", muted: "#66706C",
      rule: "#D2D9D6", accent: "#68726E", heading: "#303936",
    },
  },
  {
    id: "sage",
    name: "Szałwiowy Gabinet",
    tagline: "Lekka · spokojna zieleń",
    tone: "light",
    iconTheme: "aurelia-sage",
    colors: {
      paper: "#FFFFFF", ink: "#29312D", body: "#45504A", muted: "#647069",
      rule: "#D1DAD4", accent: "#4E6D5C", heading: "#304239",
    },
  },
  {
    id: "cobalt",
    name: "Kobaltowy Kontur",
    tagline: "Mocna · chłodny autorytet",
    tone: "strong",
    iconTheme: "aurelia-cobalt",
    colors: {
      paper: "#FFFFFF", ink: "#202C34", body: "#3C4A52", muted: "#60707A",
      rule: "#CAD7DE", accent: "#356486", heading: "#243E50",
    },
  },
  {
    id: "burgundy",
    name: "Burgundowa Rama",
    tagline: "Mocna · klasyczny editorial",
    tone: "strong",
    iconTheme: "aurelia-burgundy",
    colors: {
      paper: "#FFFFFF", ink: "#302528", body: "#504247", muted: "#746268",
      rule: "#DDCFD4", accent: "#7E4050", heading: "#4A2D36",
    },
  },
  {
    id: "noir",
    name: "Noir i Złoto",
    tagline: "Mocna · wysoki kontrast",
    tone: "strong",
    iconTheme: "aurelia-noir",
    colors: {
      paper: "#FFFFFF", ink: "#181818", body: "#373737", muted: "#606060",
      rule: "#D8D0BF", accent: "#A17C39", heading: "#202020",
    },
  },
]);

export const AURELIA_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

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
  display: 28, job: 7.6, heading: 7.2, title: 9.0,
  body: 8.1, meta: 7.2, contact: 6.8,
};

const paletteById = new Map(AURELIA_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of AURELIA_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    colorRoleByHex.set(value.toUpperCase(), role);
  }
}

const round = (value) => Math.round(value * 100) / 100;
const CONTACT_ICON_PATH = /\/template-assets\/iconic\/aurelia(?:-[a-z0-9]+)?\//;

function isPageBackground(element) {
  return element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

function colorFor(value, palette) {
  const role = colorRoleByHex.get(String(value || "").toUpperCase());
  return role ? palette.colors[role] : value;
}

function recolorMastheadTitleDescriptor(element, palette) {
  const title = element.mastheadIdentity?.title;
  if (!title?.spec) return element;
  return {
    ...element,
    mastheadIdentity: {
      ...element.mastheadIdentity,
      title: {
        ...title,
        spec: { ...title.spec, colorHex: colorFor(title.spec.colorHex, palette) },
        decorations: (title.decorations || []).map((decoration) => {
          const next = { ...decoration };
          for (const property of ["color", "backgroundColor", "borderColor"]) {
            if (property in next) next[property] = colorFor(next[property], palette);
          }
          return next;
        }),
      },
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
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "aurelia");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex(isPageBackground);
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "aurelia-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "aurelia",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Aurelia appearance intent with safe defaults.
 *
 * @param {object[]} elements - Current Aurelia canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getAureliaAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "aurelia")
    ?? elements.find((element) => element.contactBand?.id === "aurelia-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_AURELIA_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_AURELIA_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply one Aurelia palette without changing frame or document geometry.
 *
 * Contact paths switch to real PNG assets, while colors on user-created
 * elements remain untouched unless they match an authored semantic token.
 *
 * @param {object[]} elements - Current Aurelia canvas elements.
 * @param {string} paletteId - Identifier from `AURELIA_PALETTES`.
 * @returns {object[]} Recolored elements with persisted appearance intent.
 */
export function applyAureliaPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getAureliaAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorInlineRuns(recolorMastheadTitleDescriptor(element, palette), palette);
    if (isPageBackground(next)) {
      next = { ...next, backgroundColor: "#FFFFFF" };
    } else {
      for (const property of ["color", "backgroundColor", "borderColor"]) {
        const role = colorRoleByHex.get(String(next[property] || "").toUpperCase());
        if (role && role !== "paper") {
          next = { ...next, [property]: palette.colors[role] };
        }
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
    if (next.contactBand?.id === "aurelia-contact") {
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
  if (element.contactBandId === "aurelia-contact" && element.category === "text") return "contact";
  if (element.mastheadRole === "name") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome") return "heading";
  if (element.flowRole === "record-overlay") return "meta";

  const semanticColorRole = colorRoleByHex.get(String(element.color || "").toUpperCase());
  if (
    element.flowRole === "content"
    && Number(element.fontSize) >= 9.2
    && (element.bold || semanticColorRole === "ink")
  ) return "title";
  if (
    element.flowRole === "content"
    && (semanticColorRole === "muted" || Number(element.lineHeight) <= 10.5)
  ) return "meta";
  if (element.flowRole === "content" || element.flowRole === "grid-member") return "body";
  return Number(element.fontSize) <= 8 ? "meta" : "body";
}

/**
 * Apply a role-aware Aurelia text preset from immutable authored metrics.
 *
 * @param {object[]} elements - Current Aurelia canvas elements.
 * @param {string} textSizeId - Aurelia S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applyAureliaTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const restoreBaseline = textSizeId === DEFAULT_AURELIA_TEXT_SIZE;
  const currentSettings = getAureliaAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale, restoreBaseline);
    if (source.contactBand?.id === "aurelia-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 7.0,
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
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
