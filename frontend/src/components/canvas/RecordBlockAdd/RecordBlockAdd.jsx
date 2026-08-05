/**
 * Hover affordance on a template-mode record line: a "+" that inserts a
 * single generic text block (`Tekst…`) immediately below that record.
 *
 * Timing matches `SectionRecordAdd`: visible on pointer enter, stays clickable
 * for 2 seconds after leave, then hides unless the user clicks.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { elementSupportsRecordBlockAdd } from "../../../utils/sectionRecord";
import classes from "../SectionRecordAdd/SectionRecordAdd.module.css";

/** Click window after hover, in milliseconds. */
const CLICK_WINDOW_MS = 2000;

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

  const showWithDeadline = useCallback(() => {
    if (!eligible) return;
    setVisible(true);
    clearHideTimer();
    // Stay visible after leave so the user can move to the plus and click.
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, CLICK_WINDOW_MS);
  }, [clearHideTimer, eligible]);

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
      showWithDeadline();
    };

    node.addEventListener("pointerenter", onEnter);
    return () => {
      node.removeEventListener("pointerenter", onEnter);
    };
  }, [eligible, elementId, showWithDeadline]);

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
          aria-label="Dodaj blok tekstu pod tym wpisem"
          title="Dodaj blok tekstu"
          onPointerDown={(event) => {
            event.stopPropagation();
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
