/**
 * Modal for adding a new template-mode section: a section name plus a layout
 * choice (single textarea, or an education/experience-style record). The column
 * layout ("bb") is intentionally absent — it requires horizontal-row packer
 * support and ships in a later iteration.
 */
import { useEffect, useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import { SECTION_LAYOUTS } from "../../../utils/sectionBuilder";
import classes from "./AddSectionModal.module.css";

const LAYOUT_OPTIONS = [
  {
    value: SECTION_LAYOUTS.TEXTAREA,
    title: "Nagłówek + treść",
    description: "Nagłówek sekcji i jedno pole tekstowe (Textarea).",
  },
  {
    value: SECTION_LAYOUTS.RECORD,
    title: "Nagłówek + rekord",
    description: "Układ jak w edukacji lub doświadczeniu (tytuł, podtytuł, meta, opis).",
  },
];

export default function AddSectionModal({ open, onCancel, onConfirm }) {
  const [name, setName] = useState("");
  const [layout, setLayout] = useState(SECTION_LAYOUTS.TEXTAREA);

  // Reset the form each time the modal opens so a previous entry does not leak
  // into the next section.
  useEffect(() => {
    if (open) {
      setName("");
      setLayout(SECTION_LAYOUTS.TEXTAREA);
    }
  }, [open]);

  function handleConfirm() {
    const trimmed = name.trim();
    onConfirm({ name: trimmed || "Nowa sekcja", layout });
  }

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={440}
      title="Dodaj sekcję"
      subtitle="Nowa sekcja trafi na koniec dokumentu w rytmie szablonu"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onCancel}>
            Anuluj
          </button>
          <button type="button" className={classes.primary} onClick={handleConfirm}>
            Dodaj sekcję
          </button>
        </div>
      )}
    >
      <label className={classes.field}>
        <span className={classes.label}>Nazwa sekcji</span>
        <input
          className={classes.input}
          type="text"
          value={name}
          placeholder="np. Certyfikaty"
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>

      <fieldset className={classes.fieldset}>
        <legend className={classes.label}>Układ sekcji</legend>
        {LAYOUT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`${classes.option}${layout === option.value ? ` ${classes.optionActive}` : ""}`}
          >
            <input
              type="radio"
              name="section-layout"
              value={option.value}
              checked={layout === option.value}
              onChange={() => setLayout(option.value)}
            />
            <span className={classes.optionText}>
              <span className={classes.optionTitle}>{option.title}</span>
              <span className={classes.optionDesc}>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </DialogShell>
  );
}
