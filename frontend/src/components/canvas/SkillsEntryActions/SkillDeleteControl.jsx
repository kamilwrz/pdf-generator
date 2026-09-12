import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiTrash2 } from "react-icons/fi";
import { useScopedAi } from "../../../store/scoped-ai-context";
import { measureSkillTargets, skillDeletePosition } from "../../../utils/skillsItemTarget";
import { readCanvasZoom } from "../../../utils/readCanvasZoom";
import { compactInlineToolbarScreenLayoutSize } from "../recordPlusSize";
import classes from "./SkillsEntryActions.module.css";

/**
 * Paint one delete action directly over the active skill's glyph/chip fragment.
 * Live DOM measurement follows scrolling, edit zoom and reflow without adding
 * wrappers to authored text. Sharing the entry toolbar's key and pointer
 * lifecycle keeps the target selected while crossing onto this body portal.
 * All coordinates and controls remain transient application state.
 */
export default function SkillDeleteControl({
  visible, itemTargets, activeIndex, fragmentIndex, toolbarKey, pointerProps,
  disabled, onDelete,
}) {
  useTranslation();
  const scopedAi = useScopedAi();
  const shown = visible && !scopedAi?.isOpen;
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!shown) return undefined;
    let frame;
    const measure = () => {
      const target = measureSkillTargets(itemTargets)[activeIndex];
      const zoom = readCanvasZoom(document.getElementById(itemTargets[activeIndex]?.elementId));
      const layout = compactInlineToolbarScreenLayoutSize(zoom);
      const coordinates = skillDeletePosition(target?.rects || [], fragmentIndex, {
        width: window.innerWidth, height: window.innerHeight,
      }, layout.buttonSize);
      const next = coordinates && { ...coordinates,
        "--canvas-control-size": `${layout.buttonSize}px`,
        "--canvas-control-icon": `${layout.iconSize}px`,
        "--canvas-control-gap": `${layout.gap}px`,
        "--canvas-control-font": `${layout.fontSize}px`,
      };
      setPosition((previous) => JSON.stringify(previous) === JSON.stringify(next)
        ? previous : next);
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [shown, itemTargets, activeIndex, fragmentIndex]);

  const label = itemTargets[activeIndex]?.label;
  if (!shown || !position || !label) return null;
  return createPortal(
    <div className={classes.deleteAnchor} style={position}
      data-editor-control="true" data-canvas-toolbar-key={toolbarKey}
      data-skill-delete="true" role="toolbar" aria-label={uiText("editor:skillDeleteControl.deleteSkill", { value0: (label) })}
      {...pointerProps}>
      <button type="button" className={classes.deleteButton}
        aria-label={uiText("editor:skillDeleteControl.deleteSkill", { value0: (label) })} data-tooltip={uiText("editor:skillDeleteControl.deleteSkill2")}
        data-tooltip-align={position.left < 160 ? "start" : "end"}
        disabled={disabled}
        onPointerDown={(event) => {
          // Retain the edited skill/caret until the atomic deletion commits.
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }}><FiTrash2 aria-hidden="true" /></button>
    </div>, document.body,
  );
}
