/**
 * Modal for choosing a main-column Skills section's layout: an inline mid-dot
 * row, a vertical bullet list, or wrapped chip pills. Works for both flat
 * skills and skills grouped into subcategories — one mode applies to the
 * whole section. The previews deliberately use the same short example rather
 * than CV content, so unusually long skills never distort the picker.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import {
  FLAT_SECTION_LAYOUT_BULLET,
  FLAT_SECTION_LAYOUT_INLINE,
} from "../../../utils/flatSectionLayout";
import {
  SKILLS_LAYOUT_CHIPS,
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
    description: "Każda umiejętność jako kolorowa plakietka.",
  },
];

const PREVIEW_SKILLS = ["React", "TypeScript", "Node.js", "SQL"];

/** Renders a compact, content-independent example for a text layout option. */
function TextPreview({ mode }) {
  const example = mode === FLAT_SECTION_LAYOUT_BULLET
    ? PREVIEW_SKILLS.map((item) => `• ${item}`).join("\n")
    : PREVIEW_SKILLS.join("  ·  ");

  return (
    <span className={classes.cardPreview}>{example}</span>
  );
}

/** Renders the same fixed example as pills so all three choices stay comparable. */
function ChipPreview() {
  return (
    <span className={classes.cardPreview}>
      <span className={classes.chipRow}>
        {PREVIEW_SKILLS.map((item) => (
          <span key={item} className={classes.chipPill}>{item}</span>
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
 *   onApply: (mode: "inline"|"bullet"|"chips") => void,
 * }} props
 */
export default function SkillsLayoutModal({
  open, onCancel, elements, headingId, pageHeight = 842, onApply,
}) {
  if (!open || !headingId) return null;

  const memberIds = sectionElementIds(elements || [], headingId, pageHeight);
  const members = (elements || []).filter((element) => memberIds.has(element.element_id));
  if (members.length === 0) return null;

  const currentMode = detectSkillsDisplayMode(members);

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={960}
      title="Styl umiejętności"
      subtitle="Wybierz, jak umiejętności mają się wyświetlać na CV."
    >
      <div className={classes.options}>
        {STYLE_OPTIONS.map((option) => {
          const active = currentMode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`${classes.card}${active ? ` ${classes.cardActive}` : ""}`}
              aria-pressed={active}
              onClick={() => onApply(option.value)}
            >
              <span className={classes.cardHeader}>
                <span className={classes.cardTitle}>{option.title}</span>
                {active ? <span className={classes.cardBadge}>Obecny</span> : null}
              </span>
              <span className={classes.cardDesc}>{option.description}</span>
              {option.value === SKILLS_LAYOUT_CHIPS
                ? <ChipPreview />
                : <TextPreview mode={option.value} />}
            </button>
          );
        })}
      </div>
    </DialogShell>
  );
}
