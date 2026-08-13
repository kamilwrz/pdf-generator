/**
 * Modal for choosing a main-column Skills section's layout: an inline mid-dot
 * row, a vertical bullet list, or wrapped chip pills. Works for both flat
 * skills and skills grouped into subcategories — one mode applies to the
 * whole section. Each card previews the section's own real skills
 * re-formatted in that style, not a generic example.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import {
  FLAT_SECTION_LAYOUT_BULLET,
  FLAT_SECTION_LAYOUT_INLINE,
} from "../../../utils/flatSectionLayout";
import {
  SKILLS_LAYOUT_CHIPS,
  collectSkillGroups,
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

/** One category's items formatted for the inline/bullet text preview. */
function textPreviewGroup(group, mode) {
  const items = (group.items || []).filter(Boolean);
  if (items.length === 0) return group.category || "";
  const body = mode === FLAT_SECTION_LAYOUT_BULLET
    ? items.map((item) => `• ${item}`).join("\n")
    : items.join("  ·  ");
  return group.category ? `${group.category}\n${body}` : body;
}

function TextPreview({ groups, mode }) {
  return (
    <span className={classes.cardPreview}>
      {groups.map((group) => textPreviewGroup(group, mode)).join("\n\n")}
    </span>
  );
}

function ChipPreview({ groups }) {
  return (
    <span className={classes.cardPreview}>
      {groups.map((group) => (
        <span key={group.category || group.items.join("|")} className={classes.chipGroup}>
          {group.category ? <span className={classes.chipCategory}>{group.category}</span> : null}
          <span className={classes.chipRow}>
            {(group.items || []).filter(Boolean).map((item) => (
              <span key={item} className={classes.chipPill}>{item}</span>
            ))}
          </span>
        </span>
      ))}
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

  const groups = collectSkillGroups(members, headingId).filter((group) => (
    group.category || (group.items || []).length > 0
  ));
  if (groups.length === 0) return null;
  const currentMode = detectSkillsDisplayMode(members);

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={640}
      radius={2}
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
              onClick={() => onApply(option.value)}
            >
              <span className={classes.cardHeader}>
                <span className={classes.cardTitle}>{option.title}</span>
                {active ? <span className={classes.cardBadge}>Obecny</span> : null}
              </span>
              <span className={classes.cardDesc}>{option.description}</span>
              {option.value === SKILLS_LAYOUT_CHIPS
                ? <ChipPreview groups={groups} />
                : <TextPreview groups={groups} mode={option.value} />}
            </button>
          );
        })}
      </div>
    </DialogShell>
  );
}
