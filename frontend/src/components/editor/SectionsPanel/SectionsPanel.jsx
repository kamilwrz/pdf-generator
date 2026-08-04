/**
 * Template-mode section list: reorder sections structurally (up/down).
 */
import { use, useMemo } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { listDocumentSections, reorderSection } from "../../../utils/sectionStructure";
import classes from "./SectionsPanel.module.css";

export default function SectionsPanel({ onClose }) {
  const { A4_Elements, setA4_Elements, pageSize } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;
  const sections = useMemo(
    () => listDocumentSections(A4_Elements, pageHeight),
    [A4_Elements, pageHeight],
  );

  function move(headingId, direction) {
    const next = reorderSection(A4_Elements, headingId, direction, pageHeight);
    if (next) setA4_Elements(next);
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
    </div>
  );
}
