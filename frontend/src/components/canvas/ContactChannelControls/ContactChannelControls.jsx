/**
 * Inline hover controls for one contact band (Phase 1 contact channel manager).
 *
 * Hovering a contact chip (its label element) reveals a trash button that
 * removes that channel — icon and label together — and also reveals the `+`
 * at the band end, which opens a menu of the channels not currently shown;
 * picking one inserts it with its icon. Both actions reflow the band and the
 * document downstream via the `removeContactChannel` / `addContactChannel`
 * context operations. The `+` stays visible while the pointer is on it or its
 * menu (same as the trash cluster), and hides `HIDE_AFTER_LEAVE_MS` after the
 * pointer leaves the band entirely.
 *
 * Mirrors `SectionRecordAdd`'s canvas-affordance conventions (bare icon buttons
 * inside the shared `.cluster` surface chip, zoom-aware sizing) and only adds
 * the add-channel dropdown. Only bands whose anchor carries a descriptor reach
 * this component (see `listContactBands`), so it always has data to act on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { useHoverPlusExclusive } from "../../../hooks/useHoverPlusExclusive";
import { recordPlusLayoutSize } from "../recordPlusSize";
import { CHANNEL_NAMES } from "../../../utils/contactChannelNames";
import { getTextContentBounds } from "../../../utils/elementBounds";
import cluster from "../SectionRecordAdd/SectionRecordAdd.module.css";
import classes from "./ContactChannelControls.module.css";

const HIDE_AFTER_LEAVE_MS = 600;

export default function ContactChannelControls({ bandId, chips, inactive }) {
  const { removeContactChannel, addContactChannel, zoom = 1 } = useCanvasContext();
  const [hoverChannel, setHoverChannel] = useState(null);
  const [hoverBounds, setHoverBounds] = useState(null);
  // Whether the pointer is anywhere in the band (any chip, or the +/menu
  // cluster itself) — gates the `+` affordance so it is not permanently
  // visible whenever inactive channels exist. Kept separate from
  // `hoverChannel` because the `+` has no single channel of its own.
  const [bandHover, setBandHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hideTimerRef = useRef(null);
  const exclusiveKey = `contact-band:${bandId}`;
  const { isExclusiveActive, claimExclusive, releaseExclusive } = useHoverPlusExclusive(
    exclusiveKey,
  );

  const clearHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimerRef.current = window.setTimeout(() => {
      setHoverChannel(null);
      setHoverBounds(null);
      setBandHover(false);
      setMenuOpen(false);
      releaseExclusive();
    }, HIDE_AFTER_LEAVE_MS);
  }, [clearHide, releaseExclusive]);

  // Attach hover listeners to each chip's label node so the trash appears over
  // the chip the pointer is on, and the `+` becomes visible while any chip in
  // the band is hovered. Chips are addressed by element id, the same way
  // SectionRecordAdd binds to a heading node.
  useEffect(() => {
    const cleanups = [];
    for (const chip of chips) {
      const node = document.getElementById(chip.elementId);
      if (!node) continue;
      // Contacts share the single canvas-toolbar slot with structural actions.
      // Claiming it before painting the delete control prevents a nearby record
      // toolbar from covering the requested below-contact placement.
      const onEnter = () => {
        clearHide();
        claimExclusive();
        setHoverBounds({
          channel: chip.channel,
          ...getTextContentBounds({
            ...chip,
            element_id: chip.elementId,
            category: "text",
          }),
        });
        setHoverChannel(chip.channel);
        setBandHover(true);
      };
      const onLeave = () => scheduleHide();
      node.addEventListener("pointerenter", onEnter);
      node.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        node.removeEventListener("pointerenter", onEnter);
        node.removeEventListener("pointerleave", onLeave);
      });
    }
    return () => {
      clearHide();
      cleanups.forEach((fn) => fn());
    };
  }, [chips, claimExclusive, clearHide, scheduleHide]);

  useEffect(() => () => clearHide(), [clearHide]);

  const { buttonSize, iconSize, gap, offset } = recordPlusLayoutSize(
    zoom,
    chips[0]?.fontSize ?? 8,
  );
  const buttonStyle = { width: buttonSize, height: buttonSize };
  const iconStyle = { width: iconSize, height: iconSize };
  const hoveredChip = chips.find((chip) => chip.channel === hoverChannel) || null;
  const hoveredVisualBounds = hoverBounds?.channel === hoverChannel
    ? hoverBounds
    : hoveredChip;
  // The `+` sits just past the last chip in reading order (usually the
  // right-most on its line). Its authored width can be zero or stale, so a
  // small fixed offset keeps the add action clear of the visible label.
  const lastChip = chips[chips.length - 1] || null;

  return (
    <>
      {hoveredChip && isExclusiveActive ? (
        <div
          className={cluster.anchor}
          data-editor-control="true"
          style={{
            left: hoveredVisualBounds.left,
            top: hoveredVisualBounds.top
              + Math.max(hoveredVisualBounds.height, hoveredChip.fontSize)
              + offset,
          }}
        >
          <div
            className={cluster.cluster}
            style={{ gap }}
            onPointerEnter={() => {
              clearHide();
              claimExclusive();
              setHoverChannel(hoveredChip.channel);
            }}
            onPointerLeave={scheduleHide}
          >
            <button
              type="button"
              className={cluster.trash}
              style={buttonStyle}
              aria-label={`Usuń kontakt: ${CHANNEL_NAMES[hoveredChip.channel] || hoveredChip.channel}`}
              data-tooltip="Usuń kontakt"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                removeContactChannel(bandId, hoveredChip.channel);
                setHoverChannel(null);
                setHoverBounds(null);
                releaseExclusive();
              }}
            >
              <FiTrash2 style={iconStyle} />
            </button>
          </div>
        </div>
      ) : null}

      {lastChip && inactive.length > 0 && bandHover && isExclusiveActive ? (
        <div
          className={cluster.anchor}
          data-editor-control="true"
          style={{ left: lastChip.left + 44, top: lastChip.top - 1 }}
        >
          <div
            className={cluster.cluster}
            style={{ gap }}
            onPointerEnter={() => { clearHide(); claimExclusive(); setBandHover(true); }}
            onPointerLeave={scheduleHide}
          >
            <button
              type="button"
              className={cluster.plus}
              style={buttonStyle}
              aria-label="Dodaj kontakt"
              data-tooltip={menuOpen ? undefined : "Dodaj kontakt"}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                setMenuOpen((open) => !open);
              }}
            >
              <FiPlus style={iconStyle} />
            </button>
            {menuOpen ? (
              <div className={classes.menu} role="menu">
                {inactive.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    role="menuitem"
                    className={classes.menuItem}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      addContactChannel(bandId, channel);
                      setMenuOpen(false);
                    }}
                  >
                    {CHANNEL_NAMES[channel] || channel}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
