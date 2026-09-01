/**
 * Hover affordance for the template profile-photo slot.
 *
 * Visible slots expose hide and, when occupied, remove-photo actions. A hidden
 * slot exposes one restore action only while the user hovers the masthead name.
 * The controls bind to existing canvas element ids, so they add no pointer
 * surface outside the authored slot/name geometry.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FiEye, FiEyeOff, FiImage, FiTrash2 } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { recordPlusLayoutSize } from "../recordPlusSize";
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
      cleanups.push(() => {
        node.removeEventListener("pointerenter", enter);
        node.removeEventListener("pointerleave", scheduleHide);
      });
    };
    if (anchor.hidden) {
      if (anchor.name?.elementId) bind(anchor.name.elementId, "name");
    } else {
      anchor.slotElementIds.forEach((elementId) => bind(elementId, "slot"));
    }
    return () => { clearHide(); cleanups.forEach((cleanup) => cleanup()); };
  }, [anchor, clearHide, scheduleHide]);

  useEffect(() => () => clearHide(), [clearHide]);

  const fontSize = anchor.hidden ? anchor.name?.fontSize : Math.min(anchor.box.width, anchor.box.height) / 4;
  const { buttonSize, iconSize, gap } = recordPlusLayoutSize(zoom, fontSize || 12);
  const buttonStyle = { width: buttonSize, height: buttonSize };
  const iconStyle = { width: iconSize, height: iconSize };
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };

  if (anchor.hidden) {
    if (hover !== "name" || !anchor.name) return null;
    return (
      <div
        className={`${cluster.anchor} ${classes.nameAnchor}`}
        data-editor-control="true"
        style={{
          left: anchor.name.left + anchor.name.width + gap,
          top: anchor.name.top - 1,
        }}
      >
        <div className={cluster.cluster} style={{ gap }} onPointerEnter={clearHide} onPointerLeave={scheduleHide}>
          <button
            type="button"
            className={classes.restore}
            style={buttonStyle}
            aria-label="Pokaż slot zdjęcia profilowego"
            title="Pokaż zdjęcie profilowe"
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
      <div className={cluster.cluster} style={{ gap }} onPointerEnter={clearHide} onPointerLeave={scheduleHide}>
        {anchor.hasPhoto ? (
          <button
            type="button"
            className={cluster.trash}
            style={buttonStyle}
            aria-label="Usuń zdjęcie ze slotu"
            title="Usuń zdjęcie"
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
          title="Ukryj zdjęcie profilowe"
          onPointerDown={stop}
          onClick={(event) => { stop(event); hideProfilePhoto(); setHover(null); }}
        >
          <FiEyeOff style={iconStyle} />
        </button>
      </div>
    </div>
  );
}
