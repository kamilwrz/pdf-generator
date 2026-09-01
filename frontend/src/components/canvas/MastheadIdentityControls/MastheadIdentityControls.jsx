/**
 * Inline hover controls for the masthead identity block (Phase 3).
 *
 * Hovering the name reveals a case toggle chip ("Aa" when uppercase — click to
 * lowercase; "AA" when not — click to uppercase). Hovering the title reveals a
 * hide button. When the title is hidden a "+" appears next to the name to add it
 * back. All three actions commit through the `toggleNameCase` / `toggleTitle`
 * context ops. Mirrors `ContactChannelControls` timing/exclusivity + the shared
 * `.cluster` surface chip; only managed blocks (with a descriptor) reach here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FiPlus, FiEyeOff } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { recordPlusLayoutSize } from "../recordPlusSize";
import cluster from "../SectionRecordAdd/SectionRecordAdd.module.css";
import classes from "./MastheadIdentityControls.module.css";

const HIDE_AFTER_LEAVE_MS = 600;

export default function MastheadIdentityControls({ band }) {
  const { toggleNameCase, toggleTitle, zoom = 1 } = useCanvasContext();
  const [hover, setHover] = useState(null); // "name" | "title" | null
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

  // Bind hover to the name node and (when present) the title node by element id,
  // the same way ContactChannelControls binds to chip label nodes.
  useEffect(() => {
    const cleanups = [];
    const bind = (elementId, key) => {
      const node = document.getElementById(elementId);
      if (!node) return;
      const onEnter = () => { clearHide(); setHover(key); };
      const onLeave = () => scheduleHide();
      node.addEventListener("pointerenter", onEnter);
      node.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        node.removeEventListener("pointerenter", onEnter);
        node.removeEventListener("pointerleave", onLeave);
      });
    };
    bind(band.name.elementId, "name");
    if (band.title) bind(band.title.elementId, "title");
    return () => { clearHide(); cleanups.forEach((fn) => fn()); };
  }, [band, clearHide, scheduleHide]);

  useEffect(() => () => clearHide(), [clearHide]);

  const { buttonSize, iconSize, gap } = recordPlusLayoutSize(zoom, band.name.fontSize);
  const buttonStyle = { width: buttonSize, height: buttonSize };
  const iconStyle = { width: iconSize, height: iconSize };
  const stop = (event) => { event.stopPropagation(); event.preventDefault(); };

  return (
    <>
      {/* Name case toggle: sits just left of the name line. */}
      {hover === "name" ? (
        <div className={cluster.anchor} data-editor-control="true"
             style={{ left: band.name.left - buttonSize - gap, top: band.name.top - 1 }}>
          <div className={cluster.cluster} style={{ gap }}
               onPointerEnter={() => { clearHide(); setHover("name"); }}
               onPointerLeave={scheduleHide}>
            <button type="button" className={classes.caseToggle} style={buttonStyle}
                    aria-label={band.name.uppercase ? "Wyłącz wielkie litery" : "Włącz wielkie litery"}
                    title={band.name.uppercase ? "Zwykłe litery" : "WIELKIE LITERY"}
                    onPointerDown={stop}
                    onClick={(e) => { stop(e); toggleNameCase(band.bandId); }}>
              {band.name.uppercase ? "Aa" : "AA"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Title hide: sits just left of the title line. */}
      {hover === "title" && band.title ? (
        <div className={cluster.anchor} data-editor-control="true"
             style={{ left: band.title.left - buttonSize - gap, top: band.title.top - 1 }}>
          <div className={cluster.cluster} style={{ gap }}
               onPointerEnter={() => { clearHide(); setHover("title"); }}
               onPointerLeave={scheduleHide}>
            <button type="button" className={cluster.trash} style={buttonStyle}
                    aria-label="Ukryj stanowisko" title="Ukryj stanowisko"
                    onPointerDown={stop}
                    onClick={(e) => { stop(e); toggleTitle(band.bandId); setHover(null); }}>
              <FiEyeOff style={iconStyle} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Add-title "+": shown when the title is hidden, next to the name. */}
      {!band.titlePresent ? (
        <div className={cluster.anchor} data-editor-control="true" style={{ left: band.name.left + 44, top: band.name.top - 1 }}>
          <div className={cluster.cluster} style={{ gap }}>
            <button type="button" className={cluster.plus} style={buttonStyle}
                    aria-label="Dodaj stanowisko" title="Dodaj stanowisko"
                    onPointerDown={stop}
                    onClick={(e) => { stop(e); toggleTitle(band.bandId); }}>
              <FiPlus style={iconStyle} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
