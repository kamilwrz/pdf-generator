/**
 * Modal for choosing a flat-list section's layout: an inline row with items
 * separated by a mid-dot, or a vertical bullet list. Each card previews the
 * section's own real content re-formatted in that style — not a generic
 * example — so the user sees exactly what their CV will look like. Clicking
 * a card applies it immediately (`onApply`) and the caller closes the modal.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import {
  FLAT_SECTION_LAYOUT_BULLET,
  FLAT_SECTION_LAYOUT_INLINE,
  convertFlatListContent,
  flatSectionLayoutStyle,
} from "../../../utils/flatSectionLayout";
import classes from "./FlatSectionLayoutModal.module.css";

const STYLE_OPTIONS = [
  {
    value: FLAT_SECTION_LAYOUT_INLINE,
    title: "W linii",
    description: "Elementy oddzielone kropką w jednym wierszu.",
  },
  {
    value: FLAT_SECTION_LAYOUT_BULLET,
    title: "Lista",
    description: "Każdy element w osobnej linii, z punktorem.",
  },
];

/**
 * @param {{
 *   open: boolean,
 *   onCancel: () => void,
 *   element: object|null,
 *   onApply: (style: string) => void,
 * }} props
 */
export default function FlatSectionLayoutModal({ open, onCancel, element, onApply }) {
  if (!open || !element) return null;

  const currentStyle = flatSectionLayoutStyle(element);

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={620}
      title="Układ listy"
      subtitle="Wybierz, jak elementy tej sekcji mają się wyświetlać na CV."
    >
      <div className={classes.options}>
        {STYLE_OPTIONS.map((option) => {
          const preview = convertFlatListContent(element.content, element.bulletList, option.value);
          const active = currentStyle === option.value;
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
              <span className={classes.cardPreview}>{preview.content}</span>
            </button>
          );
        })}
      </div>
    </DialogShell>
  );
}
