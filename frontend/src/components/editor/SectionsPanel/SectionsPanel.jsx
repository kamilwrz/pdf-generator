/**
 * Template-mode section list: reorder sections (up/down) and edit vertical
 * spacing between lines, entries, and sections.
 *
 * Renders as a docked flyout to the right of the 72px sidebar rail.
 * Embedding the list inside the rail collapses titles.
 */
import { use, useEffect, useMemo } from "react";
import { FiChevronDown, FiChevronUp, FiPlus, FiX } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import {
  applyFlowSpacing,
  listDocumentSections,
  reorderSection,
} from "../../../utils/sectionStructure";
import {
  DEFAULT_FLOW_SPACING,
  flowSpacingEquals,
  normalizeFlowSpacing,
} from "../../../utils/flowSpacing";
import classes from "./SectionsPanel.module.css";

/** User-facing spacing knobs — keys stay aligned with SPACE_* in the generator. */
const SPACING_FIELDS = [
  { key: "stack", label: "Wewnątrz wpisu", hint: "linie jednego doświadczenia" },
  { key: "record", label: "Między wpisami", hint: "kolejne prace lub szkoły" },
  { key: "section", label: "Między sekcjami", hint: "np. po doświadczeniu" },
  { key: "after_rule", label: "Pod nagłówkiem", hint: "od tytułu do treści" },
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
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    openAddSectionModal,
  } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;
  const spacing = useMemo(
    () => normalizeFlowSpacing(flowSpacing),
    [flowSpacing],
  );
  const baselineSpacing = useMemo(
    () => normalizeFlowSpacing(baselineFlowSpacing ?? DEFAULT_FLOW_SPACING),
    [baselineFlowSpacing],
  );
  const sections = useMemo(
    () => listDocumentSections(A4_Elements, pageHeight),
    [A4_Elements, pageHeight],
  );

  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function move(headingId, direction) {
    const next = reorderSection(A4_Elements, headingId, direction, pageHeight, {
      spacing,
    });
    if (next) setA4_Elements(next);
  }

  function applySpacing(nextSpacing) {
    const normalized = normalizeFlowSpacing(nextSpacing);
    // Same knobs → do not force-pack. Generator geometry is not byte-identical
    // to a forceTargets pack; re-packing on a no-op Reset can pull later
    // sections onto page 1.
    if (flowSpacingEquals(spacing, normalized)) return;
    setFlowSpacing(normalized);
    setA4_Elements((prev) => applyFlowSpacing(prev, normalized, pageHeight));
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

  return (
    <div className={classes.panel} role="dialog" aria-label="Sekcje CV">
      <div className={classes.header}>
        <div className={classes.headerText}>
          <h2>Sekcje</h2>
          <p className={classes.lede}>
            Ułóż kolejność bloków CV. Strzałki przesuwają całą sekcję.
          </p>
        </div>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Zamknij">
          <FiX />
        </button>
      </div>

      <div className={classes.addRow}>
        <button
          type="button"
          className={classes.addButton}
          onClick={() => openAddSectionModal?.()}
        >
          <FiPlus aria-hidden="true" />
          Dodaj sekcję
        </button>
      </div>

      <div className={classes.body}>
        {sections.length === 0 ? (
          <p className={classes.empty}>
            Brak sekcji do uporządkowania. Dodaj pierwszą albo wczytaj szablon.
          </p>
        ) : (
          <ul className={classes.list}>
            {sections.map((section, index) => {
              const label = displaySectionTitle(section.title);
              return (
                <li key={section.id} className={classes.item}>
                  <span className={classes.index} aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className={classes.title} title={section.title}>
                    {label}
                  </span>
                  <div className={classes.actions}>
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
        )}
      </div>

      <div className={classes.spacing}>
        <div className={classes.spacingHeader}>
          <div>
            <h3>Odstępy</h3>
            <p className={classes.spacingLede}>
              Zmiana od razu widać na CV. Możesz wrócić do wartości z otwarcia dokumentu.
            </p>
          </div>
          <button
            type="button"
            className={classes.reset}
            onClick={handleResetSpacing}
            title="Przywróć odstępy z momentu otwarcia lub wypełnienia CV"
          >
            Przywróć
          </button>
        </div>
        <div className={classes.spacingGrid}>
          {SPACING_FIELDS.map((field) => (
            <label key={field.key} className={classes.spacingField}>
              <span className={classes.spacingLabel}>{field.label}</span>
              <span className={classes.spacingHint}>{field.hint}</span>
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
      </div>
    </div>
  );
}
