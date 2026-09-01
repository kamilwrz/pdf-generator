/**
 * Template-mode customization panel ("Dostosuj CV"): document status, section
 * structure, density presets, precise spacing, and template-scoped appearance
 * tools for Atrium, Regent, Sterling, Linden, Monument, Slate, Meridian,
 * Cadenza, and Vellum. A
 * main-column Skills section's list row also gets a layout icon opening
 * `SkillsLayoutModal` (same modal the canvas heading hover control opens —
 * see `SectionRecordAdd`), so the mode picker is reachable without hunting
 * for the heading on the page.
 *
 * Renders as a docked flyout to the right of the 72px sidebar rail.
 * Does not own pagination / orphan keep-together / LongCv 3+ page correction.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { FiCheck, FiChevronDown, FiChevronUp, FiMinus, FiPlus, FiX } from "react-icons/fi";
import { LuGripVertical, LuLayoutGrid } from "react-icons/lu";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import {
  applyFlowSpacing,
  listDocumentSections,
  listSidebarSections,
  reorderSection,
} from "../../../utils/sectionStructure";
import { isSkillsSectionTitle } from "../../../utils/skillsLayout";
import {
  DEFAULT_FLOW_SPACING,
  densityPresetsFromBaseline,
  flowSpacingEquals,
  matchDensityPreset,
  normalizeFlowSpacing,
} from "../../../utils/flowSpacing";
import {
  formatPageCountLabel,
  proposeAutoFitSpacing,
} from "../../../utils/layoutDensity";
import { reconcileDocumentPages } from "../../../utils/structureOperation";
import { collapseSpilledMainIntoSidebar } from "../../../utils/collapseMainIntoSidebar";
import {
  applySterlingPalette,
  getSterlingAppearance,
  STERLING_PALETTES,
  STERLING_TEXT_SIZES,
} from "../../../utils/sterlingAppearance";
import {
  applySterlingRenderedHeightsLayout,
  applySterlingTextSizeLayout,
} from "../../../utils/sterlingTypographyLayout";
import {
  applyLindenPalette,
  getLindenAppearance,
  LINDEN_PALETTES,
  LINDEN_TEXT_SIZES,
} from "../../../utils/lindenAppearance";
import {
  applyLindenRenderedHeightsLayout,
  applyLindenTextSizeLayout,
} from "../../../utils/lindenTypographyLayout";
import {
  applyMonumentPalette,
  getMonumentAppearance,
  MONUMENT_PALETTES,
  MONUMENT_TEXT_SIZES,
} from "../../../utils/monumentAppearance";
import {
  applyMonumentRenderedHeightsLayout,
  applyMonumentTextSizeLayout,
} from "../../../utils/monumentTypographyLayout";
import {
  applySlatePalette,
  getSlateAppearance,
  SLATE_PALETTES,
  SLATE_TEXT_SIZES,
} from "../../../utils/slateAppearance";
import {
  applySlateRenderedHeightsLayout,
  applySlateTextSizeLayout,
} from "../../../utils/slateTypographyLayout";
import {
  applyMeridianPalette,
  getMeridianAppearance,
  MERIDIAN_PALETTES,
  MERIDIAN_TEXT_SIZES,
} from "../../../utils/meridianAppearance";
import {
  applyMeridianRenderedHeightsLayout,
  applyMeridianTextSizeLayout,
} from "../../../utils/meridianTypographyLayout";
import {
  applyCadenzaPalette,
  CADENZA_PALETTES,
  CADENZA_TEXT_SIZES,
  getCadenzaAppearance,
} from "../../../utils/cadenzaAppearance";
import {
  applyCadenzaRenderedHeightsLayout,
  applyCadenzaTextSizeLayout,
} from "../../../utils/cadenzaTypographyLayout";
import {
  applyVellumPalette,
  getVellumAppearance,
  VELLUM_PALETTES,
  VELLUM_TEXT_SIZES,
} from "../../../utils/vellumAppearance";
import {
  applyVellumRenderedHeightsLayout,
  applyVellumTextSizeLayout,
} from "../../../utils/vellumTypographyLayout";
import {
  applyAtriumPalette,
  ATRIUM_PALETTES,
  ATRIUM_TEXT_SIZES,
  getAtriumAppearance,
} from "../../../utils/atriumAppearance";
import {
  applyAtriumRenderedHeightsLayout,
  applyAtriumTextSizeLayout,
} from "../../../utils/atriumTypographyLayout";
import {
  applyRegentPalette,
  getRegentAppearance,
  REGENT_PALETTES,
  REGENT_TEXT_SIZES,
} from "../../../utils/regentAppearance";
import {
  applyRegentRenderedHeightsLayout,
  applyRegentTextSizeLayout,
} from "../../../utils/regentTypographyLayout";
import {
  createCanvasTextWidthMeasurer,
  measureNaturalScrollHeight,
} from "../../../utils/textareaHeight";
import classes from "./SectionsPanel.module.css";

/** User-facing spacing knobs — keys stay aligned with SPACE_* in the generator. */
const SPACING_FIELDS = [
  { key: "stack", label: "Wewnątrz wpisu" },
  { key: "record", label: "Między wpisami" },
  { key: "section", label: "Między sekcjami" },
  { key: "after_rule", label: "Pod nagłówkiem" },
];

