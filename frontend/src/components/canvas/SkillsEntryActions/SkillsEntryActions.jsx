/**
 * Contextual add control for one main-column Skills category.
 *
 * The control is application chrome: it is portalled outside the transformed
 * A4 page, never enters document geometry, and therefore cannot be exported.
 * A category-free section uses the same component with an empty label.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { FiCheck, FiPlus, FiX } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { useCanvasHoverToolbar } from "../../../hooks/useCanvasHoverToolbar";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { structuralToolbarLayoutSize } from "../recordPlusSize";
import CanvasHoverToolbar from "../CanvasHoverToolbar/CanvasHoverToolbar";
import classes from "./SkillsEntryActions.module.css";

const SKILL_ACTION_OFFSET_SCREEN_PX = 18;

/**
 * @param {{
 *   headingId:string,
 *   groupId:string,
 *   categoryLabel?:string,
 *   triggerIds:string[],
 *   left:number,
 *   width:number,
 *   bottom:number,
 * }} props
 */
export default function SkillsEntryActions({
  headingId,
  groupId,
  categoryLabel = "",
  triggerIds,
  left,
  width,
  bottom,
}) {
  const {
    A4_Elements,
    addSkillItem,
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
  } = useCanvasHoverToolbar({
    exclusiveKey,
    eligible,
    triggerIds,
    triggerRevision,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const focusToolbarButton = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector(
        `[data-canvas-toolbar-key="${exclusiveKey}"] button`,
      )?.focus({ preventScroll: true });
    });
  }, [exclusiveKey]);

  const closeForm = useCallback(({ restoreFocus = true } = {}) => {
    setFormOpen(false);
    setValue("");
    setError("");
    unpin();
    if (restoreFocus) focusToolbarButton();
  }, [focusToolbarButton, unpin]);

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
        ? "Ta umiejętność już znajduje się w tej kategorii."
        : "Wpisz nazwę umiejętności.");
      return;
    }
    const added = value.trim().replace(/\s+/g, " ");
    setAnnouncement(`Dodano umiejętność: ${added}.`);
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
  }, [eligible, focusToolbarButton, show, triggerIds, triggerRevision]);

  if (!eligible) return null;

  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  const layout = structuralToolbarLayoutSize(safeZoom);
  const toolbarTop = Number(bottom) + SKILL_ACTION_OFFSET_SCREEN_PX / safeZoom;
  const toolbarAnchorX = Number(left) + Number(width) / 2;
  const addLabel = categoryLabel
    ? `Dodaj umiejętność do kategorii ${categoryLabel}`
    : "Dodaj umiejętność";

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
      <label className={classes.label} htmlFor={fieldId}>Nowa umiejętność</label>
      <div className={classes.row}>
        <input
          id={fieldId}
          className={classes.input}
          type="text"
          value={value}
          placeholder="Np. React"
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
          aria-label="Dodaj umiejętność"
          data-tooltip="Dodaj"
          disabled={!value.trim()}
        >
          <FiCheck aria-hidden="true" />
        </button>
        <button
          className={classes.cancel}
          type="button"
          aria-label="Anuluj dodawanie umiejętności"
          data-tooltip="Anuluj"
          onClick={() => closeForm()}
        >
          <FiX aria-hidden="true" />
        </button>
      </div>
      {error ? <p id={errorId} className={classes.error} role="alert">{error}</p> : null}
    </form>
  );

  return (
    <>
      <CanvasHoverToolbar
        toolbarKey={exclusiveKey}
        visible={visible}
        placement="below"
        anchorX={toolbarAnchorX}
        top={toolbarTop}
        pageWidth={pageSize?.width ?? 595}
        layout={layout}
        directActions={formOpen ? [] : [{
          key: "add-skill",
          label: addLabel,
          icon: <FiPlus aria-hidden="true" />,
          onSelect: openForm,
        }]}
        panelContent={formOpen ? form : null}
        collisionAware
        toolbarPointerProps={toolbarPointerProps}
      />
      <span className={classes.srOnly} aria-live="polite">{announcement}</span>
    </>
  );
}
