/**
 * Hover affordance on a template-mode section heading: a "+" that adds another
 * record (education / experience structure) with generic placeholder copy.
 *
 * Timing: appear on pointer enter over the heading; stay while the pointer is
 * on the plus; only leaving the heading or the plus starts a 3s hide timer.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { sectionSupportsRecordAdd } from "../../../utils/sectionRecord";
import classes from "./SectionRecordAdd.module.css";

/** Hide delay after the pointer leaves the heading or the plus. */
const HIDE_AFTER_LEAVE_MS = 3000;

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

  const show = useCallback(() => {
    if (!eligible) return;
    clearHideTimer();
    setVisible(true);
  }, [clearHideTimer, eligible]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, HIDE_AFTER_LEAVE_MS);
  }, [clearHideTimer]);

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
      show();
    };
    const onLeave = () => {
      scheduleHide();
    };

    headingNode.addEventListener("pointerenter", onEnter);
    headingNode.addEventListener("pointerleave", onLeave);
    return () => {
      headingNode.removeEventListener("pointerenter", onEnter);
      headingNode.removeEventListener("pointerleave", onLeave);
    };
  }, [eligible, headingId, scheduleHide, show]);

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
          onPointerEnter={() => {
            // Keep the control alive while the pointer is on the plus itself.
            show();
          }}
          onPointerLeave={() => {
            scheduleHide();
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