const DENSITY_OPTIONS = [
  { id: "compact", label: "Kompaktowa" },
  { id: "standard", label: "Standardowa" },
  { id: "spacious", label: "Przestronna" },
];

/**
 * Soften ALL-CAPS CV headings for the panel list without changing the canvas.
 * @param {string} title
 * @returns {string}
 */
function displaySectionTitle(title) {
  const raw = String(title || "").trim();
  if (!raw) return "Bez nazwy";
  const lower = raw.toLocaleLowerCase("pl-PL");
  // Title-case words so "DOŚWIADCZENIE ZAWODOWE" reads as a normal label.
  return lower.replace(/(^|[\s/·\-–—])(\p{L})/gu, (_, sep, ch) => (
    sep + ch.toLocaleUpperCase("pl-PL")
  ));
}

/**
 * Tier-honest status line for the page-fit hint. The CTA label stays constant
 * ("Zmieść na …"); only this sentence changes so `clean` never reads like
 * `impossible`.
 * @param {"clean"|"tight"|"emergency"|"impossible"} tier
 * @param {string} targetLabel  e.g. "1 stronie"
 * @returns {string}
 */
function fitHintText(tier, targetLabel) {
  if (tier === "emergency") return `zmieścisz na ${targetLabel} po skróceniu treści`;
  if (tier === "impossible") return `aby zmieścić na ${targetLabel}, skróć treść`;
  return `można zmieścić na ${targetLabel}`;
}

