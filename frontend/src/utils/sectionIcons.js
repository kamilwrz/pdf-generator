/**
 * Section-heading icon catalog for icon-tagged CV templates.
 *
 * Assets live under `/template-assets/iconic/<theme>/<name>.png`. When the user
 * adds a section, the Add Section modal can offer every glyph available for the
 * active theme; the chosen name replaces (or injects) the section-chrome image
 * at the same offset used by existing headings.
 */

import API_BASE_URL from "../services/api.js";
import {
  listDocumentSections,
  sectionElementIds,
} from "./sectionStructure.js";
import { decorativeShapeElement } from "./sectionBuilder.js";

/** Shared base glyphs generated for nova. */
const BASE_ICON_NAMES = Object.freeze([
  "summary",
  "experience",
  "education",
  "skills",
  "languages",
  "interests",
  "references",
  "certifications",
  "other",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "website",
]);

/** Theme folder → icon file stems (must match `scripts/generate_iconic_icons.py`). */
export const THEME_ICON_NAMES = Object.freeze({
  nova: BASE_ICON_NAMES,
  slate: Object.freeze([
    "summary", "experience", "education", "skills", "languages",
    "interests", "references", "certifications", "other",
    "email", "phone", "linkedin", "github", "website", "location",
    "calendar", "portrait",
  ]),
});

/** Registry template id → iconic theme folder used for section headings. */
export const TEMPLATE_ICON_THEME = Object.freeze({
  nova: "nova",
  slate: "slate",
});

const ICON_LABELS_PL = Object.freeze({
  summary: "Podsumowanie",
  experience: "Doświadczenie",
  education: "Wykształcenie",
  skills: "Umiejętności",
  languages: "Języki",
  interests: "Zainteresowania",
  references: "Referencje",
  certifications: "Certyfikaty",
  other: "Inne",
  email: "E-mail",
  phone: "Telefon",
  location: "Lokalizacja",
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Strona WWW",
  calendar: "Data",
  portrait: "Zdjęcie",
});

// Matches `/template-assets/iconic/<theme>/<name>.png` with optional API host.
const ICONIC_SRC_RE = /\/template-assets\/iconic\/([^/]+)\/([^/.]+)\.(?:png|svg|webp)(?:\?.*)?$/i;

function absoluteTop(element, pageHeight = 842) {
  const page = Math.max(1, Math.trunc(Number(element?.page) || 1));
  return (page - 1) * pageHeight + (Number(element?.top) || 0);
}

/**
 * @param {string|null|undefined} src
 * @returns {{ theme: string, name: string }|null}
 */
export function parseIconicSrc(src) {
  const match = String(src || "").match(ICONIC_SRC_RE);
  if (!match) return null;
  return { theme: match[1], name: match[2] };
}

/**
 * @param {string} theme
 * @param {string} name
 * @returns {string}
 */
export function buildIconicSrc(theme, name) {
  const base = String(API_BASE_URL || "").replace(/\/$/, "");
  return `${base}/template-assets/iconic/${theme}/${name}.png`;
}

/**
 * Resolve the iconic theme for the current document / template.
 *
 * Prefer evidence from existing section-chrome icons so a restyled document
 * keeps matching assets; fall back to the template registry map.
 *
 * @param {string|null|undefined} templateId
 * @param {object[]} [elements]
 * @returns {string|null}
 */
export function resolveIconTheme(templateId, elements = []) {
  for (const element of elements || []) {
    if (element?.flowRole !== "section-chrome" || element.category !== "image") {
      continue;
    }
    const parsed = parseIconicSrc(element.src);
    if (parsed && THEME_ICON_NAMES[parsed.theme]) {
      // Slate section badges use the white `slate` theme; contact rows may use
      // `slate-accent`. Prefer a theme that has a full section glyph set.
      if (parsed.theme === "slate-accent") return "slate";
      return parsed.theme;
    }
  }
  const mapped = TEMPLATE_ICON_THEME[templateId];
  return mapped && THEME_ICON_NAMES[mapped] ? mapped : null;
}

