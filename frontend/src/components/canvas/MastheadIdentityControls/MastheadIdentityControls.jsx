/**
 * Inline hover controls for the masthead identity block (Phase 3).
 *
 * Hovering the name reveals a case toggle chip ("Aa" when uppercase — click to
 * lowercase; "AA" when not — click to uppercase). Hovering the title reveals a
 * hide button. When the title is hidden a "+" appears in its saved field to add it
 * back. All three actions commit through the `toggleNameCase` / `toggleTitle`
 * context ops. Mirrors `ContactChannelControls` timing/exclusivity + the shared
 * `.cluster` surface chip; only managed blocks (with a descriptor) reach here.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FiPlus, FiEyeOff } from "react-icons/fi";
import { useCanvasContext } from "../../../store/canvas-context";
import { compactInlineToolbarLayoutSize } from "../recordPlusSize";
import { getTextContentBounds } from "../../../utils/elementBounds";
import cluster from "../SectionRecordAdd/SectionRecordAdd.module.css";
import classes from "./MastheadIdentityControls.module.css";

const HIDE_AFTER_LEAVE_MS = 600;

export default function MastheadIdentityControls({ band }) {
  const { toggleNameCase, toggleTitle, zoom = 1 } = useCanvasContext();
  const [hover, setHover] = useState(null); // "name" | "title" | null
  const hideTimerRef = useRef(null);
  const [nameBounds, setNameBounds] = useState(band.name);

  // Point text can have a zero-height baseline box. Measure its glyphs after
  // commit, including wrapping, case changes and late font loads, without
  // changing any document coordinates or export dimensions.
  useLayoutEffect(() => {
    const measure = () => setNameBounds(getTextContentBounds({
      ...band.name, element_id: band.name.elementId, category: "text",
    }));
    measure();
    const node = document.getElementById(band.name.elementId);
    const observer = new ResizeObserver(measure);
    if (node) observer.observe(node);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [band.name, zoom, hover]);

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
      node.addEventListener("focusin", onEnter);
      node.addEventListener("focusout", onLeave);
      cleanups.push(() => {
        node.removeEventListener("pointerenter", onEnter);
        node.removeEventListener("pointerleave", onLeave);
        node.removeEventListener("focusin", onEnter);
        node.removeEventListener("focusout", onLeave);
      });
    };
    bind(band.name.elementId, "name");
    if (band.title) bind(band.title.elementId, "title");
    return () => { clearHide(); cleanups.forEach((fn) => fn()); };
  }, [band, clearHide, scheduleHide]);

  useEffect(() => () => clearHide(), [clearHide]);

  const { buttonSize, iconSize, gap, offset, borderWidth } = compactInlineToolbarLayoutSize(zoom);
  const surfaceSize = buttonSize + 2 * (gap + borderWidth);
  // Prefer the upper-left diagonal. Near the page's top edge, use the left
  // side at glyph-top height; near its left edge, use the space above instead.
  const hasRoomAbove = nameBounds.top >= surfaceSize + offset;
  const hasRoomLeft = nameBounds.left >= surfaceSize + offset;
  const casePosition = {
    left: hasRoomLeft || !hasRoomAbove ? nameBounds.left - offset : nameBounds.left,
    top: hasRoomAbove ? nameBounds.top - offset : nameBounds.top,
  };
  const caseTransform = `translate(${hasRoomLeft || !hasRoomAbove ? "-100%" : "0"}, ${hasRoomAbove ? "-100%" : "0"})`;
  const titleSpec = band.descriptor.title?.spec;
  // A decorated point-text title (Slate) owns a visible band rather than a
  // text box. Prefer that band; bounded titles use their reconstruction spec.
  const titleArea = band.descriptor.title?.decorations?.find((item) => item.width > 0 && item.height > 0)
    ?? titleSpec;
  const titleCenter = titleSpec ? {
    left: (titleArea.left ?? band.name.left) + (titleArea.width || band.name.width || nameBounds.width || 0) / 2,
    top: titleArea.top + (titleArea.height ?? titleSpec.lineHeight
      ?? Math.round((Number(titleSpec.fontSizePt) || 10) * 1.3)) / 2,
  } : null;
  const buttonStyle = { width: buttonSize, height: buttonSize };
  const iconStyle = { width: iconSize, height: iconSize };
  const stop = (event) => { event.stopPropagation(); event.preventDefault(); };

  return (
    <>
      {/* The entire surface clears the upper-left glyph corner by 8 screen px. */}
      {hover === "name" ? (
        <div className={cluster.anchor} data-editor-control="true"
             style={casePosition}>
          <div className={cluster.cluster} style={{ gap, transform: caseTransform }}
               onPointerEnter={() => { clearHide(); setHover("name"); }}
               onPointerLeave={scheduleHide} onFocus={clearHide} onBlur={scheduleHide}>
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
               onPointerLeave={scheduleHide} onFocus={clearHide} onBlur={scheduleHide}>
            <button type="button" className={cluster.trash} style={buttonStyle}
                    aria-label="Ukryj stanowisko" title="Ukryj stanowisko"
                    onPointerDown={stop}
                    onClick={(e) => { stop(e); toggleTitle(band.bandId); setHover(null); }}>
              <FiEyeOff style={iconStyle} />
            </button>
          </div>
        </div>
      ) : null}

      {/* The restore action marks the centre of the future title field. */}
      {!band.titlePresent && titleCenter ? (
        <div className={cluster.anchor} data-editor-control="true" style={titleCenter}>
          <div className={cluster.cluster} style={{ gap, transform: "translate(-50%, -50%)" }}>
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
