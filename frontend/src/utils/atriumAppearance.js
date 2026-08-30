/**
 * Premium colour and typography system for the Atrium CV template.
 *
 * Atrium keeps its authored architectural geometry in every variant. The
 * original travertine edition remains visually unchanged, while the white,
 * dark, cobalt, burgundy, and emerald editions recolour paper, editorial
 * text, hairline ornaments, folios, and real PNG glyphs as one system.
 *
 * Structural fallbacks are intentional: older saved documents do not persist
 * `appearanceColorRole`, and the original uses one sage value for both text
 * and decoration. Geometry therefore disambiguates section labels, short
 * inlay rules, and the centered masthead ornament before generic colours are
 * migrated. Unknown user colours and uploaded photo rasters are preserved.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_ATRIUM_PALETTE = "sage";
export const DEFAULT_ATRIUM_TEXT_SIZE = "M";

export const ATRIUM_PALETTES = Object.freeze([
  {
    id: "sage",
    name: "Szałwiowy Trawertyn",
    tagline: "Oryginalna · spokojny editorial",
    tone: "original",
    iconTheme: "atrium-sage",
    colors: {
      paper: "#FBFAF7", ink: "#242521", body: "#2C2C29", muted: "#78796F",
      accent: "#556158", ornament: "#556158", rule: "#E5E3DB",
      folio: "#78796F", photo: "#556158",
    },
  },
  {
    id: "carrara",
    name: "Białe Carrara",
    tagline: "Jasna · galeryjna precyzja",
    tone: "light",
    iconTheme: "atrium-carrara",
    colors: {
      paper: "#FFFFFF", ink: "#20221F", body: "#343936", muted: "#626A65",
      accent: "#765640", ornament: "#A07854", rule: "#D8D3CC",
      folio: "#765640", photo: "#765640",
    },
  },
  {
    id: "nocturne",
    name: "Nocne Atrium",
    tagline: "Ciemna · szampański detal",
    tone: "dark",
    iconTheme: "atrium-nocturne",
    colors: {
      paper: "#171B19", ink: "#F5F0E7", body: "#DCE2DD", muted: "#ACB7B0",
      accent: "#D7B66D", ornament: "#9D8350", rule: "#65716A",
      folio: "#D7B66D", photo: "#D7B66D",
    },
  },
  {
    id: "cobalt",
    name: "Kobaltowa Loggia",
    tagline: "Mocna · modernistyczny autorytet",
    tone: "strong",
    iconTheme: "atrium-cobalt",
    colors: {
      paper: "#194F7A", ink: "#FFFDFC", body: "#F2F6FA", muted: "#C9D9E6",
      accent: "#F2CB78", ornament: "#D7AE5D", rule: "#86A8C1",
      folio: "#F2CB78", photo: "#F2CB78",
    },
  },
  {
    id: "burgundy",
    name: "Bordowa Arkada",
    tagline: "Mocna · ceremonialna głębia",
    tone: "strong",
    iconTheme: "atrium-burgundy",
    colors: {
      paper: "#702A3E", ink: "#FFF9F5", body: "#F8EBEE", muted: "#E9C8D0",
      accent: "#F2C986", ornament: "#D6A95F", rule: "#C18493",
      folio: "#F2C986", photo: "#F2C986",
    },
  },
  {
    id: "emerald",
    name: "Szmaragdowy Dziedziniec",
    tagline: "Mocna · szlachetna architektura",
    tone: "strong",
    iconTheme: "atrium-emerald",
    colors: {
      paper: "#125A49", ink: "#FFF9EE", body: "#F1F5EF", muted: "#C6D9D1",
      accent: "#E4C777", ornament: "#C4A656", rule: "#7FAD9F",
      folio: "#E4C777", photo: "#E4C777",
    },
  },
]);

export const ATRIUM_TEXT_SIZES = Object.freeze([
  { id: "S", label: "S", description: "Kompaktowy" },
  { id: "M", label: "M", description: "Oryginalny" },
  { id: "L", label: "L", description: "Czytelny" },
  { id: "XL", label: "XL", description: "Wyrazisty" },
]);

// Display type changes more conservatively than long copy so Atrium retains
// its generous masthead and section rhythm even at the largest text preset.
const TEXT_SCALE = {
  S: {
    display: [0.98, 0.99], job: [0.97, 0.98], heading: [0.97, 0.98],
    title: [0.97, 0.98], body: [0.96, 0.97], meta: [0.97, 0.98],
    contact: [0.97, 0.98], folio: [0.98, 0.99],
  },
  M: {
    display: [1, 1], job: [1, 1], heading: [1, 1], title: [1, 1],
    body: [1, 1], meta: [1, 1], contact: [1, 1], folio: [1, 1],
  },
  L: {
    display: [1.02, 1.02], job: [1.04, 1.035], heading: [1.04, 1.035],
    title: [1.055, 1.05], body: [1.07, 1.06], meta: [1.06, 1.05],
    contact: [1.055, 1.045], folio: [1.03, 1.03],
  },
  XL: {
    display: [1.04, 1.035], job: [1.075, 1.06], heading: [1.075, 1.06],
    title: [1.10, 1.085], body: [1.13, 1.105], meta: [1.105, 1.08],
    contact: [1.095, 1.075], folio: [1.05, 1.04],
  },
};

const MIN_FONT_SIZE = {
  display: 26, job: 7.9, heading: 7.2, title: 8.9,
  body: 8.1, meta: 7.2, contact: 7, folio: 7.2,
};

const paletteById = new Map(ATRIUM_PALETTES.map((palette) => [palette.id, palette]));
const colorRoleByHex = new Map();
for (const palette of ATRIUM_PALETTES) {
  // Ornament and folio are resolved structurally. Excluding them prevents the
  // original shared sage/muted values from stealing the semantic text role.
  for (const role of ["paper", "ink", "body", "muted", "accent", "rule"]) {
    colorRoleByHex.set(palette.colors[role].toUpperCase(), role);
  }
}

const round = (value) => Math.round(value * 100) / 100;
const ATRIUM_ICON_PATH = /\/template-assets\/iconic\/atrium(?:-accent|-[a-z0-9]+)?\//;
const PORTRAIT_PATH = /\/template-assets\/iconic\/atrium(?:-accent|-[a-z0-9]+)?\/portrait\.png/;

function isPageBackground(element) {
  return element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 0
    && Number(element.top) === 0
    && Number(element.width) >= 590
    && Number(element.height) >= 840;
}

function isSectionHeading(element) {
  return ["text", "textarea"].includes(element.category)
    && element.flowRole === "section-chrome";
}

function isOrnamentRule(element) {
  if (element.category !== "line") return false;
  if (element.appearanceColorRole === "ornament") return true;
  if (element.flowRole === "section-chrome") return Number(element.width) <= 20;
  return element.flowRole === "masthead" && Number(element.width) <= 12;
}

function isFolio(element) {
  return ["text", "textarea"].includes(element.category)
    && element.fixedToPage
    && Number(element.top) >= 780
    && /^\d{2}$/.test(String(element.content || "").trim());
}

function isMastheadTitle(element) {
  return element.mastheadRole === "title"
    || (
      element.flowRole === "masthead"
      && ["text", "textarea"].includes(element.category)
      && element.fontFamily === "Montserrat"
      && Number(element.fontSize) >= 8.5
      && Number(element.top) < 125
      && !element.contactBandId
    );
}

function isAtriumUserPhoto(element) {
  if (!(element.photoSlot === "image" || element.id === "profile-photo")) return false;
  return Number(element.page || 1) === 1
    && Math.abs(Number(element.left) - 462) <= 2
    && Math.abs(Number(element.top) - 19) <= 2
    && Math.abs(Number(element.width) - 60) <= 2
    && Math.abs(Number(element.height) - 80) <= 2;
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
      run?.color && colorRoleByHex.has(String(run.color).toUpperCase())
        ? { ...run, color: palette.colors.accent }
        : run
    )),
  };
}

function portraitPlaceholder(palette, current = {}) {
  const src = `/template-assets/iconic/${palette.iconTheme}/portrait.png`;
  return {
    category: current.category || "image",
    src,
    left: Number.isFinite(Number(current.left)) ? current.left : 462,
    top: Number.isFinite(Number(current.top)) ? current.top : 19,
    width: Number.isFinite(Number(current.width)) ? current.width : 60,
    height: Number.isFinite(Number(current.height)) ? current.height : 80,
    page: Number(current.page) || 1,
    zIndex: Number.isFinite(Number(current.zIndex)) ? current.zIndex : 3,
    id: current.id || "atrium-photo-glyph",
    photoShape: current.photoShape || "direct",
    alignWithText: false,
  };
}

function recolorPhotoPlaceholder(element, palette) {
  if (!isAtriumUserPhoto(element) && !element.photoPlaceholder) return element;
  const current = element.photoPlaceholder || {};
  const belongsToAtrium = isAtriumUserPhoto(element)
    || PORTRAIT_PATH.test(String(current.src || ""));
  if (!belongsToAtrium) return element;
  return { ...element, photoPlaceholder: portraitPlaceholder(palette, current) };
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
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "atrium");
  if (explicit >= 0) return explicit;
  const pageBackground = elements.findIndex((element) => (
    isPageBackground(element) && Number(element.page || 1) === 1
  ));
  if (pageBackground >= 0) return pageBackground;
  return elements.findIndex((element) => element.contactBand?.id === "contact-main");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "atrium",
    appearanceSettings: nextSettings,
  } : element);
}

/** Return persisted Atrium appearance intent with safe legacy defaults. */
export function getAtriumAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "atrium")
    ?? elements.find((element) => element.contactBand?.id === "contact-main");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_ATRIUM_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_ATRIUM_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply a complete Atrium palette without changing document geometry.
 *
 * Uploaded profile images are never tinted. Their reversible placeholder is
 * updated instead, so deleting a photo after a palette change restores the
 * correct portrait glyph, including for legacy rasters without that metadata.
 */
