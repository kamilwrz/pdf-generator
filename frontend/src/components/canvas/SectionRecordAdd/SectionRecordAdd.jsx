/**
 * Hover affordance on a template-mode section heading: a "+" that opens the
 * "Dodaj sekcję" modal. The new section is inserted immediately below the
 * section that owns this heading (`afterHeadingId`).
 *
 * Timing: appear on pointer enter over the heading; stay while the pointer is
 * on the plus; only leaving the heading or the plus starts a 3s hide timer.
 * Shares an exclusive visible slot with in-record plus controls. Size follows
 * canvas zoom so 100% view stays compact.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { useHoverPlusExclusive } from "../../../hooks/useHoverPlusExclusive";
import { recordPlusLayoutSize } from "../recordPlusSize";
import classes from "./SectionRecordAdd.module.css";

/** Hide delay after the pointer leaves the heading or the plus. */
const HIDE_AFTER_LEAVE_MS = 3000;

/**
 * @param {{ headingId: string, left: number, top: number, fontSize?: number }} props
 */
export default function SectionRecordAdd({ headingId, left, top, fontSize = 10 }) {
  const {
    editorMode,
    openAddSectionModal,
    zoom = 1,
  } = use(PdfContext);

  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);
  const exclusiveKey = `heading:${headingId}`;
  const { isExclusiveActive, claimExclusive, releaseExclusive } = useHoverPlusExclusive(
    exclusiveKey,
  );

  const eligible = editorMode === EDITOR_MODE_TEMPLATE;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearHideTimer();
    setVisible(false);
    releaseExclusive();
  }, [clearHideTimer, releaseExclusive]);

  const show = useCallback(() => {
    if (!eligible) return;
    clearHideTimer();
    claimExclusive();
    setVisible(true);
  }, [claimExclusive, clearHideTimer, eligible]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
      releaseExclusive();
    }, HIDE_AFTER_LEAVE_MS);
  }, [clearHideTimer, releaseExclusive]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    if (!eligible) hide();
  }, [eligible, hide]);

  useEffect(() => {
    if (!isExclusiveActive && visible) {
      clearHideTimer();
      setVisible(false);
    }
  }, [clearHideTimer, isExclusiveActive, visible]);

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

  const { buttonSize, iconSize, gap, radius } = recordPlusLayoutSize(zoom, fontSize);
  const headingHeight = Number(fontSize) || 10;
  const style = {
    left: left - gap - buttonSize,
    top: top + headingHeight / 2 - buttonSize / 2,
  };
  const buttonStyle = {
    width: buttonSize,
    height: buttonSize,
    borderRadius: radius,
  };
  const iconStyle = {
    width: iconSize,
    height: iconSize,
  };

  return (
    <div className={classes.anchor} style={style}>
      {visible && isExclusiveActive ? (
        <button
          type="button"
          className={classes.plus}
          style={buttonStyle}
          aria-label="Dodaj sekcję pod tą sekcją"
          title="Dodaj sekcję"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onPointerEnter={() => {
            show();
          }}
          onPointerLeave={() => {
            scheduleHide();
          }}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            openAddSectionModal?.(headingId);
            hide();
          }}
        >
          <FiPlus style={iconStyle} />
        </button>
      ) : null}
    </div>
  );
}
