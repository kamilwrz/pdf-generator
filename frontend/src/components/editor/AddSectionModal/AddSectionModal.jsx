/**
 * Modal for adding a new template-mode section: a section name plus a layout
 * choice — a single textarea, an education-style record, or an
 * experience-style record. Education and Experience are offered as distinct
 * options (not one merged "record" choice) because their field structures
 * differ: Education has a school/university line that Experience does not
 * (see `sectionBuilder.js` for the underlying field-line specs). The column
 * layout ("bb") is intentionally absent — it requires horizontal-row packer
 * support and ships in a later iteration.
 */
import { useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import { SECTION_LAYOUTS } from "../../../utils/sectionBuilder";
import classes from "./AddSectionModal.module.css";

const LAYOUT_OPTIONS = [
  {
    value: SECTION_LAYOUTS.TEXTAREA,
    title: "Prosta treść",
    description: "Tytuł sekcji i jedno pole na dłuższy tekst — np. podsumowanie.",
  },
  {
    value: SECTION_LAYOUTS.RECORD_EDUCATION,
    title: "Jak wykształcenie",
    description: "Dyplom, uczelnia, miasto i okres oraz opis.",
  },
  {
    value: SECTION_LAYOUTS.RECORD_EXPERIENCE,
    title: "Jak doświadczenie",
    description: "Stanowisko, firma i okres oraz opis.",
  },
];

export default function AddSectionModal({ open, onCancel, onConfirm }) {
  const [name, setName] = useState("");
  const [layout, setLayout] = useState(SECTION_LAYOUTS.TEXTAREA);
  // Tracks the `open` value seen on the previous render so the block below can
  // detect a closed-to-open transition. State (not a ref) is required here:
  // the React Compiler's exhaustive lint rules forbid reading `ref.current`
  // during render, and React's own guidance for "adjusting state when a prop
  // changes" (see https://react.dev/learn/you-might-not-need-an-effect
  // #adjusting-some-state-when-a-prop-changes) uses state for exactly this
  // "previous value" bookkeeping.
  const [wasOpen, setWasOpen] = useState(open);

  // Reset the form when the modal transitions from closed to open. Computed
  // during render (not an effect) per React's guidance for adjusting state in
  // response to a prop change — DialogShell unmounts its own content while
  // closed, but this component instance persists, so state must be reset
  // explicitly rather than relying on unmount/remount.
  if (open && !wasOpen) {
    setName("");
    setLayout(SECTION_LAYOUTS.TEXTAREA);
  }
  if (wasOpen !== open) {
    setWasOpen(open);
  }

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
      subtitle="Nowa sekcja pojawi się na końcu CV, w stylu obecnego szablonu"
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
        <legend className={classes.label}>Rodzaj sekcji</legend>
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
