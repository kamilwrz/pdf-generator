/**
 * Hover affordance on a flat-list section's content block (Skills, Languages,
 * flat custom sections): a single bare icon to the left of the block,
 * vertically centered on its height (same left-cluster placement convention
 * as `SectionRecordAdd` / `RecordBlockAdd`). Click opens
 * `FlatSectionLayoutModal` to switch between an inline mid-dot row and a
 * vertical bullet list.
 *
 * Structurally mirrors `SectionRecordAdd` / `RecordBlockAdd` (hover timing,
 * exclusive visible slot, zoom-aware sizing) but shows one button instead of
 * a two-cluster set — there is nothing to insert/delete/reorder here, only a
 * layout choice to open.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiList } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { useHoverPlusExclusive } from "../../../hooks/useHoverPlusExclusive";
import { recordPlusLayoutSize } from "../recordPlusSize";
import classes from "../SectionRecordAdd/SectionRecordAdd.module.css";

/** Hide delay after the pointer leaves the content block or the button. */
const HIDE_AFTER_LEAVE_MS = 3000;

/**
 * @param {{
 *   contentElementId: string,
 *   left: number,
 *   top: number,
 *   height?: number,
 *   fontSize?: number,
 * }} props
 */
export default function FlatSectionLayoutToggle({
  contentElementId,
  left,
  top,
  height = 0,
  fontSize = 10,
}) {
  const { editorMode, openFlatSectionLayoutModal, zoom = 1 } = use(PdfContext);

  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);
  const exclusiveKey = `flat-layout:${contentElementId}`;
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
    const node = document.getElementById(contentElementId);
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
  }, [eligible, contentElementId, scheduleHide, show]);

  if (!eligible) return null;

  const { buttonSize, iconSize, gap } = recordPlusLayoutSize(zoom, fontSize);
  // Prefer authored height; fall back to the live block box so centering
  // still works when a template omits an explicit height.
  const contentNode = typeof document !== "undefined"
    ? document.getElementById(contentElementId)
    : null;
  const blockHeight = Number.isFinite(Number(height)) && Number(height) > 0
    ? Number(height)
    : (contentNode?.offsetHeight || (Number(fontSize) || 10) * 1.35);

  // Sits to the left of the block, vertically centered on its full height.
  const anchorStyle = {
    left: left - gap - buttonSize,
    top: top + blockHeight / 2 - buttonSize / 2,
  };
  const buttonStyle = { width: buttonSize, height: buttonSize };
  const iconStyle = { width: iconSize, height: iconSize };
  const showControl = visible && isExclusiveActive;

  return (
    <div className={classes.anchor} style={anchorStyle}>
      {showControl ? (
        <button
          type="button"
          className={classes.plus}
          style={buttonStyle}
          aria-label="Zmień układ listy"
          title="Zmień układ listy"
          onPointerEnter={() => {
            show();
          }}
          onPointerLeave={() => {
            scheduleHide();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            openFlatSectionLayoutModal?.(contentElementId);
            hide();
          }}
        >
          <FiList style={iconStyle} />
        </button>
      ) : null}
    </div>
  );
}
