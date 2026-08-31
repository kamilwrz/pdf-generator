/**
 * Premium appearance system for the Regent CV template.
 *
 * Regent keeps one editorial geometry while six curated editions change the
 * paper, semantic text hierarchy, rules, folio, and real raster icons. Four
 * editions remain classically light; two use deep coloured paper with a warm
 * metallic accent. Unknown user-assigned colours are never overwritten.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_REGENT_PALETTE = "monochrome";
export const DEFAULT_REGENT_TEXT_SIZE = "M";

export const REGENT_PALETTES = Object.freeze([
  {
    id: "monochrome",
    name: "Monochromatyczny Regent",
    tagline: "Klasyczna · czysta hierarchia",
    group: "classic",
    iconTheme: "regent",
    colors: {
      paper: "#FFFFFF",
      ink: "#151515",
      body: "#242424",
      muted: "#6A6A6A",
      rule: "#CFCFCF",
      accent: "#151515",
      folio: "#6A6A6A",
    },
  },
  {
    id: "ivory",
    name: "Gabinet Ivory",
    tagline: "Klasyczna · ciepły papier",
    group: "classic",
    iconTheme: "regent-ivory",
    colors: {
      paper: "#F6F0E5",
      ink: "#211D18",
      body: "#342E27",
      muted: "#6B6257",
      rule: "#C9BEAE",
      accent: "#765536",
      folio: "#765536",
    },
  },
  {
    id: "pearl",
    name: "Perłowa Kancelaria",
    tagline: "Klasyczna · chłodna elegancja",
    group: "classic",
    iconTheme: "regent-pearl",
    colors: {
      paper: "#EEF2F4",
      ink: "#172630",
      body: "#2E3D46",
      muted: "#5B6971",
      rule: "#B8C4C9",
      accent: "#355D73",
      folio: "#355D73",
    },
  },
  {
    id: "sage",
    name: "Szałwiowe Archiwum",
    tagline: "Klasyczna · mineralna zieleń",
    group: "classic",
    iconTheme: "regent-sage",
    colors: {
      paper: "#EEF0E8",
      ink: "#20271F",
      body: "#343E34",
      muted: "#5E695C",
      rule: "#BFC6B8",
      accent: "#466049",
      folio: "#466049",
    },
  },
  {
    id: "sapphire",
    name: "Szafirowa Noc",
    tagline: "Kreatywna · złoto na granacie",
    group: "creative",
    iconTheme: "regent-sapphire",
    colors: {
      paper: "#102B3D",
      ink: "#FFF9EF",
      body: "#F3EADF",
      muted: "#C4D0D5",
      rule: "#607B8C",
      accent: "#E2BD72",
      folio: "#E2BD72",
    },
  },
  {
    id: "burgundy",
    name: "Burgundowy Salon",
    tagline: "Kreatywna · ceremonialna głębia",
    group: "creative",
    iconTheme: "regent-burgundy",
    colors: {
      paper: "#521B2A",
      ink: "#FFF9F3",
      body: "#F5E9E7",
      muted: "#D8BDC1",
      rule: "#9B6B78",
      accent: "#E6BE78",
      folio: "#E6BE78",
    },
  },
]);

export const REGENT_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

// Display type scales conservatively so Regent's Cormorant masthead keeps its
// premium restraint while long Montserrat copy receives the larger change.
const TEXT_SCALE = {
  S: {
    display: [0.98, 0.99], job: [0.97, 0.98], heading: [0.97, 0.98],
    title: [0.96, 0.97], body: [0.95, 0.96], meta: [0.96, 0.97], contact: [0.96, 0.97],
  },
  M: {
    display: [1, 1], job: [1, 1], heading: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1],
  },
  L: {
    display: [1.03, 1.02], job: [1.05, 1.04], heading: [1.05, 1.04],
    title: [1.06, 1.05], body: [1.07, 1.06], meta: [1.05, 1.04], contact: [1.05, 1.04],
  },
  XL: {
    display: [1.06, 1.04], job: [1.09, 1.07], heading: [1.09, 1.07],
    title: [1.11, 1.09], body: [1.13, 1.10], meta: [1.09, 1.07], contact: [1.08, 1.06],
  },
};

const MIN_FONT_SIZE = {
  display: 28,
  job: 8.7,
  heading: 8.2,
  title: 9,
  body: 8.2,
  meta: 7.8,
  contact: 8,
};

const paletteById = new Map(REGENT_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of REGENT_PALETTES) {
  // Accent and folio are resolved structurally. Excluding them prevents the
  // original monochrome accent (#151515) from stealing Regent's ink role.
  for (const role of ["paper", "ink", "body", "muted", "rule"]) {
    colorRoleByHex.set(palette.colors[role].toUpperCase(), role);
  }
}

const REGENT_ICON_PATH = /\/template-assets\/iconic\/regent(?:-[a-z0-9]+)?\//;
const round = (value) => Math.round(value * 100) / 100;

function isPageBackground(element) {
  return element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

function isFolio(element) {
  return ["text", "textarea"].includes(element.category)
    && element.fixedToPage
    && Number(element.top) >= 780
    && /^\d{2}$/.test(String(element.content || "").trim());
}

function isSectionHeading(element) {
  return ["text", "textarea"].includes(element.category)
    && element.flowRole === "section-chrome";
}

function isMastheadName(element) {
  return ["text", "textarea"].includes(element.category)
    && element.flowRole === "masthead"
    && element.mastheadRole === "name";
}

function isMastheadTitle(element) {
  return ["text", "textarea"].includes(element.category)
    && element.flowRole === "masthead"
    && element.mastheadRole === "title";
}

function colorFor(value, palette) {
  const role = colorRoleByHex.get(String(value || "").toUpperCase());
  return role ? palette.colors[role] : value;
}

function recolorMastheadTitleDescriptor(element, palette) {
  const title = element.mastheadIdentity?.title;
  if (!title?.spec) return element;
  const spec = { ...title.spec, colorHex: palette.colors.accent };
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

function settingsAnchorIndex(elements) {
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "regent");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex((element) => (
    isPageBackground(element) && Number(element.page || 1) === 1
  ));
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "regent-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "regent",
    appearanceSettings: nextSettings,
  } : element);
}

/** Return Regent's persisted appearance intent with safe defaults for legacy CVs. */
export function getRegentAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "regent")
    ?? elements.find((element) => element.contactBand?.id === "regent-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_REGENT_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_REGENT_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply one complete Regent edition without changing document geometry.
 *
 * Semantic roles cover generated and previously recoloured documents. Exact
 * custom colours stay untouched, while contact and section glyphs switch to
 * real PNG assets so the editor and exported PDF use identical ink.
 */
export function applyRegentPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getRegentAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorInlineRuns(recolorMastheadTitleDescriptor(element, palette), palette);
    if (isPageBackground(next)) {
      next = { ...next, backgroundColor: palette.colors.paper };
    } else if (isFolio(next)) {
      next = { ...next, color: palette.colors.folio };
    } else if (isSectionHeading(next) || isMastheadTitle(next)) {
      next = { ...next, color: palette.colors.accent };
    } else if (isMastheadName(next)) {
      next = { ...next, color: palette.colors.ink };
    } else if (next.photoSlot !== "image") {
      for (const property of ["color", "backgroundColor", "borderColor"]) {
        const role = colorRoleByHex.get(String(next[property] || "").toUpperCase());
        if (role) next = { ...next, [property]: palette.colors[role] };
      }
    }

    if (
      next.category === "image"
      && next.photoSlot !== "image"
      && REGENT_ICON_PATH.test(String(next.src || ""))
    ) {
      next = {
        ...next,
        src: String(next.src).replace(
          REGENT_ICON_PATH,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (next.contactBand?.id === "regent-contact") {
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
  if (element.contactBandId === "regent-contact" && element.category === "text") return "contact";
  if (element.flowRole === "masthead" && element.mastheadRole === "name") return "display";
  if (element.flowRole === "masthead") return "job";
  if (element.flowRole === "section-chrome") return "heading";
  if (element.flowRole === "record-overlay") return "meta";
  if (element.flowRole === "content" && Number(element.fontSize) >= 10.5 && element.bold) return "title";
  if (element.flowRole === "content" && Number(element.fontSize) <= 8.4) return "meta";
  if (element.flowRole === "content") return "body";
  return Number(element.fontSize) <= 8.4 ? "meta" : "body";
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

/** Apply a role-aware Regent text preset from immutable authored metrics. */
export function applyRegentTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const restoreBaseline = textSizeId === DEFAULT_REGENT_TEXT_SIZE;
  const currentSettings = getRegentAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale, restoreBaseline);
    if (source.contactBand?.id === "regent-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 8.4,
      );
      const baseMetrics = source.contactBand.appearanceBaseMetrics
        ?? source.contactBand.metrics;
      const nextContactSize = restoreBaseline
        ? baseContactSize
        : round(Math.max(MIN_FONT_SIZE.contact, baseContactSize * scale.contact[0]));
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
          // Existing boxes need rendered line height, not the editor's 6 px
          // caret allowance used when a brand-new textarea is created.
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
