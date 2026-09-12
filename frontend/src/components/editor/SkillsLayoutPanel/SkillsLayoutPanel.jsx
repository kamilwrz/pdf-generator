import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Non-modal Skills appearance panel with nine directly applicable choices.
 *
 * The panel deliberately combines the two text layouts and seven persisted
 * chip treatments into one native radio group. A change is committed
 * immediately, so the control value always describes the document currently
 * visible on the canvas rather than a separate preview draft.
 */
import { useEffect, useRef } from "react";
import { FiCheck } from "react-icons/fi";
import PanelShell from "../../common/PanelShell/PanelShell";
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
import classes from "./SkillsLayoutPanel.module.css";

const PREVIEW_SKILLS = ["Excel", "SQL"];

const STYLE_OPTIONS = [
  {
    value: FLAT_SECTION_LAYOUT_INLINE,
    mode: FLAT_SECTION_LAYOUT_INLINE,
    get label() { return uiText("editor:flatSectionLayoutModal.inline"); },
    get title() { return uiText("editor:flatSectionLayoutModal.inline"); },
    get description() { return uiText("editor:skillsLayoutPanel.inlineDescription"); },
    preview: "inline",
  },
  {
    value: FLAT_SECTION_LAYOUT_BULLET,
    mode: FLAT_SECTION_LAYOUT_BULLET,
    get label() { return uiText("editor:flatSectionLayoutModal.list"); },
    get title() { return uiText("editor:flatSectionLayoutModal.list"); },
    get description() { return uiText("editor:skillsLayoutPanel.listDescription"); },
    preview: "bullet",
  },
  {
    value: SKILL_CHIP_VARIANT_PILL_FILLED,
    mode: SKILLS_LAYOUT_CHIPS,
    get label() { return uiText("editor:skillsLayoutPanel.filledPill"); },
    get title() { return uiText("editor:skillsLayoutPanel.oval"); },
    get description() { return uiText("editor:skillsLayoutPanel.withFill"); },
  },
  {
    value: SKILL_CHIP_VARIANT_PILL_OUTLINE,
    mode: SKILLS_LAYOUT_CHIPS,
    get label() { return uiText("editor:skillsLayoutPanel.outlinedPill"); },
    get title() { return uiText("editor:skillsLayoutPanel.oval"); },
    get description() { return uiText("editor:skillsLayoutPanel.withOutline"); },
  },
  {
    value: SKILL_CHIP_VARIANT_RECT_FILLED,
    mode: SKILLS_LAYOUT_CHIPS,
    get label() { return uiText("editor:skillsLayoutPanel.filledRectangle"); },
    get title() { return uiText("editor:skillsLayoutPanel.rectangular"); },
    get description() { return uiText("editor:skillsLayoutPanel.withFill"); },
  },
  {
    value: SKILL_CHIP_VARIANT_RECT_OUTLINE,
    mode: SKILLS_LAYOUT_CHIPS,
    get label() { return uiText("editor:skillsLayoutPanel.outlinedRectangle"); },
    get title() { return uiText("editor:skillsLayoutPanel.rectangular"); },
    get description() { return uiText("editor:skillsLayoutPanel.withOutline"); },
  },
  {
    value: SKILL_CHIP_VARIANT_ROUNDED_OUTLINE,
    mode: SKILLS_LAYOUT_CHIPS,
    get label() { return uiText("editor:skillsLayoutPanel.roundedOutline"); },
    get title() { return uiText("editor:skillsLayoutPanel.rounded"); },
    get description() { return uiText("editor:skillsLayoutPanel.withOutline"); },
  },
  {
    value: SKILL_CHIP_VARIANT_ROUNDED_FILLED,
    mode: SKILLS_LAYOUT_CHIPS,
    get label() { return uiText("editor:skillsLayoutPanel.roundedFill"); },
    get title() { return uiText("editor:skillsLayoutPanel.rounded"); },
    get description() { return uiText("editor:skillsLayoutPanel.withFill"); },
  },
  {
    value: SKILL_CHIP_VARIANT_UNDERLINE,
    mode: SKILLS_LAYOUT_CHIPS,
    get label() { return uiText("editor:skillsLayoutPanel.underline"); },
    get title() { return uiText("editor:skillsLayoutPanel.underline"); },
    get description() { return uiText("editor:skillsLayoutPanel.underlineDescription"); },
  },
];

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

