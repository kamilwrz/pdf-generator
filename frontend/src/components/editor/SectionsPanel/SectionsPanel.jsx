/**
 * Template-mode customization panel ("Dostosuj CV"): document status, section
 * structure, density presets, precise spacing, and a reserved appearance tab. A
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
import { FiChevronDown, FiChevronUp, FiMinus, FiPlus, FiX } from "react-icons/fi";
import { LuGripVertical, LuLayoutGrid } from "react-icons/lu";
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
    pageSize,
    pageCount,
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    openAddSectionModal,
    openSkillsLayoutModal,
    pushToast,
    fitStatus,
    onFitToPages,
  } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;
  const densityGroupId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("layout");

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
    <div className={classes.panel} role="dialog" aria-label="Dostosuj CV">
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
          aria-selected={activeTab === "layout"}
          className={activeTab === "layout" ? classes.tabActive : classes.tab}
          onClick={() => setActiveTab("layout")}
        >
          Układ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "appearance"}
          className={activeTab === "appearance" ? classes.tabActive : classes.tab}
          onClick={() => setActiveTab("appearance")}
        >
          Wygląd
        </button>
      </div>

      {activeTab === "appearance" ? (
        <div className={classes.appearanceEmpty} role="tabpanel">
          <span className={classes.eyebrow}>Wygląd</span>
          <h3>Palety kolorów pojawią się tutaj</h3>
          <p>
            Przygotowujemy kuratorowane warianty dopasowane do każdego szablonu,
            aby zmiana stylu nie pogarszała czytelności CV.
          </p>
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
                <button type="button" className={classes.fitCta} onClick={onFitToPages}>
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
    </div>
  );
}
