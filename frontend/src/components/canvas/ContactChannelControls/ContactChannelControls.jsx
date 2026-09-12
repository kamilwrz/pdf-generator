import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
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
import { compactInlineToolbarLayoutSize } from "../recordPlusSize";
import { useA4Zoom } from "../../../store/a4-zoom-context";
import { CHANNEL_NAMES } from "../../../utils/contactChannelNames";
import { getElementOutlineBounds } from "../../../utils/elementBounds";
import cluster from "../SectionRecordAdd/SectionRecordAdd.module.css";
import classes from "./ContactChannelControls.module.css";

const HIDE_AFTER_LEAVE_MS = 600;

export default function ContactChannelControls({ bandId, chips, inactive }) {
  useTranslation();
  const { removeContactChannel, addContactChannel, zoom: targetZoom = 1 } = useCanvasContext();
  const zoom = useA4Zoom(targetZoom);
  const [hoverChannel, setHoverChannel] = useState(null);
  const [hoverBounds, setHoverBounds] = useState(null);
  // Whether the pointer is anywhere in the band (any chip, or the +/menu
  // cluster itself) — gates the `+` affordance so it is not permanently
  // visible whenever inactive channels exist. Kept separate from
  // `hoverChannel` because the `+` has no single channel of its own.
  const [bandHover, setBandHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hideTimerRef = useRef(null);
  const deleteButtonRef = useRef(null);
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
      // Leaving with the pointer must not unmount a keyboard-focused action.
      // Its blur handler restarts the normal hide lifecycle afterwards.
      if (document.activeElement === deleteButtonRef.current) return;
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
      // toolbar from covering the contact's own delete action.
      const onEnter = () => {
        clearHide();
        claimExclusive();
        setHoverBounds({
          channel: chip.channel,
          // Match the field's hover outline: wrapped contacts use the complete
          // textarea box, while single-line contacts use their visible glyphs.
          ...getElementOutlineBounds({
            ...chip,
            element_id: chip.elementId,
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

  const { buttonSize, iconSize, gap, borderWidth, offset } = compactInlineToolbarLayoutSize(zoom);
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
  const addPosition = lastChip ? { left: lastChip.left + 44, top: lastChip.top - 1 } : null;
  if (addPosition && hoveredVisualBounds) {
    // A short final contact can put the existing plus directly over the new
    // centred trash. Move only a colliding plus beyond the complete surface;
    // keeping the current channel while hovering controls makes this stable.
    const surfaceSize = buttonSize + 2 * (gap + borderWidth);
    const trashLeft = hoveredVisualBounds.left + (hoveredVisualBounds.width - surfaceSize) / 2;
    const trashTop = hoveredVisualBounds.top + (hoveredVisualBounds.height - surfaceSize) / 2;
    if (addPosition.left < trashLeft + surfaceSize && addPosition.left + surfaceSize > trashLeft
      && addPosition.top < trashTop + surfaceSize && addPosition.top + surfaceSize > trashTop) {
      addPosition.left = trashLeft + surfaceSize + offset;
    }
  }

  return (
    <>
      {hoveredChip && isExclusiveActive ? (
        <div
          className={cluster.anchor}
          data-editor-control="true"
          style={{
            left: hoveredVisualBounds.left + hoveredVisualBounds.width / 2,
            top: hoveredVisualBounds.top + hoveredVisualBounds.height / 2,
          }}
        >
          <div
            className={cluster.cluster}
            // Translate the whole surface, including its shared border and
            // padding, so the button stays centred at every canvas zoom.
            style={{ gap, transform: "translate(-50%, -50%)" }}
            onPointerEnter={() => {
              clearHide();
              claimExclusive();
              setHoverChannel(hoveredChip.channel);
            }}
            onPointerLeave={scheduleHide}
          >
            <button
              ref={deleteButtonRef}
              type="button"
              className={cluster.trash}
              style={buttonStyle}
              aria-label={uiText("editor:contactChannelControls.deleteContact", { value0: (CHANNEL_NAMES[hoveredChip.channel] || hoveredChip.channel) })}
              data-tooltip={uiText("editor:contactChannelControls.deleteContact2")}
              onFocus={clearHide}
              onBlur={scheduleHide}
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
          style={addPosition}
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
              aria-label={uiText("editor:contactChannelControls.addContact")}
              data-tooltip={menuOpen ? undefined : uiText("editor:contactChannelControls.addContact")}
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