/** Shows a stable sample so long CV content cannot resize the panel. */
function StylePreview({ option }) {
  if (option.preview === "inline") {
    return <span className={classes.inlinePreview}>{PREVIEW_SKILLS.join(" · ")}</span>;
  }
  if (option.preview === "bullet") {
    return (
      <span className={classes.listPreview}>
        {PREVIEW_SKILLS.map((skill) => <span key={skill}>• {skill}</span>)}
      </span>
    );
  }
  return <span className={chipClasses(option.value)}>Excel</span>;
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   elements: object[],
 *   headingId: string|null,
 *   pageHeight?: number,
 *   onChange: (mode: "inline"|"bullet"|"chips", chipVariant?: string) => void,
 * }} props
 */
export default function SkillsLayoutPanel({
  open, onClose, elements, headingId, pageHeight = 842, onChange,
}) {
  useTranslation();
  const selectedInputRef = useRef(null);
  const memberIds = open && headingId
    ? sectionElementIds(elements || [], headingId, pageHeight)
    : new Set();
  const members = (elements || []).filter((element) => memberIds.has(element.element_id));
  const currentMode = members.length > 0
    ? detectSkillsDisplayMode(members)
    : FLAT_SECTION_LAYOUT_INLINE;
  const currentValue = currentMode === SKILLS_LAYOUT_CHIPS
    ? detectSkillChipVariant(members)
    : currentMode;

  useEffect(() => {
    if (!open) return undefined;
    // This is a non-modal panel, but keyboard activation should still land on
    // its current choice. Escape/Close restores the stable section heading.
    const frame = window.requestAnimationFrame(() => {
      selectedInputRef.current?.focus({ preventScroll: true });
      // Reopening a lower-row style must reveal it in the scrollable body,
      // including compact/zoomed viewports with a persistent panel header.
      selectedInputRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [headingId, open]);

  if (!open || !headingId || members.length === 0) return null;

  const handleClose = () => {
    onClose();
    window.requestAnimationFrame(() => {
      document.getElementById(headingId)?.focus({ preventScroll: true });
    });
  };

  return (
    <PanelShell
      open={open}
      onClose={handleClose}
      appearance="comfortable"
      className={classes.panel}
      motionProps={{
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.2, ease: [0.2, 0, 0, 1] },
      }}
      title={uiText("editor:sectionsPanel.skillsStyle")}
      subtitle={uiText("editor:skillsLayoutPanel.optionsChangesApplyImmediately")}
      footer={(
        <p className={classes.note} role="status" aria-live="polite" aria-atomic="true">
          <FiCheck aria-hidden="true" />
          <span>{uiText("editor:skillsLayoutPanel.activeStyle")} <strong>{STYLE_OPTIONS.find((option) => option.value === currentValue)?.label}</strong></span>
        </p>
      )}
    >
      <fieldset className={classes.fieldset}>
        <legend className={classes.legend}>{uiText("editor:skillsLayoutPanel.chooseADisplayStyle")}</legend>
        <div className={classes.options}>
          {STYLE_OPTIONS.map((option) => {
            const selected = currentValue === option.value;
            return (
              <label className={classes.option} key={option.value}>
                <input
                  ref={selected ? selectedInputRef : null}
                  className={classes.radio}
                  type="radio"
                  name="skills-layout-style"
                  value={option.value}
                  aria-label={option.label}
                  checked={selected}
                  onChange={() => onChange(
                    option.mode,
                    option.mode === SKILLS_LAYOUT_CHIPS ? option.value : undefined,
                  )}
                />
                <span className={classes.optionSurface}>
                  <span className={classes.selectionIndicator} aria-hidden="true">{selected && <FiCheck />}</span>
                  <span className={classes.preview} aria-hidden="true"><StylePreview option={option} /></span>
                  <span className={classes.optionFooter}>
                    <span className={classes.optionLabel}>{option.title}</span>
                    <span className={classes.optionDescription}>{option.description}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </PanelShell>
  );
}
