/**
 * Hover affordance on the upper part of a template-mode record (title / meta):
 * a "+" that inserts a full placeholder record below that block.
 *
 * Timing: appear on pointer enter over an upper line; stay while the pointer
 * is on the plus; only leaving the trigger or the plus starts a 3s hide timer.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { elementSupportsRecordBlockAdd } from "../../../utils/sectionRecord";
import classes from "../SectionRecordAdd/SectionRecordAdd.module.css";

/** Hide delay after the pointer leaves the trigger or the plus. */
const HIDE_AFTER_LEAVE_MS = 3000;

/**
 * @param {{
 *   elementId: string,
 *   left: number,
 *   top: number,
 *   height?: number,
 *   fontSize?: number,
 * }} props
 */
export default function RecordBlockAdd({
  elementId,
  left,
  top,
  height,
  fontSize = 10,
}) {
  const {
    A4_Elements,
    pageSize,
    editorMode,
    addRecordBlock,
  } = use(PdfContext);

  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);

  const pageHeight = pageSize?.height ?? 842;
  const eligible = editorMode === EDITOR_MODE_TEMPLATE
    && elementSupportsRecordBlockAdd(A4_Elements, elementId, pageHeight);

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

  // Bind hover to the painted canvas node (`Text` / `Textarea` set id={elementId}).
  useEffect(() => {
    if (!eligible) return undefined;
    const node = document.getElementById(elementId);
    if (!node) return undefined;

    const onEnter = () => {
      show();
    };
    const onLeave = () => {
      scheduleHide();
    };

    node.addEventListener("pointerenter", onEnter);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointerenter", onEnter);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [eligible, elementId, scheduleHide, show]);

  if (!eligible) return null;

  const buttonSize = 22;
  const boxHeight = Number.isFinite(Number(height)) && Number(height) > 0
    ? Number(height)
    : (Number(fontSize) || 10);
  const style = {
    left: left - 5 - buttonSize,
    top: top + boxHeight / 2 - buttonSize / 2,
  };

  return (
    <div className={classes.anchor} style={style}>
      {visible ? (
        <button
          type="button"
          className={classes.plus}
          aria-label="Dodaj rekord pod tym wpisem"
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
            addRecordBlock?.(elementId);
            hide();
          }}
        >
          <FiPlus />
        </button>
      ) : null}
    </div>
  );
}