export default function SectionsPanel({ onClose }) {
  const {
    A4_Elements,
    setA4_Elements,
    activeTemplateId,
    pageSize,
    pageCount,
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    openAddSectionModal,
    openSkillsLayoutModal,
    fitStatus,
    onFitToPages,
  } = useCanvasContext();
  const { pushToast } = useSession();
  const pageHeight = pageSize?.height ?? 842;
  const densityGroupId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("layout");
  const appearanceTypographyRequestRef = useRef(0);

  const spacing = useMemo(
    () => normalizeFlowSpacing(flowSpacing),
    [flowSpacing],
  );
  const baselineSpacing = useMemo(
    () => normalizeFlowSpacing(baselineFlowSpacing ?? DEFAULT_FLOW_SPACING),
    [baselineFlowSpacing],
  );
  const densityPresets = useMemo(
    () => densityPresetsFromBaseline(baselineSpacing),
    [baselineSpacing],
  );
  const activeDensity = useMemo(
    () => matchDensityPreset(spacing, baselineSpacing),
    [spacing, baselineSpacing],
  );
  const sections = useMemo(
    () => listDocumentSections(A4_Elements, pageHeight),
    [A4_Elements, pageHeight],
  );
  const sidebarSections = useMemo(
    () => listSidebarSections(A4_Elements, pageHeight),
    [A4_Elements, pageHeight],
  );
  const pageStatus = formatPageCountLabel(pageCount ?? 1);
  const atBaseline = flowSpacingEquals(spacing, baselineSpacing);
  const hasAnySections = sections.length > 0 || sidebarSections.length > 0;
  // Appearance is intentionally released template by template. The tab is
  // gated by the selected template ID so a visually similar document never
  // receives another template's semantic colour or typography contract.
  const isSterlingAppearance = activeTemplateId === "sterling";
  const isLindenAppearance = activeTemplateId === "linden";
  const isMonumentAppearance = activeTemplateId === "monument";
  const isSlateAppearance = activeTemplateId === "slate";
  const isMeridianAppearance = activeTemplateId === "meridian";
  const isCadenzaAppearance = activeTemplateId === "cadenza";
  const isVellumAppearance = activeTemplateId === "vellum";
  const isAtriumAppearance = activeTemplateId === "atrium";
  const isRegentAppearance = activeTemplateId === "regent";
  const appearanceEnabled = isAtriumAppearance
    || isRegentAppearance
    || isSterlingAppearance
    || isLindenAppearance
    || isMonumentAppearance
    || isSlateAppearance
    || isMeridianAppearance
    || isCadenzaAppearance
    || isVellumAppearance;
  const renderedTab = appearanceEnabled ? activeTab : "layout";
  const appearanceDefinition = useMemo(() => {
    if (isRegentAppearance) return {
      templateName: "Regent",
      palettes: REGENT_PALETTES,
      textSizes: REGENT_TEXT_SIZES,
      value: getRegentAppearance(A4_Elements),
      applyPalette: applyRegentPalette,
      applyTextSizeLayout: applyRegentTextSizeLayout,
      applyRenderedHeightsLayout: applyRegentRenderedHeightsLayout,
      paletteDescription: "Cztery klasyczne edycje korzystają z jasnych papierów. Dwie kreatywne łączą głęboki kolor tła, jasną typografię i szlachetny złoty akcent.",
    };
    if (isAtriumAppearance) return {
      templateName: "Atrium",
      palettes: ATRIUM_PALETTES,
      textSizes: ATRIUM_TEXT_SIZES,
      value: getAtriumAppearance(A4_Elements),
      applyPalette: applyAtriumPalette,
      applyTextSizeLayout: applyAtriumTextSizeLayout,
      applyRenderedHeightsLayout: applyAtriumRenderedHeightsLayout,
      paletteDescription: "Oryginał pozostaje bez zmian. Białe Carrara, dark mode i trzy mocne edycje zmieniają papier, stanowisko, nagłówki, intarsje, folio i prawdziwe ikony.",
    };
    if (isLindenAppearance) return {
      templateName: "Linden",
      palettes: LINDEN_PALETTES,
      textSizes: LINDEN_TEXT_SIZES,
      value: getLindenAppearance(A4_Elements),
      applyPalette: applyLindenPalette,
      applyTextSizeLayout: applyLindenTextSizeLayout,
      applyRenderedHeightsLayout: applyLindenRenderedHeightsLayout,
      paletteDescription: "Paleta zmienia obie kolumny, dekoracje i ikony; pasek stanowiska pozostaje jej najciemniejszym akcentem.",
    };
    if (isMonumentAppearance) return {
      templateName: "Monument",
      palettes: MONUMENT_PALETTES,
      textSizes: MONUMENT_TEXT_SIZES,
      value: getMonumentAppearance(A4_Elements),
      applyPalette: applyMonumentPalette,
      applyTextSizeLayout: applyMonumentTextSizeLayout,
      applyRenderedHeightsLayout: applyMonumentRenderedHeightsLayout,
    };
    if (isSlateAppearance) return {
      templateName: "Slate",
      palettes: SLATE_PALETTES,
      textSizes: SLATE_TEXT_SIZES,
      value: getSlateAppearance(A4_Elements),
      applyPalette: applySlatePalette,
      applyTextSizeLayout: applySlateTextSizeLayout,
      applyRenderedHeightsLayout: applySlateRenderedHeightsLayout,
    };
    if (isMeridianAppearance) return {
      templateName: "Meridian",
      palettes: MERIDIAN_PALETTES,
      textSizes: MERIDIAN_TEXT_SIZES,
      value: getMeridianAppearance(A4_Elements),
      applyPalette: applyMeridianPalette,
      applyTextSizeLayout: applyMeridianTextSizeLayout,
      applyRenderedHeightsLayout: applyMeridianRenderedHeightsLayout,
      paletteDescription: "Białe tło pozostaje bez zmian; paleta zmienia tekst, dekoracje i dopasowany zestaw ikon.",
    };
    if (isCadenzaAppearance) return {
      templateName: "Cadenza",
      palettes: CADENZA_PALETTES,
      textSizes: CADENZA_TEXT_SIZES,
      value: getCadenzaAppearance(A4_Elements),
      applyPalette: applyCadenzaPalette,
      applyTextSizeLayout: applyCadenzaTextSizeLayout,
      applyRenderedHeightsLayout: applyCadenzaRenderedHeightsLayout,
      paletteDescription: "Białe tło pozostaje stałe. Trzy lekkie i trzy mocne palety zmieniają pasy, kontrast nagłówków, stanowisko, znaczniki oraz ikony.",
    };
    if (isVellumAppearance) return {
      templateName: "Vellum",
      palettes: VELLUM_PALETTES,
      textSizes: VELLUM_TEXT_SIZES,
      value: getVellumAppearance(A4_Elements),
      applyPalette: applyVellumPalette,
      applyTextSizeLayout: applyVellumTextSizeLayout,
      applyRenderedHeightsLayout: applyVellumRenderedHeightsLayout,
      paletteDescription: "Białe tło pozostaje stałe. Trzy lekkie i trzy mocne palety zmieniają pole résumé, jego kontrast, portret, stanowisko, reguły oraz prawdziwe ikony.",
    };
    return {
      templateName: "Sterling",
      palettes: STERLING_PALETTES,
      textSizes: STERLING_TEXT_SIZES,
      value: getSterlingAppearance(A4_Elements),
      applyPalette: applySterlingPalette,
      applyTextSizeLayout: applySterlingTextSizeLayout,
      applyRenderedHeightsLayout: applySterlingRenderedHeightsLayout,
    };
  }, [A4_Elements, isAtriumAppearance, isCadenzaAppearance, isLindenAppearance, isMeridianAppearance, isMonumentAppearance, isRegentAppearance, isSlateAppearance, isVellumAppearance]);

  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => {
    // Cancel a pending post-paint typography settle when the panel unmounts.
    appearanceTypographyRequestRef.current += 1;
  }, []);

  function move(headingId, direction) {
    setA4_Elements((prev) => {
      const next = reorderSection(prev, headingId, direction, pageHeight, {
        spacing,
      });
      if (!next) return prev;
      // Chrome sync only — packed content tops must stay as reorder left them.
      const reconciled = reconcileDocumentPages(next, nanoid, {
        collapseEmpty: true,
      });
      return reconciled.elements;
    });
  }

  function applySpacing(nextSpacing) {
    const normalized = normalizeFlowSpacing(nextSpacing);
    // Same knobs → do not force-pack. Generator geometry is not byte-identical
    // to a forceTargets pack; re-packing on a no-op Reset can pull later
    // sections onto page 1.
    if (flowSpacingEquals(spacing, normalized)) return;
    setFlowSpacing(normalized);
    setA4_Elements((prev) => {
      const packed = applyFlowSpacing(prev, normalized, pageHeight);
      const collapsed = collapseSpilledMainIntoSidebar(packed, {
        spacing: normalized,
        pageHeight,
      });
      // Do not re-pack after this — only add/drop fixed continuation chrome.
      const reconciled = reconcileDocumentPages(collapsed, nanoid, {
        collapseEmpty: true,
      });
      return reconciled.elements;
    });
  }

  function handleSpacingChange(key, rawValue) {
    const parsed = Number(rawValue);
    applySpacing({
      ...spacing,
      [key]: Number.isFinite(parsed) ? parsed : spacing[key],
    });
  }

  function nudgeSpacing(key, delta) {
    handleSpacingChange(key, spacing[key] + delta);
  }

  function handleResetSpacing() {
    // Restore spacing from when this CV was opened / last filled — not a
    // hardcoded default when the document already sits on those values.
    applySpacing(baselineSpacing);
  }

  function handleDensitySelect(densityId) {
    const next = densityPresets[densityId];
    if (!next) return;
    applySpacing(next);
  }

  function handleAppearancePalette(paletteId) {
    if (!appearanceEnabled) return;
    if (paletteId === appearanceDefinition.value.palette) return;
    setA4_Elements((prev) => appearanceDefinition.applyPalette(prev, paletteId));
  }

  function handleAppearanceTextSize(textSizeId) {
    if (!appearanceEnabled) return;
    if (textSizeId === appearanceDefinition.value.textSize) return;
    // Apply typography, the template's flow lanes, and contacts atomically.
    // Independent DOM measurements still verify the result afterwards, but the transaction
    // already uses the browser's active font metrics and word wrapping. This
    // prevents a long final record from growing underneath the next heading.
    const measureTextWidth = createCanvasTextWidthMeasurer();
    setA4_Elements((prev) => appearanceDefinition.applyTextSizeLayout(prev, textSizeId, {
      spacing,
      pageHeight,
      createId: () => nanoid(),
      measureTextWidth,
    }));

    // Chromium is the final wrap authority. Wait until the new type has
    // painted, collect every mounted textarea height, and pack once from that
    // complete snapshot. This avoids the race where independent component
    // effects settle in a different order and leave Education on top of the
    // final Experience record. A newer click cancels this pending settle.
    const requestId = appearanceTypographyRequestRef.current + 1;
    appearanceTypographyRequestRef.current = requestId;
    const settleRenderedTypography = async () => {
      if (typeof document === "undefined" || typeof window === "undefined") return;
      try {
        await (document.fonts?.ready ?? Promise.resolve());
      } catch {
        // A failed optional webfont must not block layout; the rendered fallback
        // face below is still measurable and preferable to stale box heights.
      }
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (appearanceTypographyRequestRef.current !== requestId) return;

      const measuredHeights = new Map();
      for (const element of A4_Elements) {
        if (
          element.category !== "textarea"
          || element.fixedToPage
          || element.flowRole === "masthead"
        ) {
          continue;
        }
        const node = document.getElementById(element.element_id);
        const measuredHeight = measureNaturalScrollHeight(node);
        if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
          measuredHeights.set(element.element_id, measuredHeight);
        }
      }
      if (measuredHeights.size === 0) return;

      setA4_Elements((prev) => appearanceDefinition.applyRenderedHeightsLayout(
        prev,
        measuredHeights,
        {
          spacing,
          pageHeight,
          createId: () => nanoid(),
        },
      ));
    };
    void settleRenderedTypography();
  }

  function handleAutoFit() {
    // Offline trials — only the winner hits setState (one history / autosave).
    const proposal = proposeAutoFitSpacing({
      elements: A4_Elements,
      baselineSpacing,
      currentSpacing: spacing,
      pageHeight,
    });
    if (!proposal.changed) {
      // Spacing already optimal; still rail leftover main sections when that
      // would drop a page after AI / earlier tightening (Education → sidebar).
      const collapsed = collapseSpilledMainIntoSidebar(A4_Elements, {
        spacing,
        pageHeight,
      });
      if (collapsed === A4_Elements) {
        pushToast?.({
          title: "Układ jest już dobrze dopasowany.",
          variant: "success",
        });
        return;
      }
      setA4_Elements(() => {
        const reconciled = reconcileDocumentPages(collapsed, nanoid, {
          collapseEmpty: true,
        });
        return reconciled.elements;
      });
      pushToast?.({
        title: "Układ został dopasowany.",
        msg: "Sekcja z kolumny głównej zmieściła się w sidebarze i zdjęła stronę.",
        variant: "success",
      });
      return;
    }
    applySpacing(proposal.spacing);
    pushToast?.({
      title: "Układ został dopasowany.",
      msg: "Lepiej wykorzystaliśmy przestrzeń na stronach.",
      variant: "success",
    });
  }

  return (
    <aside className={classes.panel} aria-label="Dostosuj CV">
      <div className={classes.header}>
        <div className={classes.headerText}>
          <h2>Dostosuj CV</h2>
          <p className={classes.lede}>Kontroluj strukturę i wygląd dokumentu.</p>
        </div>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Zamknij">
          <FiX />
        </button>
      </div>

      <div className={classes.tabs} role="tablist" aria-label="Obszar dostosowania CV">
        <button
          type="button"
          role="tab"
          aria-selected={renderedTab === "layout"}
          className={renderedTab === "layout" ? classes.tabActive : classes.tab}
          onClick={() => setActiveTab("layout")}
        >
          Układ
        </button>
        {appearanceEnabled ? (
          <button
            type="button"
            role="tab"
            aria-selected={renderedTab === "appearance"}
            className={renderedTab === "appearance" ? classes.tabActive : classes.tab}
            onClick={() => setActiveTab("appearance")}
          >
            Wygląd
          </button>
        ) : null}
      </div>

      {renderedTab === "appearance" && appearanceEnabled ? (
        <div className={classes.appearanceBody} role="tabpanel">
            <section className={classes.appearanceSection} aria-labelledby="appearance-palette-heading">
              <span className={classes.eyebrow}>{appearanceDefinition.templateName}</span>
              <div className={classes.appearanceHeading}>
                <h3 id="appearance-palette-heading">Paleta kolorów</h3>
                <p>{appearanceDefinition.paletteDescription
                  ?? "Każdy wariant zmienia papier, tekst, dekoracje i dopasowany zestaw ikon."}</p>
              </div>
              <div className={classes.paletteGrid} role="radiogroup" aria-labelledby="appearance-palette-heading">
                {appearanceDefinition.palettes.map((palette) => {
                  const selected = appearanceDefinition.value.palette === palette.id;
                  const cardStyle = {
                    "--palette-paper": palette.colors.paper,
                    "--palette-ink": palette.colors.ink,
                    "--palette-body": palette.colors.body ?? palette.colors.ink,
                    "--palette-muted": palette.colors.muted,
                    "--palette-accent": palette.colors.accent,
                    "--palette-sidebar": palette.colors.sidebar ?? palette.colors.pale,
                    "--palette-rule": palette.colors.rule,
                    "--palette-pale": palette.colors.pale ?? palette.colors.sidebar,
                    "--palette-photo": palette.colors.photo ?? palette.colors.pale ?? palette.colors.sidebar,
                    "--palette-job": palette.colors.jobBand ?? palette.colors.accent,
                    "--palette-job-text": palette.colors.jobText ?? palette.colors.paper,
                    "--palette-band": palette.colors.band ?? palette.colors.pale ?? palette.colors.sidebar,
                    "--palette-heading-text": palette.colors.headingText ?? palette.colors.ink,
                    "--palette-mark": palette.colors.mark ?? palette.colors.accent,
                    "--palette-field": palette.colors.field ?? palette.colors.band ?? palette.colors.pale,
                    "--palette-heading-field": palette.colors.headingOnField ?? palette.colors.headingText ?? palette.colors.ink,
                    "--palette-heading-paper": palette.colors.headingOnPaper ?? palette.colors.ink,
                    "--palette-summary-text": palette.colors.summaryText ?? palette.colors.body ?? palette.colors.ink,
                    "--palette-ornament": palette.colors.ornament ?? palette.colors.accent,
                    "--palette-folio": palette.colors.folio ?? palette.colors.accent,
                  };
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={selected ? classes.paletteOptionActive : classes.paletteOption}
                      onClick={() => handleAppearancePalette(palette.id)}
                    >
                      <span
                        className={`${classes.palettePaper} ${isAtriumAppearance ? classes.palettePaperAtrium : ""} ${isRegentAppearance ? classes.palettePaperRegent : ""} ${isLindenAppearance ? classes.palettePaperLinden : ""} ${isMonumentAppearance ? classes.palettePaperMonument : ""} ${isSlateAppearance ? classes.palettePaperSlate : ""} ${isMeridianAppearance ? classes.palettePaperMeridian : ""} ${isCadenzaAppearance ? classes.palettePaperCadenza : ""} ${isVellumAppearance ? classes.palettePaperVellum : ""}`}
                        style={cardStyle}
                        aria-hidden="true"
                      >
                        {isRegentAppearance ? (
                          <>
                            <span className={classes.paletteRegentName} />
                            <span className={classes.paletteRegentJob} />
                            <span className={classes.paletteRegentContacts} />
                            <span className={classes.paletteRegentMastheadRule} />
                            <span className={classes.paletteRegentHeading} />
                            <span className={classes.paletteRegentSectionRule} />
                            <span className={classes.paletteRegentCopy} />
                            <span className={classes.paletteRegentFolio} />
                          </>
                        ) : isAtriumAppearance ? (
                          <>
                            <span className={classes.paletteAtriumName} />
                            <span className={classes.paletteAtriumJob} />
                            <span className={classes.paletteAtriumContacts} />
                            <span className={classes.paletteAtriumPortrait} />
                            <span className={classes.paletteAtriumMastheadRule} />
                            <span className={classes.paletteAtriumHeading} />
                            <span className={classes.paletteAtriumSectionRule} />
                            <span className={classes.paletteAtriumCopy} />
                            <span className={classes.paletteAtriumFolio} />
                          </>
                        ) : isLindenAppearance ? (
                          <>
                            <span className={classes.paletteLindenSidebar} />
                            <span className={classes.paletteLindenPhoto} />
                            <span className={classes.paletteLindenContactHeading} />
                            <span className={classes.paletteLindenContacts} />
                            <span className={classes.paletteLindenName} />
                            <span className={classes.paletteLindenJob} />
                            <span className={classes.paletteLindenHeading} />
                            <span className={classes.paletteLindenCopy} />
                            <span className={classes.paletteLindenFooter} />
                          </>
                        ) : isVellumAppearance ? (
                          <>
                            <span className={classes.paletteVellumName} />
                            <span className={classes.paletteVellumJob} />
                            <span className={classes.paletteVellumContacts} />
                            <span className={classes.paletteVellumPhoto} />
                            <span className={classes.paletteVellumMastheadRule} />
                            <span className={classes.paletteVellumField} />
                            <span className={classes.paletteVellumCopy} />
                            <span className={classes.paletteVellumSection} />
                            <span className={classes.paletteVellumFooter} />
                          </>
                        ) : isCadenzaAppearance ? (
                          <>
                            <span className={classes.paletteCadenzaName} />
                            <span className={classes.paletteCadenzaJob} />
                            <span className={classes.paletteCadenzaContacts} />
                            <span className={classes.paletteCadenzaMastheadRule} />
                            <span className={classes.paletteCadenzaBand} />
                            <span className={classes.paletteCadenzaCopy} />
                            <span className={classes.paletteCadenzaSecondBand} />
                            <span className={classes.paletteCadenzaFooter} />
                          </>
                        ) : isMeridianAppearance ? (
                          <>
                            <span className={classes.paletteMeridianName} />
                            <span className={classes.paletteMeridianContacts} />
                            <span className={classes.paletteMeridianMastheadRule} />
                            <span className={classes.paletteMeridianHeading} />
                            <span className={classes.paletteMeridianSectionRule} />
                            <span className={classes.paletteMeridianRecord} />
                            <span className={classes.paletteMeridianRail} />
                            <span className={classes.paletteMeridianPageNumber} />
                          </>
                        ) : isMonumentAppearance ? (
                          <>
                            <span className={classes.paletteMonumentFrame} />
                            <span className={classes.paletteMonumentRail} />
                            <span className={classes.paletteMonumentPortrait} />
                            <span className={classes.paletteMonumentName} />
                            <span className={classes.paletteMonumentBadge} />
                            <span className={classes.paletteMonumentHeading} />
                            <span className={classes.paletteMonumentRule} />
                            <span className={classes.paletteMonumentCopy} />
                            <span className={classes.paletteMonumentFooter} />
                          </>
                        ) : isSlateAppearance ? (
                          <>
                            <span className={classes.paletteSlateSidebar} />
                            <span className={classes.paletteSlatePhoto} />
                            <span className={classes.paletteSlateName} />
                            <span className={classes.paletteSlatePill} />
                            <span className={classes.paletteSlateContacts} />
                            <span className={classes.paletteSlateBadges} />
                            <span className={classes.paletteSlateCopy} />
                            <span className={classes.paletteSlateFooter} />
                          </>
                        ) : (
                          <>
                            <span className={classes.paletteMasthead} />
                            <span className={classes.paletteRail} />
                            <span className={classes.paletteTitle} />
                            <span className={classes.paletteAccent} />
                            <span className={classes.paletteLines} />
                          </>
                        )}
                        {selected ? <span className={classes.paletteCheck}><FiCheck /></span> : null}
                      </span>
                      <span className={classes.paletteName}>{palette.name}</span>
                      <span className={classes.paletteTagline}>{palette.tagline}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={classes.appearanceSection} aria-labelledby="appearance-type-heading">
              <span className={classes.eyebrow}>Typografia</span>
              <div className={classes.appearanceHeading}>
                <h3 id="appearance-type-heading">Rozmiar tekstu</h3>
                <p>Dobierz czytelność do ilości treści. Układ i liczba stron przeliczą się automatycznie.</p>
              </div>
              <div className={classes.textSizeGroup} role="radiogroup" aria-labelledby="appearance-type-heading">
                {appearanceDefinition.textSizes.map((size) => {
                  const selected = appearanceDefinition.value.textSize === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={selected ? classes.textSizeActive : classes.textSize}
                      onClick={() => handleAppearanceTextSize(size.id)}
                      title={size.description}
                    >
                      {size.label}
                    </button>
                  );
                })}
              </div>
              <p className={classes.typeNote}>
                <strong>{appearanceDefinition.value.textSize}</strong>
                {appearanceDefinition.value.textSize === "M"
                  ? " — oryginalny rozmiar szablonu"
                  : ` — ${appearanceDefinition.textSizes.find((size) => size.id === appearanceDefinition.value.textSize)?.description}`}
                <span> · {pageStatus}</span>
              </p>
            </section>
        </div>
      ) : (
        <div className={classes.body} role="tabpanel">
          <section className={classes.section} aria-labelledby="document-status-heading">
            <span className={classes.eyebrow} id="document-status-heading">Dokument</span>
            <div className={classes.documentCard}>
              <strong className={classes.pageStatus} aria-live="polite">{pageStatus}</strong>
              {fitStatus?.reducible ? (
                <p>CV {fitHintText(fitStatus.tier, fitStatus.targetLabel)} bez zmiany faktów.</p>
              ) : (
                <p><span aria-hidden="true">✓</span> Układ wygląda dobrze · standardowe odstępy.</p>
              )}
              {fitStatus?.reducible ? (
                <button type="button" className={classes.fitCta} onClick={() => onFitToPages()}>
                  Zmieść na {fitStatus.targetLabel}
                </button>
              ) : null}
            </div>
          </section>

          <section className={classes.section} aria-labelledby="structure-heading">
            <span className={classes.eyebrow} id="structure-heading">Struktura</span>
            {!hasAnySections ? (
              <p className={classes.empty}>Brak sekcji. Dodaj pierwszą albo wczytaj szablon.</p>
            ) : null}

            {sections.length > 0 ? (
              <div className={classes.laneGroup}>
                <div className={classes.laneHeader}>
                  <h3>{sidebarSections.length > 0 ? "Kolumna główna" : "Jedna kolumna"}</h3>
                  <span>{sections.length} {sections.length === 1 ? "sekcja" : "sekcje"}</span>
                </div>
                <ul className={classes.list}>
                  {sections.map((section, index) => {
                    const label = displaySectionTitle(section.title);
                    return (
                      <li key={section.id} className={classes.item}>
                        <LuGripVertical className={classes.grip} aria-hidden="true" />
                        <span className={classes.title} title={section.title}>{label}</span>
                        <div className={classes.actions}>
                          {isSkillsSectionTitle(section.title) ? (
                            <button type="button" onClick={() => openSkillsLayoutModal?.(section.headingId)} aria-label={`Zmień styl umiejętności: ${label}`} title="Styl umiejętności">
                              <LuLayoutGrid />
                            </button>
                          ) : null}
                          <button type="button" disabled={index === 0} onClick={() => move(section.headingId, "up")} aria-label={`Przenieś ${label} wyżej`} title="Wyżej"><FiChevronUp /></button>
                          <button type="button" disabled={index === sections.length - 1} onClick={() => move(section.headingId, "down")} aria-label={`Przenieś ${label} niżej`} title="Niżej"><FiChevronDown /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className={classes.addButton} onClick={() => openAddSectionModal?.()}>
                  <FiPlus aria-hidden="true" /> Dodaj sekcję
                </button>
              </div>
            ) : null}

            {sidebarSections.length > 0 ? (
              <div className={classes.laneGroup}>
                <div className={classes.laneHeader}>
                  <h3>Sidebar</h3>
                  <span>{sidebarSections.length} {sidebarSections.length === 1 ? "sekcja" : "sekcje"}</span>
                </div>
                <ul className={classes.list}>
                  {sidebarSections.map((section, index) => {
                    const label = displaySectionTitle(section.title);
                    return (
                      <li key={section.id} className={classes.item}>
                        <LuGripVertical className={classes.grip} aria-hidden="true" />
                        <span className={classes.title} title={section.title}>{label}</span>
                        <div className={classes.actions}>
                          <button type="button" disabled={index === 0} onClick={() => move(section.headingId, "up")} aria-label={`Przenieś ${label} wyżej w sidebarze`} title="Wyżej"><FiChevronUp /></button>
                          <button type="button" disabled={index === sidebarSections.length - 1} onClick={() => move(section.headingId, "down")} aria-label={`Przenieś ${label} niżej w sidebarze`} title="Niżej"><FiChevronDown /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className={classes.addButton} onClick={() => openAddSectionModal?.({ lane: "sidebar" })}>
                  <FiPlus aria-hidden="true" /> Dodaj sekcję
                </button>
              </div>
            ) : null}
          </section>

          <section className={classes.section} aria-labelledby="spacing-heading">
            <span className={classes.eyebrow} id="spacing-heading">Odstępy</span>
            <div className={classes.densityHeader}>
              <h3>Gęstość</h3>
              <p className={classes.densityLede}>Dopasuj ilość wolnego miejsca bez zmiany treści CV.</p>
            </div>

            <div className={classes.segmented} role="radiogroup" aria-labelledby={densityGroupId}>
              <span id={densityGroupId} className={classes.srOnly}>Gęstość układu</span>
              {DENSITY_OPTIONS.map((option) => {
                const pressed = activeDensity === option.id;
                return (
                  <button key={option.id} type="button" role="radio" aria-checked={pressed} aria-pressed={pressed} className={pressed ? classes.segmentActive : classes.segment} onClick={() => handleDensitySelect(option.id)}>
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className={classes.densityScale} aria-hidden="true"><span>Więcej treści</span><span>Więcej oddechu</span></div>

            <button type="button" className={classes.autoFit} onClick={handleAutoFit} title="Dobierz odstępy i balans treści do obecnej liczby stron." aria-label="Zoptymalizuj układ dokumentu">
              Zoptymalizuj układ
            </button>
            <p className={classes.autoFitHint}>Dobierz odstępy i balans treści do obecnej liczby stron.</p>

            <div className={classes.advanced}>
              <button type="button" className={classes.advancedToggle} aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>
                <span>Precyzyjne odstępy</span>
                <FiChevronDown className={advancedOpen ? classes.chevronOpen : classes.chevron} aria-hidden="true" />
              </button>

              {advancedOpen ? (
                <div className={classes.advancedBody}>
                  <div className={classes.spacingList}>
                    {SPACING_FIELDS.map((field) => (
                      <div key={field.key} className={classes.spacingField}>
                        <span className={classes.spacingLabel}>{field.label}</span>
                        <span className={classes.stepper}>
                          <button type="button" onClick={() => nudgeSpacing(field.key, -1)} aria-label={`Zmniejsz: ${field.label}`}><FiMinus /></button>
                          <output aria-label={`${field.label}: ${spacing[field.key]} pikseli`}>{spacing[field.key]}</output>
                          <button type="button" onClick={() => nudgeSpacing(field.key, 1)} aria-label={`Zwiększ: ${field.label}`}><FiPlus /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={classes.reset} onClick={handleResetSpacing} disabled={atBaseline} title="Przywróć odstępy z momentu otwarcia lub wypełnienia CV">
                    Przywróć ustawienia szablonu
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
