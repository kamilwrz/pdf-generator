/**
 * Curated colour and typography system for the Linden CV template.
 *
 * Linden needs a template-specific contract because the same authored ink is
 * used in both the main column and the sidebar. The contextual role resolver
 * below keeps those lanes independent, which allows premium dark-side variants
 * without sacrificing readable main-column text or overwriting custom colours.
 */

import { measureTextareaHeight } from "./textareaHeight.js";

export const DEFAULT_LINDEN_PALETTE = "botanical";
export const DEFAULT_LINDEN_TEXT_SIZE = "M";

export const LINDEN_PALETTES = Object.freeze([
  {
    id: "gallery",
    name: "Galeria i Turkus",
    tagline: "Biel, grafit i chłodny akcent",
    iconTheme: "linden-gallery",
    colors: {
      paper: "#FFFFFF", sidebar: "#FFFFFF", ink: "#242628", sidebarInk: "#303336",
      accent: "#0E6870", accentDeep: "#3A3D40", sidebarHeading: "#3A3D40",
      muted: "#686D70", sidebarMuted: "#686D70", rule: "#D4D7D9",
      jobBand: "#51575B", jobText: "#FFFFFF", photo: "#F3F4F4",
    },
  },
  {
    id: "carmine",
    name: "Karminowy Gabinet",
    tagline: "Szlachetny i zdecydowany",
    iconTheme: "linden-carmine",
    colors: {
      paper: "#FFFCFA", sidebar: "#F3E3E2", ink: "#2C2425", sidebarInk: "#39292B",
      accent: "#A2444E", accentDeep: "#67323A", sidebarHeading: "#6F3039",
      muted: "#786668", sidebarMuted: "#725E61", rule: "#D7BFC0",
      jobBand: "#8A3540", jobText: "#FFF8F6", photo: "#F8ECEB",
    },
  },
  {
    id: "botanical",
    name: "Botaniczny Papier",
    tagline: "Naturalny i redakcyjny",
    iconTheme: "linden",
    colors: {
      paper: "#FBFAF6", sidebar: "#F2EFE6", ink: "#252823", sidebarInk: "#252823",
      accent: "#285548", accentDeep: "#1E4037", sidebarHeading: "#1E4037",
      muted: "#666C65", sidebarMuted: "#666C65", rule: "#D3CCBC",
      jobBand: "#1E4037", jobText: "#FBFAF6", photo: "#F8F5ED",
    },
  },
  {
    id: "midnight",
    name: "Nocny Atrament",
    tagline: "Granat, mosiądz i kość słoniowa",
    iconTheme: "linden-midnight",
    colors: {
      paper: "#F8FAF9", sidebar: "#18323B", ink: "#202D31", sidebarInk: "#F4F0E8",
      accent: "#C19752", accentDeep: "#244A57", sidebarHeading: "#E6C987",
      muted: "#627276", sidebarMuted: "#C2CED0", rule: "#BFCBCD",
      jobBand: "#0E2730", jobText: "#F8F3E9", photo: "#E6ECEC",
    },
  },
  {
    id: "cobalt",
    name: "Kobaltowa Porcelana",
    tagline: "Precyzyjny z koralowym detalem",
    iconTheme: "linden-cobalt",
    colors: {
      paper: "#FFFEFB", sidebar: "#E7EEF6", ink: "#232A32", sidebarInk: "#263746",
      accent: "#B44F38", accentDeep: "#2D527A", sidebarHeading: "#294E75",
      muted: "#67727D", sidebarMuted: "#586979", rule: "#C5D1DE",
      jobBand: "#274A71", jobText: "#FFFFFF", photo: "#F1F5F8",
    },
  },
  {
    id: "plum",
    name: "Śliwkowy Wieczór",
    tagline: "Nastrojowy i wyrafinowany",
    iconTheme: "linden-plum",
    colors: {
      paper: "#FBF7F8", sidebar: "#382D3C", ink: "#2C252C", sidebarInk: "#FBF2F5",
      accent: "#B07B68", accentDeep: "#63394F", sidebarHeading: "#E6BACE",
      muted: "#766970", sidebarMuted: "#D3C0C9", rule: "#D7C8CF",
      jobBand: "#241A26", jobText: "#F9EEF3", photo: "#EEE3E8",
    },
  },
]);

