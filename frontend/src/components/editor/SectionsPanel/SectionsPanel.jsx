/**
 * Template-mode section list: reorder sections structurally (up/down) and
 * edit the document SPACE_* rhythm (stack / record / section / after_rule).
 *
 * Renders as a docked flyout to the right of the 72px sidebar rail (same
 * pattern as Editor). Embedding the list inside the rail collapses titles.
 */
import { use, useEffect, useMemo, useState } from "react";
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
import AddSectionModal from "../AddSectionModal/AddSectionModal";
import classes from "./SectionsPanel.module.css";

const SPACING_FIELDS = [
  { key: "stack", label: "W rekordzie", hint: "tytuł → meta → treść" },
  { key: "record", label: "Między rekordami", hint: "kolejne wpisy w sekcji" },
  { key: "section", label: "Między sekcjami", hint: "po sekcji przed nagłówkiem" },
  { key: "after_rule", label: "Po linii nagłówka", hint: "reguła → pierwsza treść" },
];

export default function SectionsPanel({ onClose }) {
  const {
    A4_Elements,
    setA4_Elements,
    pageSize,
    flowSpacing,
    setFlowSpacing,
    baselineFlowSpacing,
    addSection,
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
  // Controls the "Dodaj sekcję" modal; kept local because the new section's
  // draft name/layout never need to be visible outside this panel.
  const [addModalOpen, setAddModalOpen] = useState(false);

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
    // Same knobs → do not force-pack. Generator / ReportLab geometry is not
    // byte-identical to a forceTargets pack at SPACE_* (especially under-rule
    // and masthead clearance). Re-packing on a no-op Reset pulls later
    // sections onto page 1 on every template that uses the shared packer.
    if (flowSpacingEquals(spacing, normalized)) return;
    setFlowSpacing(normalized);
    setA4_Elements((prev) => applyFlowSpacing(prev, normalized, pageHeight));
  }

  // Appends the new section via the context's addSection (Task 4) and closes
  // the modal. The modal itself resets its form on next open, so no cleanup
  // of `name`/`layout` is needed here.
  function handleConfirmAddSection({ name, layout }) {
    addSection({ name, layout });
    setAddModalOpen(false);
  }

  function handleSpacingChange(key, rawValue) {
    const parsed = Number(rawValue);
    applySpacing({
      ...spacing,
      [key]: Number.isFinite(parsed) ? parsed : spacing[key],
    });
  }

  function handleResetSpacing() {
    // Restore the rhythm captured when this CV was rendered / loaded — not a
    // hardcoded DEFAULT when the document already sits on those knobs.
    applySpacing(baselineSpacing);
  }

  return (
    <div className={classes.panel} role="dialog" aria-label="Sekcje CV">
      <div className={classes.header}>
        <h2>Sekcje</h2>
        <button type="button" className={classes.close} onClick={onClose} aria-label="Zamknij">
          ×
        </button>
      </div>
      <p className={classes.hint}>
        Zmień kolejność całych sekcji. W trybie szablonu nie przesuwasz pojedynczych pól.
      </p>
      <div className={classes.addRow}>
        <button
          type="button"
          className={classes.addButton}
          onClick={() => setAddModalOpen(true)}
        >
          + Dodaj sekcję
        </button>
      </div>
      {sections.length === 0 ? (
        <p className={classes.empty}>Brak wykrytych sekcji w tym dokumencie.</p>
      ) : (
        <ul className={classes.list}>
          {sections.map((section, index) => (
            <li key={section.id} className={classes.item}>
              <span className={classes.title}>{section.title}</span>
              <div className={classes.actions}>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(section.headingId, "up")}
                  aria-label={`Przenieś ${section.title} w górę`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === sections.length - 1}
                  onClick={() => move(section.headingId, "down")}
                  aria-label={`Przenieś ${section.title} w dół`}
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={classes.rhythm}>
        <div className={classes.rhythmHeader}>
          <h3>Rytm układu</h3>
          <button type="button" className={classes.reset} onClick={handleResetSpacing}>
            Reset
          </button>
        </div>
        <p className={classes.hint}>
          Odstępy w px (jak SPACE_* w generatorze). Zmiana od razu pakuje canvas i trafia do zapisu / zmiany szablonu.
          Reset przywraca wartości z momentu renderu / wczytania CV — bez ponownego pakowania, gdy nic się nie zmieniło.
        </p>
        <div className={classes.rhythmGrid}>
          {SPACING_FIELDS.map((field) => (
            <label key={field.key} className={classes.rhythmField}>
              <span className={classes.rhythmLabel}>{field.label}</span>
              <span className={classes.rhythmMeta}>{field.hint}</span>
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={spacing[field.key]}
                onChange={(event) => handleSpacingChange(field.key, event.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <AddSectionModal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onConfirm={handleConfirmAddSection}
      />
    </div>
  );
}