export function applyAtriumPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getAtriumAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorPhotoPlaceholder(
      recolorInlineRuns(recolorMastheadTitleDescriptor(element, palette), palette),
      palette,
    );
    if (isPageBackground(next)) {
      next = { ...next, backgroundColor: palette.colors.paper };
    } else if (isOrnamentRule(next)) {
      next = { ...next, backgroundColor: palette.colors.ornament };
    } else if (isSectionHeading(next) || isMastheadTitle(next)) {
      next = { ...next, color: palette.colors.accent };
    } else if (isFolio(next)) {
      next = { ...next, color: palette.colors.folio };
    } else if (next.photoSlot !== "image") {
      for (const property of ["color", "backgroundColor", "borderColor"]) {
        const role = colorRoleByHex.get(String(next[property] || "").toUpperCase());
        if (role) next = { ...next, [property]: palette.colors[role] };
      }
    }

    if (
      next.category === "image"
      && next.photoSlot !== "image"
      && ATRIUM_ICON_PATH.test(String(next.src || ""))
    ) {
      next = {
        ...next,
        src: String(next.src).replace(
          ATRIUM_ICON_PATH,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (next.contactBand?.id === "contact-main") {
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
  if (element.contactBandId === "contact-main" && element.category === "text") return "contact";
  if (isFolio(element)) return "folio";
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
    && (semanticColorRole === "muted" || Number(element.lineHeight) <= 12)
  ) {
    return "meta";
  }
  if (element.flowRole === "content" || element.flowRole === "grid-member") return "body";
  return Number(element.fontSize) <= 8 ? "meta" : "body";
}

/** Apply a role-aware Atrium text preset from immutable authored metrics. */
export function applyAtriumTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const restoreBaseline = textSizeId === DEFAULT_ATRIUM_TEXT_SIZE;
  const currentSettings = getAtriumAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale, restoreBaseline);
    if (source.contactBand?.id === "contact-main") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 8.4,
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
        // Existing fields need rendered line boxes, not the editor's extra
        // caret room, before the structural packer evaluates page capacity.
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
