/**
 * Hover affordance on the upper part of a template-mode record (title / meta):
 * left cluster = trash + "+" ; right cluster = reorder arrows at the same
 * vertical height. Insert / delete / reorder all re-pack under the template
 * rhythm.
 *
 * One instance is mounted per record (on the title). Hovering any upper line
 * shows both clusters. Only one canvas affordance is exclusive-visible at a
 * time. Size follows canvas zoom so 100% view stays compact.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiChevronDown, FiChevronUp, FiPlus, FiTrash2 } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { elementSupportsRecordBlockAdd } from "../../../utils/sectionRecord";
import { useHoverPlusExclusive } from "../../../hooks/useHoverPlusExclusive";
import { recordPlusLayoutSize } from "../recordPlusSize";
import classes from "../SectionRecordAdd/SectionRecordAdd.module.css";

/** Hide delay after the pointer leaves the trigger or either control cluster. */
const HIDE_AFTER_LEAVE_MS = 3000;

/**
 * @param {{
 *   elementId: string,
 *   hoverIds?: string[],
 *   left: number,
 *   top: number,
 *   height?: number,
 *   width?: number,
 *   fontSize?: number,
 *   canMoveUp?: boolean,
 *   canMoveDown?: boolean,
 * }} props
 */
export default function RecordBlockAdd({
  elementId,
  hoverIds,
  left,
  top,
  height,
  width = 0,
  fontSize = 10,
  canMoveUp = false,
  canMoveDown = false,
}) {
  const {
    A4_Elements,
    pageSize,
    editorMode,
    addRecordBlock,
    removeRecordBlock,
    reorderRecordBlock,
    zoom = 1,
  } = use(PdfContext);

  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);
  const exclusiveKey = `record:${elementId}`;
  const { isExclusiveActive, claimExclusive, releaseExclusive } = useHoverPlusExclusive(
    exclusiveKey,
  );

  const pageHeight = pageSize?.height ?? 842;
  const listenIds = (hoverIds?.length ? hoverIds : [elementId]);
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

  // Another affordance claimed the exclusive slot — drop immediately.
  useEffect(() => {
    if (!isExclusiveActive && visible) {
      clearHideTimer();
      setVisible(false);
    }
  }, [clearHideTimer, isExclusiveActive, visible]);

  useEffect(() => {
    if (!eligible) return undefined;
    const nodes = listenIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (nodes.length === 0) return undefined;

    const onEnter = () => {
      show();
    };
    const onLeave = () => {
      scheduleHide();
    };

    for (const node of nodes) {
      node.addEventListener("pointerenter", onEnter);
      node.addEventListener("pointerleave", onLeave);
    }
    return () => {
      for (const node of nodes) {
        node.removeEventListener("pointerenter", onEnter);
        node.removeEventListener("pointerleave", onLeave);
      }
    };
  }, [eligible, listenIds.join("|"), scheduleHide, show]);

  if (!eligible) return null;

  const { buttonSize, iconSize, gap, radius } = recordPlusLayoutSize(zoom, fontSize);
  const boxHeight = Number.isFinite(Number(height)) && Number(height) > 0
    ? Number(height)
    : (Number(fontSize) || 10);
  // Prefer authored width; fall back to the live title box so arrows sit past
  // the glyphs even when template text nodes omit an explicit width.
  const titleNode = typeof document !== "undefined"
    ? document.getElementById(elementId)
    : null;
  const titleWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : (titleNode?.offsetWidth || 120);

  // Trash sits to the left of plus; cluster right edge stays `gap` from title.
  const leftClusterWidth = buttonSize * 2 + gap;
  const leftStyle = {
    left: left - gap - leftClusterWidth,
    top: top + boxHeight / 2 - buttonSize / 2,
  };
  // Arrows sit to the right of the title line at the same vertical center.
  const rightStyle = {
    left: left + titleWidth + gap,
    top: top + boxHeight / 2 - buttonSize / 2,
  };
  const clusterStyle = {
    gap,
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
  const showControls = visible && isExclusiveActive;
  const showReorder = canMoveUp || canMoveDown;

  const clusterPointerProps = {
    onPointerEnter: () => {
      show();
    },
    onPointerLeave: () => {
      scheduleHide();
    },
  };

  return (
    <>
      <div className={classes.anchor} style={leftStyle}>
        {showControls ? (
          <div className={classes.cluster} style={clusterStyle} {...clusterPointerProps}>
            <button
              type="button"
              className={classes.trash}
              style={buttonStyle}
              aria-label="Usuń ten rekord"
              title="Usuń rekord"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                removeRecordBlock?.(elementId);
                hide();
              }}
            >
              <FiTrash2 style={iconStyle} />
            </button>
            <button
              type="button"
              className={classes.plus}
              style={buttonStyle}
              aria-label="Dodaj rekord pod tym wpisem"
              title="Dodaj rekord"
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
              <FiPlus style={iconStyle} />
            </button>
          </div>
        ) : null}
      </div>

      {showReorder ? (
        <div className={classes.anchor} style={rightStyle}>
          {showControls ? (
            <div className={classes.cluster} style={clusterStyle} {...clusterPointerProps}>
              <button
                type="button"
                className={classes.arrow}
                style={buttonStyle}
                aria-label="Przenieś rekord wyżej"
                title="Wyżej"
                disabled={!canMoveUp}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (!canMoveUp) return;
                  reorderRecordBlock?.(elementId, "up");
                  hide();
                }}
              >
                <FiChevronUp style={iconStyle} />
              </button>
              <button
                type="button"
                className={classes.arrow}
                style={buttonStyle}
                aria-label="Przenieś rekord niżej"
                title="Niżej"
                disabled={!canMoveDown}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (!canMoveDown) return;
                  reorderRecordBlock?.(elementId, "down");
                  hide();
                }}
              >
                <FiChevronDown style={iconStyle} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
