import { useMessageState, messageRef } from '../../../i18n/messageState.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Contextual add and individual-delete controls for one Skills category.
 *
 * The control is application chrome: it is portalled outside the transformed
 * A4 page, never enters document geometry, and therefore cannot be exported.
 * A category-free section uses the same component with an empty label.
 * AI belongs to the section or category record toolbar, never this add control.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { useCanvasDeletionUndo } from "../../../hooks/useCanvasDeletionUndo";
import { measureSkillTargets } from "../../../utils/skillsItemTarget";
import { useCanvasContext } from "../../../store/canvas-context";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { resolveSkillsEntryToolbarTop } from "../../../utils/skillsEntryToolbarGeometry";
import { compactInlineToolbarLayoutSize } from "../recordPlusSize";
import CanvasHoverToolbar from "../CanvasHoverToolbar/CanvasHoverToolbar";
import SkillDeleteControl from "./SkillDeleteControl";
import classes from "./SkillsEntryActions.module.css";

/**
 * @param {{
 *   headingId:string,
 *   groupId:string,
 *   itemTargets?:Array<{elementId:string,shapeId?:string,label:string}>,
 *   categoryLabel?:string,
 *   triggerIds:string[],
 *   left:number,
 *   width:number,
 *   bottom:number,
 *   highlight?:{left:number,top:number,width:number,height:number}|null,
 * }} props
 */