/**
 * Geometry of an existing section-heading icon relative to its title.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ width: number, height: number, relLeft: number, relTop: number, theme: string, name: string }|null}
 */
export function findSectionIconSlot(elements, pageHeight = 842) {
  const list = elements || [];
  for (const section of listDocumentSections(list, pageHeight)) {
    const ids = sectionElementIds(list, section.headingId, pageHeight);
    const heading = list.find((element) => element.element_id === section.headingId);
    if (!heading) continue;
    const icon = list.find((element) => (
      ids.has(element.element_id)
      && element.category === "image"
      && element.flowRole === "section-chrome"
      && parseIconicSrc(element.src)
    ));
    if (!icon) continue;
    const parsed = parseIconicSrc(icon.src);
    return {
      width: Number(icon.width) || 14,
      height: Number(icon.height) || 14,
      relLeft: (Number(icon.left) || 0) - (Number(heading.left) || 0),
      relTop: absoluteTop(icon, pageHeight) - absoluteTop(heading, pageHeight),
      theme: parsed.theme,
      name: parsed.name,
      alignWithText: icon.alignWithText !== false,
    };
  }
  return null;
}

/**
 * Whether the add-section flow should show an icon gallery.
 *
 * @param {string|null|undefined} templateId
 * @param {object[]} [elements]
 * @returns {boolean}
 */
export function templateOffersSectionIcons(templateId, elements = []) {
  if (findSectionIconSlot(elements)) return true;
  return Boolean(resolveIconTheme(templateId, elements));
}

/** Themes that decorate section headings with iconic glyphs (not contact-only). */
const SECTION_HEADING_ICON_THEMES = new Set([
  "nova", "slate",
]);

/**
 * Gallery options for the active template / document.
 *
 * Shown when the document already has a section-heading icon, or when the
 * template theme is known to place icons beside headings (Nova, …).
 * Contact-only themes stay hidden unless a heading icon exists.
 *
 * @param {{ templateId?: string|null, elements?: object[] }} [args]
 * @returns {{ name: string, src: string, label: string }[]}
 */
export function listSectionIconOptions({ templateId = null, elements = [] } = {}) {
  const theme = resolveIconTheme(templateId, elements);
  if (!theme) return [];
  const hasHeadingIcon = Boolean(findSectionIconSlot(elements));
  if (!hasHeadingIcon && !SECTION_HEADING_ICON_THEMES.has(theme)) {
    return [];
  }
  const names = THEME_ICON_NAMES[theme] || [];
  // Prefer section glyphs first so the gallery reads as heading icons, then
  // contact / meta glyphs that still exist in the theme folder.
  const sectionFirst = [
    "summary", "experience", "education", "skills", "languages",
    "interests", "references", "certifications", "other",
  ];
  const ordered = [
    ...sectionFirst.filter((name) => names.includes(name)),
    ...names.filter((name) => !sectionFirst.includes(name)),
  ];
  return ordered.map((name) => ({
    name,
    src: buildIconicSrc(theme, name),
    label: ICON_LABELS_PL[name] || name,
  }));
}

/**
 * Suggest an icon from the section title (Polish / English keywords).
 *
 * @param {string} sectionName
 * @param {string[]} availableNames
 * @returns {string|null}
 */
export function suggestSectionIconName(sectionName, availableNames = []) {
  const available = new Set(availableNames);
  const text = String(sectionName || "").toLocaleLowerCase("pl-PL");
  const rules = [
    ["experience", /doświadcz|doswiadcz|praca|career|experience|employment/],
    ["education", /wykształc|wyksztalc|edukac|studia|education|school/],
    ["skills", /umiejęt|umiejet|skills|kompetenc/],
    ["languages", /język|jezyk|language/],
    ["summary", /podsumow|profil|summary|o mnie|about/],
    ["certifications", /certyfik|certificate|kurs/],
    ["interests", /zainteres|hobby|interest/],
    ["references", /referenc|recommen/],
  ];
  for (const [name, pattern] of rules) {
    if (available.has(name) && pattern.test(text)) return name;
  }
  if (available.has("other")) return "other";
  return availableNames[0] || null;
}

