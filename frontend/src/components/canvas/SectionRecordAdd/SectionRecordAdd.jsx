/**
 * Hover affordance on a template-mode section heading: left cluster = trash +
 * "+" ; right cluster = reorder arrows at the same vertical height.
 * "+" opens the "Dodaj sekcję" modal (insert under this heading). Trash deletes
 * the whole section. Arrows swap section display order. On two-column CVs a
 * left-right transfer arrow appears on the destination side of the heading
 * (main → sidebar on the left, sidebar → main on the right) and moves the
 * section last into that lane under the live spacing rhythm. A main-column
 * Skills heading (`skillsMode` non-null) also gets a layout icon in the
 * right cluster that opens `SkillsLayoutModal` (inline mid-dot row / bullet
 * list / chip pills).
 *
 * Timing: appear on pointer enter over the heading; stay while the pointer is
 * on either cluster; only leaving the heading or a cluster starts a 3s hide
 * timer. Shares an exclusive visible slot with in-record plus controls. Size
 * follows canvas zoom so 100% view stays compact.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiChevronDown, FiChevronUp, FiPlus, FiTrash2 } from "react-icons/fi";
import { LuArrowLeftRight, LuLayoutGrid } from "react-icons/lu";
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
 *   laneTransfer?: "to-sidebar"|"to-main"|null,
 *   skillsMode?: "inline"|"bullet"|"chips"|null,
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
  laneTransfer = null,
  skillsMode = null,
}) {
  const {
    editorMode,
    openAddSectionModal,
    openSkillsLayoutModal,
    removeSection,
    reorderSection,
    transferSectionLane,
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

  // Main → sidebar: transfer sits furthest left (toward the rail). Sidebar →
  // main: transfer sits furthest right (toward the main column). Vertical
  // center matches trash / + / reorder icons.
  const transferToSidebar = laneTransfer === "to-sidebar";
  const transferToMain = laneTransfer === "to-main";
  const leftButtonCount = 2 + (transferToSidebar ? 1 : 0);
  const leftClusterWidth = buttonSize * leftButtonCount + gap * (leftButtonCount - 1);
  const leftStyle = {
    left: left - gap - leftClusterWidth,
    top: top + headingHeight / 2 - buttonSize / 2,
  };
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
  const showSkillsLayout = Boolean(skillsMode);
  const showRightCluster = showReorder || transferToMain || showSkillsLayout;

  const skillsModeLabel = {
    inline: "w linii",
    bullet: "listy",
    chips: "chipsów",
  }[skillsMode] || "";

  const clusterPointerProps = {
    onPointerEnter: () => {
      show();
    },
    onPointerLeave: () => {
      scheduleHide();
    },
  };

  const transferButton = (ariaLabel, title) => (
    <button
      type="button"
      className={classes.arrow}
      style={buttonStyle}
      aria-label={ariaLabel}
      title={title}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        transferSectionLane?.(headingId);
        hide();
      }}
    >
      <LuArrowLeftRight style={iconStyle} />
    </button>
  );

  return (
    <>
      <div className={classes.anchor} style={leftStyle}>
        {showControls ? (
          <div className={classes.cluster} style={clusterStyle} {...clusterPointerProps}>
            {transferToSidebar
              ? transferButton(
                "Przenieś sekcję do sidebara",
                "Do sidebara",
              )
              : null}
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

      {showRightCluster ? (
        <div className={classes.anchor} style={rightStyle}>
          {showControls ? (
            <div className={classes.cluster} style={clusterStyle} {...clusterPointerProps}>
              {showReorder ? (
                <>
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
                </>
              ) : null}
              {transferToMain
                ? transferButton(
                  "Przenieś sekcję do kolumny głównej",
                  "Do kolumny głównej",
                )
                : null}
              {showSkillsLayout ? (
                <button
                  type="button"
                  className={classes.arrow}
                  style={buttonStyle}
                  aria-label="Zmień styl umiejętności"
                  title={`Styl umiejętności: ${skillsModeLabel}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    openSkillsLayoutModal?.(headingId);
                    hide();
                  }}
                >
                  <LuLayoutGrid style={iconStyle} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