export const LINDEN_TEXT_SIZES = Object.freeze([
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
  display: 22, job: 8.5, heading: 8.8, title: 8.3,
  body: 8.2, meta: 7.5, contact: 7.5,
};

const LEGACY_COLORS = {
  paper: ["#FBFAF6"], sidebar: ["#F2EFE6"], ink: ["#252823"],
  accent: ["#285548"], accentDeep: ["#1E4037"], muted: ["#70766F"],
  rule: ["#D3CCBC"], jobBand: ["#E5DDCB"], jobText: ["#1E4037"],
  photo: ["#F8F5ED"], sidebarInk: ["#252823"],
  sidebarHeading: ["#1E4037"], sidebarMuted: ["#70766F"],
};

const paletteById = new Map(LINDEN_PALETTES.map((palette) => [palette.id, palette]));
const roleColors = new Map();
for (const [role, values] of Object.entries(LEGACY_COLORS)) {
  roleColors.set(role, new Set(values.map((value) => value.toUpperCase())));
}
for (const palette of LINDEN_PALETTES) {
  for (const [role, value] of Object.entries(palette.colors)) {
    if (!roleColors.has(role)) roleColors.set(role, new Set());
    roleColors.get(role).add(value.toUpperCase());
  }
}

const round = (value) => Math.round(value * 100) / 100;
// Linden's Cormorant display line intentionally uses compact 1.086 leading.
// Other roles retain the safer 1.12 floor used by editable body copy.
const lineHeightFloor = (fontSize, role) => fontSize * (role === "display" ? 1.05 : 1.12);
const matchesRole = (value, role) => roleColors.get(role)?.has(String(value || "").toUpperCase());
const matchesAnyRole = (value, roles) => roles.some((role) => matchesRole(value, role));

function isIdentityBand(element) {
  return element.titleDecoration === "identity-band"
    || (element.mastheadBandId === "linden-masthead" && element.category === "rectangle");
}

function isJobTitle(element) {
  return element.mastheadBandId === "linden-masthead"
    && element.category === "textarea"
    && (element.italic || element.fontFamily !== "CormorantGaramond");
}

function isSidebarElement(element) {
  return element.flowLane === "sidebar"
    || element.flowRole === "sidebar-chrome"
    || element.contactBandId === "linden-contact"
    || element.contactBand?.id === "linden-contact"
    || (element.flowRole === "masthead" && Number(element.left) < 210);
}

function semanticRole(element, property, value) {
  if (!value) return null;
  if (isIdentityBand(element)) return "jobBand";
  if (property === "color" && isJobTitle(element)) return "jobText";
  if (element.id === "linden-photo-well") return "photo";
  if (element.id === "linden-photo-frame") return "accent";

  if (property === "backgroundColor") {
    const isPage = element.fixedToPage
      && Number(element.left) === 0
      && Number(element.top) === 0
      && Number(element.width) >= 590
      && Number(element.height) >= 840;
    const isSidebar = element.fixedToPage
      && Number(element.left) === 0
      && Number(element.top) === 0
      && Number(element.width) > 180
      && Number(element.width) < 230
      && Number(element.height) >= 840;
    if (isPage) return "paper";
    if (isSidebar) return "sidebar";
    for (const role of ["rule", "accent", "photo", "sidebar", "paper", "jobBand"]) {
      if (matchesRole(value, role)) return role;
    }
    return null;
  }

  if (property !== "color") return null;
  if (isSidebarElement(element)) {
    if (matchesAnyRole(value, ["muted", "sidebarMuted"])) return "sidebarMuted";
    if (matchesAnyRole(value, ["accentDeep", "sidebarHeading"])) return "sidebarHeading";
    if (matchesAnyRole(value, ["ink", "sidebarInk"])) return "sidebarInk";
  } else {
    if (matchesAnyRole(value, ["muted", "sidebarMuted"])) return "muted";
    if (matchesAnyRole(value, ["accentDeep", "sidebarHeading"])) return "accentDeep";
    if (matchesAnyRole(value, ["ink", "sidebarInk"])) return "ink";
  }
  return null;
}

function recolorMastheadTitleDescriptor(element, palette) {
  const title = element.mastheadIdentity?.title;
  if (!title?.spec || element.mastheadIdentity?.id !== "linden-masthead") return element;
  const spec = { ...title.spec, colorHex: palette.colors.jobText };
  const decorations = (title.decorations || []).map((decoration) => (
    isIdentityBand(decoration)
      ? { ...decoration, backgroundColor: palette.colors.jobBand }
      : decoration
  ));
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
  if (!spec || element.mastheadIdentity?.id !== "linden-masthead") return element;
  if (!Number.isFinite(Number(spec.fontSizePt))) return element;
  const role = spec.appearanceTypographyRole || "job";
  const [fontFactor, lineFactor] = scale[role] || scale.job;
  const baseFontSize = Number(spec.appearanceBaseFontSize ?? spec.fontSizePt);
  const nextSpec = {
    ...spec,
    appearanceTypographyRole: role,
    appearanceBaseFontSize: baseFontSize,
    fontSizePt: round(Math.max(MIN_FONT_SIZE[role] || MIN_FONT_SIZE.job, baseFontSize * fontFactor)),
  };
  if (Number.isFinite(Number(spec.lineHeight))) {
    const baseLineHeight = Number(spec.appearanceBaseLineHeight ?? spec.lineHeight);
    nextSpec.appearanceBaseLineHeight = baseLineHeight;
    nextSpec.lineHeight = round(Math.max(
      lineHeightFloor(nextSpec.fontSizePt, role),
      baseLineHeight * lineFactor,
    ));
  }
  if (Number.isFinite(Number(spec.height))) {
    const baseHeight = Number(spec.appearanceBaseHeight ?? spec.height);
    nextSpec.appearanceBaseHeight = baseHeight;
    nextSpec.height = round(Math.max(Number(nextSpec.lineHeight) || 0, baseHeight * lineFactor));
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
  const explicit = elements.findIndex((element) => element.appearanceTemplateId === "linden");
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
  return elements.findIndex((element) => element.contactBand?.id === "linden-contact");
}

function stampSettings(elements, nextSettings) {
  const anchorIndex = settingsAnchorIndex(elements);
  if (anchorIndex < 0) return elements;
  return elements.map((element, index) => index === anchorIndex ? {
    ...element,
    appearanceTemplateId: "linden",
    appearanceSettings: nextSettings,
  } : element);
}

/**
 * Return persisted Linden appearance intent, using the botanical authored
 * defaults for documents created before the Appearance controls existed.
 *
 * @param {object[]} elements - Current Linden canvas elements.
 * @returns {{palette: string, textSize: string}} Selected preset identifiers.
 */
export function getLindenAppearance(elements = []) {
  const anchor = elements.find((element) => element.appearanceTemplateId === "linden")
    ?? elements.find((element) => element.contactBand?.id === "linden-contact");
  const palette = paletteById.has(anchor?.appearanceSettings?.palette)
    ? anchor.appearanceSettings.palette
    : DEFAULT_LINDEN_PALETTE;
  const textSize = TEXT_SCALE[anchor?.appearanceSettings?.textSize]
    ? anchor.appearanceSettings.textSize
    : DEFAULT_LINDEN_TEXT_SIZE;
  return { palette, textSize };
}

/**
 * Apply a semantic Linden palette without changing geometry or user-assigned
 * colours. Contact and portrait paths switch to real palette-specific PNGs so
 * the live canvas and ReportLab export retain identical ink.
 *
 * @param {object[]} elements - Current Linden canvas elements.
 * @param {string} paletteId - Identifier from `LINDEN_PALETTES`.
 * @returns {object[]} Recoloured elements with persisted appearance intent.
 */
export function applyLindenPalette(elements = [], paletteId) {
  const palette = paletteById.get(paletteId);
  if (!palette) return elements;
  const currentSettings = getLindenAppearance(elements);
  const recolored = elements.map((element) => {
    let next = recolorMastheadTitleDescriptor(element, palette);
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      const role = semanticRole(next, property, next[property]);
      if (role) next = { ...next, [property]: palette.colors[role] };
    }
    if (/\/template-assets\/iconic\/linden(?:-[^/]+)?\//.test(String(next.src || ""))) {
      next = {
        ...next,
        src: String(next.src).replace(
          /\/template-assets\/iconic\/linden(?:-[^/]+)?\//,
          `/template-assets/iconic/${palette.iconTheme}/`,
        ),
      };
    }
    if (next.contactBand?.id === "linden-contact") {
      next = {
        ...next,
        contactBand: {
          ...next.contactBand,
          text: { ...next.contactBand.text, colorHex: palette.colors.sidebarMuted },
          icon: { ...next.contactBand.icon, theme: palette.iconTheme },
        },
      };
    }
    return next;
  });
  return stampSettings(recolored, { ...currentSettings, palette: palette.id });
}

function typographyRole(element) {
  if (element.contactBandId === "linden-contact" && element.category === "text") return "contact";
  if (element.mastheadBandId === "linden-masthead" && element.fontFamily === "CormorantGaramond") return "display";
  if (element.mastheadBandId === "linden-masthead") return "job";
  if (element.flowRole === "section-chrome" || element.flowRole === "sidebar-chrome") return "heading";
  if (element.flowRole === "masthead" && Number(element.left) < 210) return "heading";
  if (element.flowRole === "content" && Number(element.fontSize) >= 10.5 && element.bold) return "title";
  if (element.flowRole === "content" && Number(element.fontSize) <= 8.4) return "body";
  if (element.flowRole === "content" && Number(element.fontSize) <= 8.8) return "meta";
  if (element.flowRole === "content") return "body";
  return Number(element.fontSize) <= 9 ? "meta" : "body";
}

/**
 * Apply a reversible, role-aware Linden type preset and seed fresh textarea
 * heights for the document packer. Immutable authored metrics prevent scaling
 * drift when a user moves repeatedly between S, M, L, and XL.
 *
 * @param {object[]} elements - Current Linden canvas elements.
 * @param {string} textSizeId - Linden S, M, L, or XL preset identifier.
 * @param {object} options - Optional browser glyph-width integration.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Resized elements with persisted appearance intent.
 */
export function applyLindenTextSize(
  elements = [],
  textSizeId,
  { measureTextWidth = null } = {},
) {
  const scale = TEXT_SCALE[textSizeId];
  if (!scale) return elements;
  const currentSettings = getLindenAppearance(elements);
  const resized = elements.map((element) => {
    const source = resizeMastheadTitleDescriptor(element, scale);
    if (source.contactBand?.id === "linden-contact") {
      const baseContactSize = Number(
        source.contactBand.appearanceBaseFontSize
        ?? source.contactBand.text?.fontSizePt
        ?? 7.5,
      );
      const nextContactSize = round(Math.max(MIN_FONT_SIZE.contact, baseContactSize * scale.contact[0]));
      const baseMetrics = source.contactBand.appearanceBaseMetrics ?? source.contactBand.metrics;
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
      next.lineHeight = round(Math.max(
        lineHeightFloor(next.fontSize, role),
        baseLineHeight * lineFactor,
      ));
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
        // Existing flow fields need rendered line boxes, not the estimator's
        // six-pixel caret allowance for a newly created editor field.
        if (Number.isFinite(estimatedHeight)) {
          next.height = round(Math.max(next.lineHeight, estimatedHeight - 6));
        }
      }
    }
    return next;
  });
  return stampSettings(resized, { ...currentSettings, textSize: textSizeId });
}
