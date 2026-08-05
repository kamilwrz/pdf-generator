/**
 * Hover affordance on a template-mode section heading: a "+" that adds another
 * record (education / experience structure) with generic placeholder copy.
 *
 * Timing: the control appears when the pointer enters the heading and stays
 * clickable for 2 seconds even after the pointer leaves the heading. Without a
 * click it hides when that window ends. Leaving the heading does not cancel
 * the window — only the timer or a successful click does.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { sectionSupportsRecordAdd } from "../../../utils/sectionRecord";
import classes from "./SectionRecordAdd.module.css";

/** Click window after hover, in milliseconds. */
const CLICK_WINDOW_MS = 2000;

/**
 * @param {{ headingId: string, left: number, top: number, fontSize?: number }} props
 */
export default function SectionRecordAdd({ headingId, left, top, fontSize = 10 }) {
  const {
    A4_Elements,
    pageSize,
    editorMode,
    addSectionRecord,
  } = use(PdfContext);

  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);

  const pageHeight = pageSize?.height ?? 842;
  const eligible = editorMode === EDITOR_MODE_TEMPLATE
    && sectionSupportsRecordAdd(A4_Elements, headingId, pageHeight);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearHideTimer();
    setVisible(false);
  }, [clearHideTimer]);

  const showWithDeadline = useCallback(() => {
    if (!eligible) return;
    setVisible(true);
    clearHideTimer();
    // Stay visible for this window after hover so the user can leave the
    // heading and still click the plus. Pointer leave must not hide it.
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, CLICK_WINDOW_MS);
  }, [clearHideTimer, eligible]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    if (!eligible) hide();
  }, [eligible, hide]);

  // Bind hover to the heading DOM node (`Text` sets id={elementId}) so the
  // affordance does not intercept selection / edit on the label itself.
  useEffect(() => {
    if (!eligible) return undefined;
    const headingNode = document.getElementById(headingId);
    if (!headingNode) return undefined;

    const onEnter = () => {
      showWithDeadline();
    };

    headingNode.addEventListener("pointerenter", onEnter);
    return () => {
      headingNode.removeEventListener("pointerenter", onEnter);
    };
  }, [eligible, headingId, showWithDeadline]);

  if (!eligible) return null;

  // Sit 5px left of the heading's left edge, vertically centred on the label.
  // Text uses line-height: 1, so the painted height matches fontSize.
  const buttonSize = 22;
  const headingHeight = Number(fontSize) || 10;
  const style = {
    left: left - 5 - buttonSize,
    top: top + headingHeight / 2 - buttonSize / 2,
  };

  return (
    <div className={classes.anchor} style={style}>
      {visible ? (
        <button
          type="button"
          className={classes.plus}
          aria-label="Dodaj rekord w tej sekcji"
          title="Dodaj rekord"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            addSectionRecord?.(headingId);
            hide();
          }}
        >
          <FiPlus />
        </button>
      ) : null}
    </div>
  );
}
