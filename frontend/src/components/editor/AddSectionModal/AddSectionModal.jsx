/**
 * Domain-specific section picker for the template-mode editor.
 *
 * Each choice previews the information hierarchy that will be inserted on the
 * A4 canvas. The cards use the same Polish field guidance as “Utwórz nowe CV”;
 * those strings become placeholder metadata rather than saved document text.
 * Icon-aware templates keep their heading-glyph gallery below the section grid.
 */
import { useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import {
  getSectionPreset,
  SECTION_PRESETS,
  SECTION_TYPES,
} from "../../../utils/sectionBuilder";
import { STARTER_FIELD_PLACEHOLDERS } from "../../../utils/cvStarter";
import { suggestSectionIconName } from "../../../utils/sectionIcons";
import classes from "./AddSectionModal.module.css";

function PreviewRule() {
  return <span className={classes.previewRule} aria-hidden="true" />;
}

function PreviewLine({ children, strong = false, muted = false, align = "left" }) {
  const className = [
    classes.previewLine,
    strong ? classes.previewLineStrong : "",
    muted ? classes.previewLineMuted : "",
    align === "right" ? classes.previewLineRight : "",
  ].filter(Boolean).join(" ");
  return <span className={className}>{children}</span>;
}

/** Render a compact, non-interactive A4 section miniature for one preset. */
function SectionStructurePreview({ preset }) {
  const p = STARTER_FIELD_PLACEHOLDERS;
  let body = null;

  if (preset.type === SECTION_TYPES.SUMMARY) {
    body = (
      <div className={classes.summaryPreview}>
        <PreviewLine>{p.summary}</PreviewLine>
        <span className={classes.textMeasure} />
      </div>
    );
  } else if (preset.type === SECTION_TYPES.EXPERIENCE) {
    body = (
      <div className={classes.recordPreview}>
        <div className={classes.recordRow}>
          <PreviewLine strong>{p.experience_title}</PreviewLine>
          <PreviewLine muted align="right">{p.experience_period}</PreviewLine>
        </div>
        <div className={classes.recordRow}>
          <PreviewLine>{p.experience_company}</PreviewLine>
          <PreviewLine muted align="right">{p.experience_city}</PreviewLine>
        </div>
        <PreviewLine>• {p.experience_bullet}</PreviewLine>
      </div>
    );
  } else if (preset.type === SECTION_TYPES.EDUCATION) {
    body = (
      <div className={classes.recordPreview}>
        <div className={classes.recordRow}>
          <PreviewLine strong>{p.education_degree}</PreviewLine>
          <PreviewLine muted align="right">{p.education_period}</PreviewLine>
        </div>
        <div className={classes.recordRow}>
          <PreviewLine>{p.education_school}</PreviewLine>
          <PreviewLine muted align="right">{p.education_city}</PreviewLine>
        </div>
        <PreviewLine>{p.education_description}</PreviewLine>
      </div>
    );
  } else if (preset.type === SECTION_TYPES.LANGUAGES) {
    body = (
      <div className={classes.languageGrid}>
        {[0, 1].map((index) => (
          <div className={classes.languageEntry} key={index}>
            <PreviewLine strong>{p.language_name}</PreviewLine>
            <PreviewLine muted>{p.language_level}</PreviewLine>
          </div>
        ))}
      </div>
    );
  } else if (preset.type === SECTION_TYPES.SKILLS) {
    body = (
      <div className={classes.skillsRow}>
        {[0, 1, 2].map((index) => (
          <span className={classes.skillItem} key={index}>{p.skill}</span>
        ))}
      </div>
    );
  } else {
    body = (
      <div className={classes.categoryPreview}>
        <PreviewLine strong>Kategoria umiejętności</PreviewLine>
        <div className={classes.skillsRow}>
          {[0, 1].map((index) => (
            <span className={classes.skillItem} key={index}>{p.skill}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={classes.preview} aria-hidden="true">
      <span className={classes.previewHeading}>{preset.title}</span>
      <PreviewRule />
      {body}
    </div>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   onCancel: () => void,
 *   onConfirm: (payload: { name: string, layout: string, sectionType: string, iconName: string|null }) => void,
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
  const [sectionType, setSectionType] = useState(SECTION_TYPES.SUMMARY);
  const [iconName, setIconName] = useState(null);
  const [wasOpen, setWasOpen] = useState(open);

  const hasIcons = Array.isArray(iconOptions) && iconOptions.length > 0;
  const availableNames = hasIcons ? iconOptions.map((option) => option.name) : [];
  const selectedPreset = getSectionPreset(sectionType);

  // Reset the picker on every closed-to-open transition. State-based previous
  // value tracking remains compatible with the React Compiler lint contract.
  if (open && !wasOpen) {
    const defaultPreset = SECTION_PRESETS[0];
    setSectionType(defaultPreset.type);
    setIconName(
      hasIcons
        ? (suggestSectionIconName(defaultPreset.title, availableNames) || iconOptions[0].name)
        : null,
    );
  }
  if (wasOpen !== open) setWasOpen(open);

  function selectSection(nextType) {
    const previousPreset = getSectionPreset(sectionType);
    const nextPreset = getSectionPreset(nextType);
    setSectionType(nextType);
    if (!hasIcons) return;
    const previousSuggestion = suggestSectionIconName(previousPreset.title, availableNames);
    const nextSuggestion = suggestSectionIconName(nextPreset.title, availableNames);
    if (
      nextSuggestion
      && (iconName == null || iconName === previousSuggestion || iconName === "other")
    ) {
      setIconName(nextSuggestion);
    }
  }

  function handleConfirm() {
    onConfirm({
      name: selectedPreset.title,
      layout: selectedPreset.layout,
      sectionType: selectedPreset.type,
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
      width={1060}
      title="Dodaj sekcję"
      initialFocusSelector='input[name="section-type"]:checked'
      restoreFocusSelector='button[aria-label="Dostosuj CV"]'
      subtitle={insertAfterHeading
        ? "Wybierz strukturę. Sekcja pojawi się bezpośrednio pod wskazanym miejscem."
        : "Wybierz strukturę. Sekcja pojawi się na końcu CV w stylu obecnego szablonu."}
      bodyClassName={classes.body}
      footer={(
        <>
          <span className={classes.footerHint}>
            Wybrano: <strong>{selectedPreset.title}</strong>
          </span>
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
      <fieldset className={classes.fieldset}>
        <legend className={classes.legend}>Rodzaj i struktura sekcji</legend>
        <div className={classes.presetGrid}>
          {SECTION_PRESETS.map((preset) => {
            const active = sectionType === preset.type;
            return (
              <label
                key={preset.type}
                className={`${classes.presetCard}${active ? ` ${classes.presetCardActive}` : ""}`}
              >
                <input
                  className={classes.radioInput}
                  type="radio"
                  name="section-type"
                  value={preset.type}
                  checked={active}
                  onChange={() => selectSection(preset.type)}
                />
                <SectionStructurePreview preset={preset} />
                <span className={classes.cardCopy}>
                  <span className={classes.cardTitleRow}>
                    <span className={classes.cardTitle}>{preset.title}</span>
                    <span className={classes.selectionMark} aria-hidden="true">{active ? "✓" : ""}</span>
                  </span>
                  <span className={classes.cardDescription}>{preset.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {hasIcons ? (
        <section className={classes.iconSection} aria-labelledby="section-icon-title">
          <div className={classes.iconHeadingRow}>
            <div>
              <h3 id="section-icon-title" className={classes.iconTitle}>Ikona nagłówka</h3>
              <p className={classes.iconHint}>Dopasuj znak używany obok tytułów w tym szablonie.</p>
            </div>
            <p className={classes.selectedIconLabel}>Wybrana: <strong>{selectedIconLabel}</strong></p>
          </div>
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
        </section>
      ) : null}
    </DialogShell>
  );
}
