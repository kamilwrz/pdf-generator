/**
 * Modal for choosing a Skills section layout and, for chip mode, one of seven
 * persisted chip treatments. Selecting a treatment only updates the local
 * preview; clicking the main Chips card applies it to the document. This
 * two-step interaction prevents an exploratory style click from immediately
 * rewriting the CV.
 */
import { useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import {
  FLAT_SECTION_LAYOUT_BULLET,
  FLAT_SECTION_LAYOUT_INLINE,
} from "../../../utils/flatSectionLayout";
import {
  SKILL_CHIP_VARIANT_PILL_FILLED,
  SKILL_CHIP_VARIANT_PILL_OUTLINE,
  SKILL_CHIP_VARIANT_RECT_FILLED,
  SKILL_CHIP_VARIANT_RECT_OUTLINE,
  SKILL_CHIP_VARIANT_ROUNDED_FILLED,
  SKILL_CHIP_VARIANT_ROUNDED_OUTLINE,
  SKILL_CHIP_VARIANT_UNDERLINE,
  SKILLS_LAYOUT_CHIPS,
  detectSkillChipVariant,
  detectSkillsDisplayMode,
} from "../../../utils/skillsLayout";
import { sectionElementIds } from "../../../utils/sectionStructure";
import classes from "./SkillsLayoutModal.module.css";

const STYLE_OPTIONS = [
  {
    value: FLAT_SECTION_LAYOUT_INLINE,
    title: "W linii",
    description: "Umiejętności oddzielone kropką w jednym wierszu.",
  },
  {
    value: FLAT_SECTION_LAYOUT_BULLET,
    title: "Lista",
    description: "Każda umiejętność w osobnej linii, z punktorem.",
  },
  {
    value: SKILLS_LAYOUT_CHIPS,
    title: "Chipsy",
    description: "Wybierz wariant poniżej, a potem kliknij ten podgląd, aby go zastosować.",
  },
];

const CHIP_VARIANT_OPTIONS = [
  { value: SKILL_CHIP_VARIANT_PILL_FILLED, label: "Pigułka z wypełnieniem" },
  { value: SKILL_CHIP_VARIANT_PILL_OUTLINE, label: "Pigułka bez wypełnienia" },
  { value: SKILL_CHIP_VARIANT_RECT_FILLED, label: "Prostokąt z wypełnieniem" },
  { value: SKILL_CHIP_VARIANT_RECT_OUTLINE, label: "Prostokąt bez wypełnienia" },
  { value: SKILL_CHIP_VARIANT_ROUNDED_OUTLINE, label: "Zaokrąglony bez wypełnienia" },
  { value: SKILL_CHIP_VARIANT_ROUNDED_FILLED, label: "Zaokrąglony z wypełnieniem" },
  { value: SKILL_CHIP_VARIANT_UNDERLINE, label: "Kreska na dole" },
];

const PREVIEW_SKILLS = ["React", "TypeScript", "Node.js", "SQL"];

function chipClasses(variant) {
  return [
    classes.chip,
    variant.includes("pill") ? classes.chipPill : "",
    variant.includes("rounded") ? classes.chipRounded : "",
    variant.includes("filled") ? classes.chipFilled : "",
    variant.includes("outline") ? classes.chipOutline : "",
    variant === SKILL_CHIP_VARIANT_UNDERLINE ? classes.chipUnderline : "",
  ].filter(Boolean).join(" ");
}

/** Renders a compact, content-independent example for a text layout option. */
function TextPreview({ mode }) {
  const example = mode === FLAT_SECTION_LAYOUT_BULLET
    ? PREVIEW_SKILLS.map((item) => `• ${item}`).join("\n")
    : PREVIEW_SKILLS.join("  ·  ");

  return <span className={classes.cardPreview}>{example}</span>;
}

/** The main chip preview updates immediately while the user explores variants. */
function ChipPreview({ variant, compact = false }) {
  const items = compact ? ["React"] : PREVIEW_SKILLS;
  return (
    <span className={`${classes.cardPreview} ${classes.chipPreview}${compact ? ` ${classes.chipPreviewCompact}` : ""}`}>
      <span className={classes.chipRow}>
        {items.map((item) => (
          <span key={item} className={chipClasses(variant)}>{item}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   onCancel: () => void,
 *   elements: object[],
 *   headingId: string|null,
 *   pageHeight?: number,
 *   onApply: (mode: "inline"|"bullet"|"chips", chipVariant?: string) => void,
 * }} props
 */
export default function SkillsLayoutModal({
  open, onCancel, elements, headingId, pageHeight = 842, onApply,
}) {
  const [chipSelection, setChipSelection] = useState(null);
  const memberIds = open && headingId
    ? sectionElementIds(elements || [], headingId, pageHeight)
    : new Set();
  const members = (elements || []).filter((element) => memberIds.has(element.element_id));
  const currentMode = members.length > 0
    ? detectSkillsDisplayMode(members)
    : FLAT_SECTION_LAYOUT_INLINE;
  const currentChipVariant = detectSkillChipVariant(members);
  // A draft selection belongs to the exact heading + persisted base variant
  // it was opened for. If undo, reload, or another action changes the document
  // while the modal is closed, the stale draft is ignored on the next open.
  const selectedChipVariant = chipSelection?.headingId === headingId
    && chipSelection.baseVariant === currentChipVariant
    ? chipSelection.variant
    : currentChipVariant;

  if (!open || !headingId || members.length === 0) return null;

  const selectedVariantLabel = CHIP_VARIANT_OPTIONS.find(
    (option) => option.value === selectedChipVariant,
  )?.label;

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={1080}
      title="Styl umiejętności"
      subtitle="Wybierz układ. Dla chipsów najpierw ustaw wariant, potem zastosuj podgląd."
    >
      <div className={classes.content}>
        <div className={classes.layoutOptions}>
          {STYLE_OPTIONS.map((option) => {
            const isChipOption = option.value === SKILLS_LAYOUT_CHIPS;
            const active = currentMode === option.value
              && (!isChipOption || currentChipVariant === selectedChipVariant);
            return (
              <button
                key={option.value}
                type="button"
                className={`${classes.card}${active ? ` ${classes.cardActive}` : ""}`}
                aria-pressed={active}
                onClick={() => onApply(
                  option.value,
                  isChipOption ? selectedChipVariant : undefined,
                )}
              >
                <span className={classes.cardHeader}>
                  <span className={classes.cardTitle}>{option.title}</span>
                  {active ? <span className={classes.cardBadge}>Obecny</span> : null}
                </span>
                <span className={classes.cardDesc}>
                  {isChipOption ? `${option.description} Wybrano: ${selectedVariantLabel}.` : option.description}
                </span>
                {isChipOption
                  ? <ChipPreview variant={selectedChipVariant} />
                  : <TextPreview mode={option.value} />}
              </button>
            );
          })}
        </div>

        <section className={classes.variantPanel} aria-labelledby="skill-chip-variant-title">
          <div className={classes.variantHeading}>
            <div>
              <h3 id="skill-chip-variant-title">Wariant chipsów</h3>
              <p>Wybór zmienia podgląd powyżej. Zastosowanie następuje dopiero po kliknięciu karty „Chipsy”.</p>
            </div>
            <span className={classes.variantCount}>7 wariantów</span>
          </div>
          <div className={classes.variantOptions} role="group" aria-label="Wariant chipsów">
            {CHIP_VARIANT_OPTIONS.map((option) => {
              const selected = selectedChipVariant === option.value;
              const current = currentMode === SKILLS_LAYOUT_CHIPS
                && currentChipVariant === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`${classes.variantOption}${selected ? ` ${classes.variantOptionSelected}` : ""}`}
                  aria-pressed={selected}
                  onClick={() => setChipSelection({
                    headingId,
                    baseVariant: currentChipVariant,
                    variant: option.value,
                  })}
                >
                  <ChipPreview variant={option.value} compact />
                  <span className={classes.variantLabel}>{option.label}</span>
                  {current
                    ? <span className={classes.variantState}>Obecny</span>
                    : selected
                      ? <span className={classes.variantState}>Wybrany</span>
                      : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </DialogShell>
  );
}
