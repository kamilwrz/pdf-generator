/**
 * Hover affordance on a template-mode section heading: a "+" that adds another
 * record (education / experience structure) with generic placeholder copy.
 *
 * Timing: the control appears when the pointer enters the heading and stays
 * clickable for 2 seconds. Without a click it hides (even if still hovering).
 * Leaving toward the plus keeps it visible for the remainder of that window.
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
  const plusRef = useRef(null);

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
    // The plus waits this long for a click after hover, then disappears.
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

    const onLeave = (event) => {
      const next = event.relatedTarget;
      if (next && plusRef.current?.contains(next)) {
        // Pointer moved onto the plus — keep the click window running.
        return;
      }
      hide();
    };

    headingNode.addEventListener("pointerenter", onEnter);
    headingNode.addEventListener("pointerleave", onLeave);
    return () => {
      headingNode.removeEventListener("pointerenter", onEnter);
      headingNode.removeEventListener("pointerleave", onLeave);
    };
  }, [eligible, headingId, hide, showWithDeadline]);

  if (!eligible) return null;

  const buttonSize = 22;
  const style = {
    left: left + Math.max(56, (fontSize || 10) * 9),
    top: top + (fontSize || 10) / 2 - buttonSize / 2,
  };

  return (
    <div className={classes.anchor} style={style}>
      {visible ? (
        <button
          ref={plusRef}
          type="button"
          className={classes.plus}
          aria-label="Dodaj rekord w tej sekcji"
          title="Dodaj rekord"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onPointerLeave={(event) => {
            const next = event.relatedTarget;
            const headingNode = document.getElementById(headingId);
            if (next && headingNode?.contains(next)) return;
            hide();
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
