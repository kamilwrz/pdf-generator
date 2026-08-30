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
const LINDEN_BROKEN_BOTANICAL_BAND = "#1E4037";
const LINDEN_BROKEN_BOTANICAL_TEXT = "#FBFAF6";
const LINDEN_AUTHORED_BOTANICAL_BAND = "#E5DDCB";
const LINDEN_AUTHORED_BOTANICAL_TEXT = "#1E4037";

function normalizeLindenBotanicalIdentity(element) {
  let next = element;
  const isIdentityBand = element.titleDecoration === "identity-band"
    || (element.mastheadBandId === "linden-masthead" && element.category === "rectangle");
  if (
    isIdentityBand
    && String(element.backgroundColor || "").toUpperCase() === LINDEN_BROKEN_BOTANICAL_BAND
  ) {
    next = { ...next, backgroundColor: LINDEN_AUTHORED_BOTANICAL_BAND };
  }

  const isJobTitle = element.mastheadBandId === "linden-masthead"
    && element.category === "textarea"
    && element.mastheadRole === "title";
  if (
    isJobTitle
    && String(element.color || "").toUpperCase() === LINDEN_BROKEN_BOTANICAL_TEXT
  ) {
    next = { ...next, color: LINDEN_AUTHORED_BOTANICAL_TEXT };
  }

  const identity = element.mastheadIdentity;
  const title = identity?.id === "linden-masthead" ? identity.title : null;
  if (!title?.spec) return next;
  const spec = String(title.spec.colorHex || "").toUpperCase() === LINDEN_BROKEN_BOTANICAL_TEXT
    ? { ...title.spec, colorHex: LINDEN_AUTHORED_BOTANICAL_TEXT }
    : title.spec;
  const decorations = (title.decorations || []).map((decoration) => (
    decoration.titleDecoration === "identity-band"
      && String(decoration.backgroundColor || "").toUpperCase() === LINDEN_BROKEN_BOTANICAL_BAND
      ? { ...decoration, backgroundColor: LINDEN_AUTHORED_BOTANICAL_BAND }
      : decoration
  ));
  const descriptorChanged = spec !== title.spec
    || decorations.some((decoration, index) => decoration !== title.decorations[index]);
  if (!descriptorChanged) return next;
  return {
    ...next,
    mastheadIdentity: {
      ...identity,
      title: { ...title, spec, decorations },
    },
  };
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

/**
 * Upgrades known persisted Sterling/Linden values that predate current
 * template contracts.
 *
 * Only exact legacy shapes are changed: 1.4-point section ticks in either
 * template, Linden's 0.8-point fixed footer rule, and the short-lived green
 * Botanical identity band regression. The colour migration is limited to a
 * document explicitly persisted with the Botanical palette, and it updates
 * only the masthead title, its semantic band, and their restore descriptor.
 * User-authored lines, custom colours, and every other palette stay untouched.
 *
 * @param {object[]} elements - Materialized canvas elements from persistence.
 * @param {string|null|undefined} templateId - Saved document template id.
 * @returns {object[]} The original array when no migration is required.
 */
export function normalizeSterlingFamilyPersistence(elements = [], templateId = null) {
  const normalizedId = String(templateId || "").toLowerCase();
  if (normalizedId !== "sterling" && normalizedId !== "linden") return elements;
  const isBotanicalLinden = normalizedId === "linden" && elements.some((element) => (
    element.appearanceTemplateId === "linden"
    && element.appearanceSettings?.palette === "botanical"
  ));

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
    let next = isLegacySectionTick || isLegacyLindenFooter
      ? { ...element, height: SIDEBAR_HAIRLINE_HEIGHT }
      : element;
    if (isBotanicalLinden) next = normalizeLindenBotanicalIdentity(next);
    if (next !== element) changed = true;
    return next;
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
    let next = recolorMastheadTitleDescriptor(element, palette);
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      const role = colorRoleByHex.get(String(next[property] || "").toUpperCase());
      if (role) next = { ...next, [property]: palette.colors[role] };
    }
    if (/\/template-assets\/iconic\/sterling(?:-[^/]+)?\//.test(String(next.src || ""))) {
      next = {
        ...next,
        src: String(next.src).replace(
          /\/template-assets\/iconic\/sterling(?:-[^/]+)?\//,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (next.contactBand?.id === "sterling-contact") {
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
    const source = resizeMastheadTitleDescriptor(element, scale);
    if (source.contactBand?.id === "sterling-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 9.4,
      );
      const nextContactSize = round(Math.max(
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
            charWidth: round(baseMetrics.charWidth * scale.contact[0]),
            lineStep: round(baseMetrics.lineStep * scale.contact[1]),
          },
        },
      };
    }
    if (!["text", "textarea"].includes(source.category) || Number(source.fontSize) <= 1) return source;
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
      // A type preset changes every textarea in one state update. Waiting for
      // independent DOM measurements leaves the structural packer with a mix
      // of old heights and new font metrics, so later blocks can be placed on
      // top of text that has already wrapped. Seed a conservative height from
      // the same canvas-side estimator used by structural builders; the live
      // browser measurement still refines it after render.
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
