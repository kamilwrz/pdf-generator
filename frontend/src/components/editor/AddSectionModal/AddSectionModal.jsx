/**
 * Modal for adding a new template-mode section: a section name plus a layout
 * choice — a single textarea, an education-style record, or an
 * experience-style record. When the active template uses iconic section
 * decorations, a small gallery lists every available glyph so the new heading
 * gets an icon at the same offset as its siblings.
 */
import { useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import { SECTION_LAYOUTS } from "../../../utils/sectionBuilder";
import { suggestSectionIconName } from "../../../utils/sectionIcons";
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

/**
 * @param {{
 *   open: boolean,
 *   onCancel: () => void,
 *   onConfirm: (payload: { name: string, layout: string, iconName: string|null }) => void,
 *   iconOptions?: { name: string, src: string, label: string }[],
 * }} props
 */
export default function AddSectionModal({
  open,
  onCancel,
  onConfirm,
  iconOptions = [],
}) {
  const [name, setName] = useState("");
  const [layout, setLayout] = useState(SECTION_LAYOUTS.TEXTAREA);
  const [iconName, setIconName] = useState(null);
  // Tracks the `open` value seen on the previous render so the block below can
  // detect a closed-to-open transition. State (not a ref) is required here:
  // the React Compiler's exhaustive lint rules forbid reading `ref.current`
  // during render, and React's own guidance for "adjusting state when a prop
  // changes" uses state for exactly this "previous value" bookkeeping.
  const [wasOpen, setWasOpen] = useState(open);

  const hasIcons = Array.isArray(iconOptions) && iconOptions.length > 0;
  const availableNames = hasIcons ? iconOptions.map((option) => option.name) : [];

  // Reset the form when the modal transitions from closed to open.
  if (open && !wasOpen) {
    setName("");
    setLayout(SECTION_LAYOUTS.TEXTAREA);
    setIconName(
      hasIcons
        ? (suggestSectionIconName("", availableNames) || iconOptions[0].name)
        : null,
    );
  }
  if (wasOpen !== open) {
    setWasOpen(open);
  }

  function handleNameChange(event) {
    const nextName = event.target.value;
    setName(nextName);
    // Keep the gallery selection in sync with the title while the user types,
    // but only when the current pick is still the auto-suggestion for the
    // previous title (or empty) — never override a deliberate manual choice.
    if (!hasIcons) return;
    const previousSuggestion = suggestSectionIconName(name, availableNames);
    const nextSuggestion = suggestSectionIconName(nextName, availableNames);
    if (
      nextSuggestion
      && (iconName == null || iconName === previousSuggestion || iconName === "other")
    ) {
      setIconName(nextSuggestion);
    }
  }

  function handleConfirm() {
    const trimmed = name.trim();
    onConfirm({
      name: trimmed || "Nowa sekcja",
      layout,
      iconName: hasIcons ? (iconName || iconOptions[0]?.name || null) : null,
    });
  }

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={hasIcons ? 480 : 440}
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
          onChange={handleNameChange}
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

      {hasIcons ? (
        <fieldset className={`${classes.fieldset} ${classes.iconFieldset}`}>
          <legend className={classes.label}>Ikona nagłówka</legend>
          <p className={classes.iconHint}>
            Wybierz ikonę — pojawi się obok tytułu, tak jak w innych sekcjach tego szablonu.
          </p>
          <div className={classes.iconGallery} role="listbox" aria-label="Ikony sekcji">
            {iconOptions.map((option) => {
              const selected = iconName === option.name;
              return (
                <button
                  key={option.name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`${classes.iconTile}${selected ? ` ${classes.iconTileActive}` : ""}`}
                  title={option.label}
                  aria-label={option.label}
                  onClick={() => setIconName(option.name)}
                >
                  <img src={option.src} alt="" className={classes.iconThumb} draggable={false} />
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </DialogShell>
  );
}
