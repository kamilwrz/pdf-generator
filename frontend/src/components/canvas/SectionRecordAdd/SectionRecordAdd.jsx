/**
 * Hover affordance on a template-mode section heading: left cluster = trash +
 * "+" ; right cluster = reorder arrows at the same vertical height.
 * "+" opens the "Dodaj sekcję" modal (insert under this heading). Trash deletes
 * the whole section. Arrows swap section display order. All three re-pack under
 * the active template rhythm.
 *
 * Timing: appear on pointer enter over the heading; stay while the pointer is
 * on either cluster; only leaving the heading or a cluster starts a 3s hide
 * timer. Shares an exclusive visible slot with in-record plus controls. Size
 * follows canvas zoom so 100% view stays compact.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiChevronDown, FiChevronUp, FiPlus, FiTrash2 } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { useHoverPlusExclusive } from "../../../hooks/useHoverPlusExclusive";
import { recordPlusLayoutSize } from "../recordPlusSize";
import classes from "./SectionRecordAdd.module.css";

/** Hide delay after the pointer leaves the heading or a control cluster. */
const HIDE_AFTER_LEAVE_MS = 3000;

/**
 * @param {{
 *   headingId: string,
 *   left: number,
 *   top: number,
 *   width?: number,
 *   fontSize?: number,
 *   canMoveUp?: boolean,
 *   canMoveDown?: boolean,
 * }} props
 */
export default function SectionRecordAdd({
  headingId,
  left,
  top,
  width = 0,
  fontSize = 10,
  canMoveUp = false,
  canMoveDown = false,
}) {
  const {
    editorMode,
    openAddSectionModal,
    removeSection,
    reorderSection,
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

  const { buttonSize, iconSize, gap } = recordPlusLayoutSize(zoom, fontSize);
  const headingHeight = Number(fontSize) || 10;
  // Prefer authored width; fall back to the live heading box so arrows sit past
  // the glyphs even when template text nodes omit an explicit width.
  const headingNode = typeof document !== "undefined"
    ? document.getElementById(headingId)
    : null;
  const headingWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Number(width)
    : (headingNode?.offsetWidth || 120);

  // Trash sits to the left of plus; cluster right edge stays `gap` from heading.
  const leftClusterWidth = buttonSize * 2 + gap;
  const leftStyle = {
    left: left - gap - leftClusterWidth,
    top: top + headingHeight / 2 - buttonSize / 2,
  };
  // Arrows sit to the right of the heading at the same vertical center.
  const rightStyle = {
    left: left + headingWidth + gap,
    top: top + headingHeight / 2 - buttonSize / 2,
  };
  const clusterStyle = {
    gap,
  };
  const buttonStyle = {
    width: buttonSize,
    height: buttonSize,
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
              aria-label="Usuń tę sekcję"
              title="Usuń sekcję"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                removeSection?.(headingId);
                hide();
              }}
            >
              <FiTrash2 style={iconStyle} />
            </button>
            <button
              type="button"
              className={classes.plus}
              style={buttonStyle}
              aria-label="Dodaj sekcję pod tą sekcją"
              title="Dodaj sekcję"
              onPointerDown={(event) => {
                event.stopPropagation();
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
                aria-label="Przenieś sekcję wyżej"
                title="Wyżej"
                disabled={!canMoveUp}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (!canMoveUp) return;
                  reorderSection?.(headingId, "up");
                  hide();
                }}
              >
                <FiChevronUp style={iconStyle} />
              </button>
              <button
                type="button"
                className={classes.arrow}
                style={buttonStyle}
                aria-label="Przenieś sekcję niżej"
                title="Niżej"
                disabled={!canMoveDown}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (!canMoveDown) return;
                  reorderSection?.(headingId, "down");
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
