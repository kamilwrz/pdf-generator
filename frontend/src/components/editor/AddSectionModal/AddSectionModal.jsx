/**
 * Modal for adding a new template-mode section: a section name plus a layout
 * choice — a single textarea, category heading+body groups, an education-style
 * record, an experience-style record, or compact equal-width grid entries.
 * When the active template uses iconic section decorations, a small gallery
 * lists every available glyph so the new heading gets an icon at the same
 * offset as its siblings.
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
    value: SECTION_LAYOUTS.RECORD_SUBCATEGORY,
    title: "Prosta treść (kategorie)",
    description:
      "Nagłówek sekcji oraz powtarzalne bloki „nazwa kategorii + treść” — jak podkategorie w Umiejętnościach. "
      + "Każdą kategorię możesz później dodać przyciskiem + przy bloku.",
  },
  {
    value: SECTION_LAYOUTS.GRID,
    title: "Krótkie wpisy w kolumnach",
    description:
      "Równe kolumny na krótkie wpisy, np. JĘZYKI. Przycisk + przy wpisie dodaje następną kolumnę; "
      + "po zapełnieniu wiersza kolejne wpisy przechodzą do nowej linii. Kosz usuwa wpis, a pozostałe kolumny automatycznie się zsuwają.",
  },
  {
    value: SECTION_LAYOUTS.RECORD_EDUCATION,
    title: "Wpis z dodatkowymi szczegółami",
    description:
      "Nazwa, organizacja lub miejsce, okres, lokalizacja i opis. Pola przejmą strukturę Wykształcenia z obecnego szablonu.",
  },
  {
    value: SECTION_LAYOUTS.RECORD_EXPERIENCE,
    title: "Wpis z opisem",
    description:
      "Nazwa, organizacja, okres, lokalizacja i opis. Pola przejmą strukturę Doświadczenia z obecnego szablonu.",
  },
];

/**
 * @param {{
 *   open: boolean,
 *   onCancel: () => void,
 *   onConfirm: (payload: { name: string, layout: string, iconName: string|null }) => void,
 *   iconOptions?: { name: string, src: string, label: string }[],
 *   insertAfterHeading?: boolean,
 * }} props
 */
export default function AddSectionModal({
  open,
  onCancel,
  onConfirm,
  iconOptions = [],
  insertAfterHeading = false,
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

  const selectedIconLabel = hasIcons
    ? (iconOptions.find((option) => option.name === iconName)?.label || "—")
    : null;

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={hasIcons ? 1280 : 560}
      title="Dodaj sekcję"
      restoreFocusSelector='button[aria-label="Dostosuj CV"]'
      subtitle={insertAfterHeading
        ? "Nowa sekcja pojawi się bezpośrednio pod wybraną sekcją, w stylu obecnego szablonu."
        : "Nowa sekcja pojawi się na końcu CV, w stylu obecnego szablonu."}
      bodyClassName={hasIcons ? classes.bodyTwoCol : classes.bodyOneCol}
      footer={(
        <>
          <span className={classes.footerHint}>Sekcję możesz później zmienić lub usunąć w panelu sekcji.</span>
          <div className={classes.actions}>
            <button type="button" className={classes.ghost} onClick={onCancel}>
              Anuluj
            </button>
            <button type="button" className={classes.primary} onClick={handleConfirm}>
              Dodaj sekcję
            </button>
          </div>
        </>
      )}
    >
      <div className={classes.leftCol}>
        <label className={classes.field}>
          <span className={classes.label}>Nazwa sekcji</span>
          <input
            className={classes.input}
            type="text"
            value={name}
            placeholder={layout === SECTION_LAYOUTS.GRID ? "np. Języki" : "np. Certyfikaty"}
            onChange={handleNameChange}
            autoFocus
          />
        </label>

        <fieldset className={classes.fieldset}>
          <legend className={classes.label}>Rodzaj sekcji</legend>
          {LAYOUT_OPTIONS.map((option) => {
            const active = layout === option.value;
            return (
              <label
                key={option.value}
                className={`${classes.option}${active ? ` ${classes.optionActive}` : ""}`}
              >
                <input
                  className={classes.radioInput}
                  type="radio"
                  name="section-layout"
                  value={option.value}
                  checked={active}
                  onChange={() => setLayout(option.value)}
                />
                <span className={`${classes.dot}${active ? ` ${classes.dotActive}` : ""}`} aria-hidden="true" />
                <span className={classes.optionText}>
                  <span className={classes.optionTitle}>{option.title}</span>
                  <span className={classes.optionDesc}>{option.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>

      {hasIcons ? (
        <div className={classes.rightCol}>
          <span className={classes.label}>Ikona nagłówka</span>
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
          <p className={classes.selectedIconLabel}>
            Wybrana ikona: <span>{selectedIconLabel}</span>
          </p>
        </div>
      ) : null}
    </DialogShell>
  );
}