export default function SkillsEntryActions({
  headingId,
  groupId,
  itemTargets = [],
  categoryLabel = "",
  triggerIds,
  left,
  width,
  bottom,
  highlight = null,
}) {
  useTranslation();
  const {
    A4_Elements,
    addSkillItem,
    removeSkillItem,
    editorMode,
    pageSize,
    zoom = 1,
  } = useCanvasContext();
  const eligible = editorMode === EDITOR_MODE_TEMPLATE
    && typeof addSkillItem === "function";
  const exclusiveKey = `skills-entry:${headingId}:${groupId}`;
  const triggerRevision = triggerIds.map((elementId) => {
    const element = A4_Elements.find((candidate) => candidate.element_id === elementId);
    return `${elementId}:${Boolean(element?.isSelected)}:${Boolean(element?.isEditing)}`;
  }).join("|");
  const {
    visible,
    toolbarPointerProps,
    show,
    pin,
    unpin,
    hide,
  } = useCanvasHoverToolbar({
    exclusiveKey,
    eligible,
    triggerIds,
    triggerRevision,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useMessageState("");
  const [announcement, setAnnouncement] = useState("");
  const [activeTarget, setActiveTarget] = useState(null);
  const activeIndex = activeTarget?.index;
  const setActiveIndex = (index) => setActiveTarget(index == null ? null : { index, fragmentIndex: 0 });
  const deleteWithUndo = useCanvasDeletionUndo();
  const activeItem = itemTargets[activeIndex];
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const focusToolbarButton = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector(
        `[data-canvas-toolbar-key="${exclusiveKey}"]:not([data-skill-delete]) button`,
      )?.focus({ preventScroll: true });
    });
  }, [exclusiveKey]);

  const closeForm = useCallback(({ restoreFocus = true } = {}) => {
    setFormOpen(false);
    setValue("");
    setError("");
    unpin();
    if (restoreFocus) focusToolbarButton();
  }, [focusToolbarButton, unpin, setError]);

  const openForm = () => {
    setError("");
    setAnnouncement("");
    setFormOpen(true);
    pin();
    window.requestAnimationFrame(() => {
      document.getElementById(fieldId)?.focus({ preventScroll: true });
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const result = addSkillItem(headingId, groupId, value);
    if (!result?.ok) {
      setError(result?.error === "duplicate"
        ? messageRef("editor:skillsEntryActions.thisSkillIsAlreadyInThisCategory")
        : messageRef("editor:skillsEntryActions.enterASkillName"));
      return;
    }
    const added = value.trim().replace(/\s+/g, " ");
    setAnnouncement(uiText("editor:skillsEntryActions.skillAdded", { value0: (added) }));
    closeForm();
  };

  useEffect(() => {
    if (!formOpen || visible) return undefined;
    // Exclusivity can hide this toolbar when another canvas control is
    // reached with the keyboard. Defer the local reset until after the hook's
    // visibility commit so this effect does not create a cascading render.
    const frame = window.requestAnimationFrame(() => {
      setFormOpen(false);
      setValue("");
      setError("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [formOpen, visible]);

  // Hit-test real glyph fragments rather than dividing the textarea equally:
  // names can have different lengths, wrap, or carry independent text runs.
  // Freeze the entered line fragment while crossing to its overlaid trash.
  // Blank separators do not clear the target during that short pointer path.
  useEffect(() => {
    if (!eligible || formOpen) return undefined;
    const nodes = triggerIds.map((id) => document.getElementById(id)).filter(Boolean);
    const point = (event) => {
      const hit = measureSkillTargets(itemTargets).map(({ index, rects }) => ({
        index,
        fragmentIndex: rects.findIndex((rect) => (
          event.clientX >= rect.left && event.clientX <= rect.right
          && event.clientY >= rect.top && event.clientY <= rect.bottom
        )),
      })).find((target) => target.fragmentIndex >= 0);
      if (hit) setActiveTarget((previous) => previous?.index === hit.index ? previous : hit);
    };
    const focus = (event) => {
      const index = itemTargets.findIndex((item) => item.elementId === event.currentTarget.id);
      setActiveTarget(index < 0 ? null : { index, fragmentIndex: 0 });
    };
    nodes.forEach((node) => {
      node.addEventListener("pointermove", point);
      node.addEventListener("pointerenter", point);
      node.addEventListener("focusin", focus);
    });
    return () => nodes.forEach((node) => {
      node.removeEventListener("pointermove", point);
      node.removeEventListener("pointerenter", point);
      node.removeEventListener("focusin", focus);
    });
  }, [eligible, formOpen, itemTargets, triggerIds, triggerRevision]);

  // The portalled toolbar is not adjacent to authored canvas nodes in DOM
  // order. Shift+F10 reveals it and moves keyboard focus to the add action,
  // matching the direct-entry contract already used by Languages.
  useEffect(() => {
    if (!eligible) return undefined;
    const nodes = triggerIds.map((id) => document.getElementById(id)).filter(Boolean);
    const previousShortcuts = new Map(
      nodes.map((node) => [node, node.getAttribute("aria-keyshortcuts")]),
    );
    const focusActions = (event) => {
      const requestsActions = event.key === "ContextMenu"
        || (event.key === "F10" && event.shiftKey);
      if (!requestsActions) return;
      event.preventDefault();
      if (!activeItem && itemTargets.length) setActiveTarget({ index: 0, fragmentIndex: 0 });
      show();
      focusToolbarButton();
    };
    nodes.forEach((node) => {
      node.setAttribute("aria-keyshortcuts", "Shift+F10");
      node.addEventListener("keydown", focusActions);
    });
    return () => nodes.forEach((node) => {
      node.removeEventListener("keydown", focusActions);
      const previous = previousShortcuts.get(node);
      if (previous == null) node.removeAttribute("aria-keyshortcuts");
      else node.setAttribute("aria-keyshortcuts", previous);
    });
  }, [activeItem, eligible, focusToolbarButton, itemTargets.length, show, triggerIds, triggerRevision]);

  if (!eligible) return null;

  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  const layout = compactInlineToolbarLayoutSize(safeZoom);
  const toolbarTop = resolveSkillsEntryToolbarTop({
    bottom,
    formOpen,
    zoom: safeZoom,
    layout,
  });
  const toolbarAnchorX = Number(left) + Number(width) / 2;
  const addLabel = categoryLabel
    ? uiText("editor:skillsEntryActions.addASkillTo", { value0: (categoryLabel) })
    : uiText("editor:skillsEntryActions.addSkill");

  const deleteActiveItem = () => {
    if (!activeItem || typeof removeSkillItem !== "function") return;
    deleteWithUndo({
      title: uiText("editor:skillsEntryActions.deletedSkill", { value0: (activeItem.label) }),
      msg: uiText("editor:skillsEntryActions.youCanRestoreTheDeletedSkill"),
      remove: () => {
        const focusId = removeSkillItem(headingId, groupId, activeIndex, activeItem.label);
        window.requestAnimationFrame(() => document.getElementById(focusId || headingId)
          ?.focus({ preventScroll: true }));
      },
    });
    setActiveIndex(null);
    hide();
  };
  const directActions = [{
    key: "add-skill", label: addLabel, icon: <FiPlus aria-hidden="true" />, onSelect: openForm,
  }];
  const actionPointerProps = {
    ...toolbarPointerProps,
    onKeyDownCapture: (event) => {
      if (formOpen) return;
      const fromDelete = Boolean(event.target.closest("[data-skill-delete]"));
      // The plus and trash now occupy separate portals. Preserve their logical
      // Tab order explicitly instead of depending on body portal mount order.
      if (event.key === "Tab" && activeItem && !fromDelete && !event.shiftKey) {
        const trash = document.querySelector(`[data-canvas-toolbar-key="${exclusiveKey}"][data-skill-delete] button`);
        if (trash) { event.preventDefault(); trash.focus({ preventScroll: true }); }
      } else if (event.key === "Tab" && fromDelete && event.shiftKey) {
        event.preventDefault();
        focusToolbarButton();
      } else if (event.key === "Escape") {
        event.preventDefault();
        hide();
        document.getElementById(activeItem?.elementId || triggerIds[0])?.focus({ preventScroll: true });
      } else if (["ArrowLeft", "ArrowRight"].includes(event.key) && itemTargets.length) {
        event.preventDefault();
        // A shared textarea has one tab stop. Arrow keys on its toolbar expose
        // every skill to keyboard and touch-assistive users without editing it.
        const index = ((activeIndex ?? 0) + (event.key === "ArrowRight" ? 1 : -1)
          + itemTargets.length) % itemTargets.length;
        setActiveIndex(index);
        setAnnouncement(uiText("editor:skillsEntryActions.skill", { value0: (itemTargets[index].label) }));
      }
    },
    "aria-description": uiText("editor:skillsEntryActions.useTheLeftAndRightArrowsTo"),
  };

  const form = (
    <form
      className={classes.form}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeForm();
      }}
      noValidate
    >
      <div className={classes.header}>
        <label className={classes.label} htmlFor={fieldId}>{uiText("editor:skillsEntryActions.addSkill")}</label>
        <button
          className={classes.cancel}
          type="button"
          aria-label={uiText("editor:skillsEntryActions.cancelAddingASkill")}
          onClick={() => closeForm()}
        >
          <FiX aria-hidden="true" />
        </button>
      </div>
      {categoryLabel ? <p className={classes.context}>{uiText("editor:skillsEntryActions.category")} {categoryLabel}</p> : null}
      <div className={classes.row}>
        <input
          id={fieldId}
          className={classes.input}
          type="text"
          value={value}
          placeholder={uiText("editor:skillsEntryActions.eGDataAnalysis")}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError("");
          }}
        />
        <button
          className={classes.confirm}
          type="submit"
          aria-label={uiText("editor:skillsEntryActions.addSkill")}
          disabled={!value.trim()}
        >
          <FiPlus aria-hidden="true" />
          <span>{uiText("editor:skillsEntryActions.add")}</span>
        </button>
      </div>
      {error ? <p id={errorId} className={classes.error} role="alert">{error}</p> : null}
      <p className={classes.hint}><kbd>Enter</kbd> {uiText("editor:skillsEntryActions.add2")} <span aria-hidden="true">·</span> <kbd>Esc</kbd> {uiText("editor:skillsEntryActions.close")}</p>
    </form>
  );

  return (
    <>
      <CanvasHoverToolbar
        toolbarKey={exclusiveKey}
        visible={visible}
        placement="below"
        highlight={highlight}
        highlightLevel="skills"
        anchorX={toolbarAnchorX}
        top={toolbarTop}
        pageWidth={pageSize?.width ?? 595}
        layout={compactInlineToolbarLayoutSize()}
        directActions={formOpen ? [] : directActions}
        panelContent={formOpen ? form : null}
        collisionAware
        toolbarPointerProps={actionPointerProps}
      />
      <SkillDeleteControl
        visible={visible && !formOpen && Boolean(activeItem)}
        itemTargets={itemTargets}
        activeIndex={activeIndex}
        fragmentIndex={activeTarget?.fragmentIndex || 0}
        toolbarKey={exclusiveKey}
        pointerProps={actionPointerProps}
        disabled={typeof removeSkillItem !== "function"}
        onDelete={deleteActiveItem}
      />
      <span className={classes.srOnly} aria-live="polite">{announcement}</span>
    </>
  );
}