/**
 * Apply the chosen gallery icon onto a derived section style.
 *
 * Replaces the src of an existing iconic image marker, or injects a new image
 * marker using geometry sampled from another section heading in the document.
 *
 * @param {object} style
 * @param {object[]} elements
 * @param {number} pageHeight
 * @param {{ templateId?: string|null, iconName?: string|null }} opts
 * @returns {object}
 */
export function applySelectedSectionIcon(
  style,
  elements,
  pageHeight = 842,
  { templateId = null, iconName = null } = {},
) {
  const name = String(iconName || "").trim();
  if (!name) return style;

  const theme = resolveIconTheme(templateId, elements);
  if (!theme || !(THEME_ICON_NAMES[theme] || []).includes(name)) {
    return style;
  }

  const src = buildIconicSrc(theme, name);
  const markers = [...(style?.markers || [])];
  const imageIndex = markers.findIndex((marker) => (
    marker.category === "image"
    && (parseIconicSrc(marker.src) || /template-assets\/iconic\//.test(String(marker.src || "")))
  ));

  if (imageIndex >= 0) {
    const previous = markers[imageIndex];
    markers[imageIndex] = {
      ...previous,
      src,
      alignWithText: previous.alignWithText !== false,
    };
    return { ...style, markers };
  }

  const slot = findSectionIconSlot(elements, pageHeight);
  if (!slot) return style;

  markers.push({
    category: "image",
    width: slot.width,
    height: slot.height,
    relLeft: slot.relLeft,
    relTop: slot.relTop,
    backgroundColor: "transparent",
    src,
    alignWithText: slot.alignWithText !== false,
  });
  return { ...style, markers };
}

/**
 * Rebuild a transferred section's icon-chrome cluster (tile / outline / dot /
 * icon glyph) for its destination lane, with the icon glyph re-picked from
 * the moved section's own title.
 *
 * `transferSectionLane.js` / `collapseMainIntoSidebar.js` restyle a section
 * for its destination column but drop every source decorative shape (main
 * and sidebar icon clusters differ in shape count/size — compare `_gen_slate`
 * `section()` with `sidebar_heading()` — so the source cluster can never be
 * reused verbatim). `style.markers` (from `deriveSectionStyle`) already
 * samples a sibling heading's cluster in the DESTINATION lane; this only
 * swaps that sample's icon glyph for the one matching the moved section's own
 * title and re-anchors the whole cluster under the moved heading. Templates
 * with no icon chrome (Sterling) sample zero markers and this returns `[]`.
 *
 * @param {object} args
 * @param {object} args.style - destination-lane style from `deriveSectionStyle`
 * @param {object[]} args.elements - full document, used to detect the active icon theme
 * @param {{ content: string, left: number, top: number }} args.heading - the already-restyled heading element
 * @param {"section-chrome"|"sidebar-chrome"} [args.flowRole]
 * @param {"sidebar"|null} [args.flowLane]
 * @param {() => string} args.idFactory
 * @param {number} [args.pageHeight=842]
 * @returns {object[]} new marker elements, or `[]` when the template has no icon chrome
 */
export function buildSectionIconChromeMarkers({
  style, elements, heading, flowRole = "section-chrome", flowLane = null, idFactory, pageHeight = 842,
}) {
  if (!heading || !Array.isArray(style?.markers) || style.markers.length === 0) return [];
  const theme = resolveIconTheme(null, elements);
  if (!theme) return [];
  const iconName = suggestSectionIconName(heading.content, THEME_ICON_NAMES[theme] || []);
  if (!iconName) return [];
  const iconStyle = applySelectedSectionIcon(style, elements, pageHeight, { iconName });
  return (iconStyle.markers || []).map((shape) => decorativeShapeElement({
    elementId: idFactory(),
    shape,
    left: heading.left,
    topOffset: heading.top,
    flowRole,
    flowLane,
  }));
}
