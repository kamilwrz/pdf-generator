/**
 * Hover affordance for the template profile-photo slot.
 *
 * Visible slots expose hide and, when occupied, remove-photo actions. A hidden
 * slot exposes a persistent restore action above the saved photo location.
 * Only the controls intercept pointers; the former slot remains available for
 * contact content in templates that reclaim it when the photo is hidden.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FiEye, FiEyeOff, FiImage, FiTrash2 } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { compactInlineToolbarLayoutSize } from "../recordPlusSize";
import cluster from "../SectionRecordAdd/SectionRecordAdd.module.css";
import classes from "./ProfilePhotoControls.module.css";

const HIDE_AFTER_LEAVE_MS = 600;

export default function ProfilePhotoControls({ anchor }) {
  const { hideProfilePhoto, showProfilePhoto, removeProfilePhoto, zoom = 1 } = useCanvasContext();
  const [hover, setHover] = useState(null);
  const hideTimerRef = useRef(null);
  const clearHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimerRef.current = window.setTimeout(() => setHover(null), HIDE_AFTER_LEAVE_MS);
  }, [clearHide]);

  useEffect(() => {
    const cleanups = [];
    const bind = (elementId, key) => {
      const node = document.getElementById(elementId);
      if (!node) return;
      const enter = () => { clearHide(); setHover(key); };
      node.addEventListener("pointerenter", enter);
      node.addEventListener("pointerleave", scheduleHide);
      node.addEventListener("focusin", enter);
      node.addEventListener("focusout", scheduleHide);
      cleanups.push(() => {
        node.removeEventListener("pointerenter", enter);
        node.removeEventListener("pointerleave", scheduleHide);
        node.removeEventListener("focusin", enter);
        node.removeEventListener("focusout", scheduleHide);
      });
    };
    if (!anchor.hidden) {
      anchor.slotElementIds.forEach((elementId) => bind(elementId, "slot"));
    }
    return () => { clearHide(); cleanups.forEach((cleanup) => cleanup()); };
  }, [anchor, clearHide, scheduleHide]);

  useEffect(() => () => clearHide(), [clearHide]);

  const { buttonSize, iconSize, gap, offset, borderWidth } = compactInlineToolbarLayoutSize(zoom);
  const buttonStyle = { width: buttonSize, height: buttonSize };
  const iconStyle = { width: iconSize, height: iconSize };
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };

  if (anchor.hidden) {
    // Keep the full surface on the page at low zoom. Above-slot placement also
    // clears contacts that move into the former photo area (Slate/Linden).
    const surfaceSize = buttonSize + 2 * (gap + borderWidth);
    return (
      <div
        className={`${cluster.anchor} ${classes.slotAnchor}`}
        data-editor-control="true"
        style={{
          left: anchor.box.left + anchor.box.width / 2,
          top: Math.max(surfaceSize + offset, anchor.box.top - offset),
        }}
      >
        <div className={cluster.cluster} style={{ gap, transform: "translate(-50%, -100%)" }}>
          <button
            type="button"
            className={classes.restore}
            style={buttonStyle}
            aria-label="Pokaż slot zdjęcia profilowego"
            data-tooltip="Pokaż zdjęcie profilowe"
            onPointerDown={stop}
            onClick={(event) => { stop(event); showProfilePhoto(); setHover(null); }}
          >
            <FiImage style={iconStyle} aria-hidden="true" />
            <FiEye className={classes.eyeBadge} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (hover !== "slot") return null;
  return (
    <div
      className={`${cluster.anchor} ${classes.slotAnchor}`}
      data-editor-control="true"
      style={{ left: anchor.box.left + anchor.box.width - buttonSize, top: anchor.box.top + gap }}
    >
      <div className={cluster.cluster} style={{ gap }} onPointerEnter={clearHide} onPointerLeave={scheduleHide}
           onFocus={clearHide} onBlur={scheduleHide}>
        {anchor.hasPhoto ? (
          <button
            type="button"
            className={cluster.trash}
            style={buttonStyle}
            aria-label="Usuń zdjęcie ze slotu"
            data-tooltip="Usuń zdjęcie"
            onPointerDown={stop}
            onClick={(event) => { stop(event); removeProfilePhoto(); setHover(null); }}
          >
            <FiTrash2 style={iconStyle} />
          </button>
        ) : null}
        <button
          type="button"
          className={classes.hide}
          style={buttonStyle}
          aria-label="Ukryj slot zdjęcia profilowego"
          data-tooltip="Ukryj zdjęcie profilowe"
          onPointerDown={stop}
          onClick={(event) => { stop(event); hideProfilePhoto(); setHover(null); }}
        >
          <FiEyeOff style={iconStyle} />
        </button>
      </div>
    </div>
  );
}
