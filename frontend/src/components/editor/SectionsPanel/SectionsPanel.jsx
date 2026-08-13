/**
 * Template-mode layout panel ("Układ CV"): reorder sections, density presets,
 * advanced spacing knobs, and offline auto-fit of page fill/balance. A
 * main-column Skills section's list row also gets a layout icon opening
 * `SkillsLayoutModal` (same modal the canvas heading hover control opens —
 * see `SectionRecordAdd`), so the mode picker is reachable without hunting
 * for the heading on the page.
 *
 * Renders as a docked flyout to the right of the 72px sidebar rail.
 * Does not own pagination / orphan keep-together / LongCv 3+ page correction.
 */
import { use, useEffect, useId, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { FiChevronDown, FiChevronUp, FiPlus, FiX } from "react-icons/fi";
import { LuLayoutGrid } from "react-icons/lu";
import { PdfContext } from "../../../store/pdfgenerator-context";
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

export default function SectionsPanel({ onClose }) {
  const {
    A4_Elements,
    setA4_Elements,
    pageSize,
    pageCount,
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    openAddSectionModal,
    openSkillsLayoutModal,
    pushToast,
  } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;
  const densityGroupId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className={classes.panel} role="dialog" aria-label="Układ CV">
      <div className={classes.header}>
        <div className={classes.headerText}>
          <h2>Układ CV</h2>
          <p className={classes.lede}>
            Zmieniaj kolejność sekcji i dopasuj rozkład dokumentu.
          </p>
          <p className={classes.pageStatus} aria-live="polite">
            {pageStatus}
          </p>
        </div>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Zamknij">
          <FiX />
        </button>
      </div>

      <div className={classes.body}>
        {!hasAnySections ? (
          <p className={classes.empty}>
            Brak sekcji do uporządkowania. Dodaj pierwszą albo wczytaj szablon.
          </p>
        ) : (
          <>
            {sections.length > 0 ? (
              <>
                {sidebarSections.length > 0 ? (
                  <h3 className={classes.laneHeading}>Kolumna główna</h3>
                ) : null}
                <ul className={classes.list}>
                  {sections.map((section, index) => {
                    const label = displaySectionTitle(section.title);
                    return (
                      <li key={section.id} className={classes.item}>
                        <span className={classes.title} title={section.title}>
                          {label}
                        </span>
                        <div className={classes.actions}>
                          {isSkillsSectionTitle(section.title) ? (
                            <button
                              type="button"
                              onClick={() => openSkillsLayoutModal?.(section.headingId)}
                              aria-label={`Zmień styl umiejętności: ${label}`}
                              title="Styl umiejętności (w linii / lista / chipsy)"
                            >
                              <LuLayoutGrid />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => move(section.headingId, "up")}
                            aria-label={`Przenieś ${label} wyżej`}
                            title="Wyżej"
                          >
                            <FiChevronUp />
                          </button>
                          <button
                            type="button"
                            disabled={index === sections.length - 1}
                            onClick={() => move(section.headingId, "down")}
                            aria-label={`Przenieś ${label} niżej`}
                            title="Niżej"
                          >
                            <FiChevronDown />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}

            {sidebarSections.length > 0 ? (
              <>
                <h3 className={classes.laneHeading}>Sidebar</h3>
                <ul className={classes.list}>
                  {sidebarSections.map((section, index) => {
                    const label = displaySectionTitle(section.title);
                    return (
                      <li key={section.id} className={classes.item}>
                        <span className={classes.title} title={section.title}>
                          {label}
                        </span>
                        <div className={classes.actions}>
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => move(section.headingId, "up")}
                            aria-label={`Przenieś ${label} wyżej w sidebarze`}
                            title="Wyżej"
                          >
                            <FiChevronUp />
                          </button>
                          <button
                            type="button"
                            disabled={index === sidebarSections.length - 1}
                            onClick={() => move(section.headingId, "down")}
                            aria-label={`Przenieś ${label} niżej w sidebarze`}
                            title="Niżej"
                          >
                            <FiChevronDown />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </>
        )}

        <button
          type="button"
          className={classes.addButton}
          onClick={() => openAddSectionModal?.()}
        >
          <FiPlus aria-hidden="true" />
          Dodaj sekcję
        </button>
        {sidebarSections.length > 0 ? (
          <button
            type="button"
            className={classes.addButtonSecondary}
            onClick={() => openAddSectionModal?.({ lane: "sidebar" })}
          >
            <FiPlus aria-hidden="true" />
            Dodaj w sidebarze
          </button>
        ) : null}
      </div>

      <div className={classes.density}>
        <div className={classes.densityHeader}>
          <h3>Gęstość układu</h3>
          <p className={classes.densityLede}>
            Dopasuj ilość wolnego miejsca bez zmiany treści CV.
          </p>
        </div>

        <div
          className={classes.segmented}
          role="radiogroup"
          aria-labelledby={densityGroupId}
        >
          <span id={densityGroupId} className={classes.srOnly}>
            Gęstość układu
          </span>
          {DENSITY_OPTIONS.map((option) => {
            const pressed = activeDensity === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={pressed}
                aria-pressed={pressed}
                className={pressed ? classes.segmentActive : classes.segment}
                onClick={() => handleDensitySelect(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={classes.autoFit}
          onClick={handleAutoFit}
          title="Dobierz odstępy tak, aby lepiej wykorzystać powierzchnię stron."
          aria-label="Dopasuj automatycznie odstępy układu"
        >
          Dopasuj automatycznie
        </button>

        <div className={classes.advanced}>
          <button
            type="button"
            className={classes.advancedToggle}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span>Zaawansowane odstępy</span>
            <FiChevronDown
              className={advancedOpen ? classes.chevronOpen : classes.chevron}
              aria-hidden="true"
            />
          </button>

          {advancedOpen ? (
            <div className={classes.advancedBody}>
              <div className={classes.spacingList}>
                {SPACING_FIELDS.map((field) => (
                  <label key={field.key} className={classes.spacingField}>
                    <span className={classes.spacingLabel}>{field.label}</span>
                    <span className={classes.spacingInputWrap}>
                      <input
                        type="number"
                        min={0}
                        max={80}
                        step={1}
                        value={spacing[field.key]}
                        onChange={(event) => handleSpacingChange(field.key, event.target.value)}
                        aria-label={`${field.label} (piksele)`}
                      />
                      <span className={classes.unit} aria-hidden="true">px</span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className={classes.reset}
                onClick={handleResetSpacing}
                disabled={atBaseline}
                title="Przywróć odstępy z momentu otwarcia lub wypełnienia CV"
              >
                Przywróć odstępy szablonu
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
