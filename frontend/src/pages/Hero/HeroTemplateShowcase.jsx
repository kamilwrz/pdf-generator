import { heroPreviewPath } from '../../i18n/templatePreviews.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { useId, useRef, useState } from "react";
import { motion as Motion, useReducedMotion } from "motion/react";
import classes from "./HeroTemplateShowcase.module.css";

/**
 * Present Free document previews without mounting the editor or its render tree.
 * The parent owns selection and the CTA URL; this component owns image feedback
 * and swipe detection. Native radios provide the persistent keyboard path.
 */
export default function HeroTemplateShowcase({ templates, selectedId, onSelect, mobileAction }) {
  useTranslation();
  const groupId = useId();
  const reducedMotion = useReducedMotion();
  const pointerStart = useRef(null);
  const suppressClick = useRef(false);
  const [imageStates, setImageStates] = useState({});
  const selectedIndex = Math.max(0, templates.findIndex((template) => template.id === selectedId));
  const selected = templates[selectedIndex];

  function finishSwipe(event) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Require a deliberate horizontal gesture. Vertical movement remains native
    // page scrolling; the synthetic click after a swipe must not reselect a card.
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
    suppressClick.current = true;
    const next = (selectedIndex + (dx < 0 ? 1 : -1) + templates.length) % templates.length;
    onSelect(templates[next].id);
  }

  if (!selected) return <p>{uiText("public:heroTemplateShowcase.couldNotLoadPreviewsYouCanStill")}</p>;

  return (
    <div className={classes.showcase}>
      <div className={classes.heading}>
        <span>{uiText("public:heroTemplateShowcase.chooseAFreeCvTemplate")}</span>
        <span className={classes.counter}>{String(selectedIndex + 1).padStart(2, "0")} / {String(templates.length).padStart(2, "0")}</span>
      </div>
      <div
        className={classes.stage}
        data-testid="hero-template-stage"
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (!event.isPrimary || event.pointerType === "mouse") return;
          pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={finishSwipe}
        onPointerCancel={() => { pointerStart.current = null; }}
      >
        {templates.map((template, index) => {
          const active = index === selectedIndex;
          const offset = (index - selectedIndex + templates.length) % templates.length;
          const side = offset === 1 ? 1 : -1;
          const imageState = imageStates[template.id];
          return (
            <Motion.button
              key={template.id}
              type="button"
              tabIndex={-1}
              aria-label={uiText("public:heroTemplateShowcase.showTemplate", { value0: (template.name) })}
              aria-pressed={active}
              className={classes.card}
              data-active={active}
              initial={false}
              animate={{ x: active ? "-50%" : `${-50 + side * 56}%`, y: active ? "0%" : "8%", z: active ? 0 : -96, rotateY: active ? 0 : side * -18, rotateZ: active ? 0 : side * 6 }}
              transition={{ duration: reducedMotion ? 0 : 0.32, ease: [0.2, 0, 0, 1] }}
              style={{ zIndex: active ? 3 : 1 }}
              onClick={() => { if (!suppressClick.current) onSelect(template.id); }}
            >
              <span className={classes.imageFallback} aria-hidden="true">
                <strong>{template.name}</strong>
                <span>{imageState === "error" ? uiText("public:heroTemplateShowcase.couldNotLoadThePreviewYouCan") : uiText("public:heroTemplateShowcase.loadingPreview")}</span>
              </span>
              {imageState !== "error" && <img
                src={heroPreviewPath(template.id, 595)}
                srcSet={`${heroPreviewPath(template.id, 360)} 360w, ${heroPreviewPath(template.id, 595)} 595w`}
                sizes="(max-width: 767px) 60vw, (max-width: 1440px) 27vw, 360px"
                alt=""
                width="595"
                height="842"
                draggable={false}
                loading={template.id === "linden" ? "eager" : "lazy"}
                fetchPriority={template.id === "linden" ? "high" : "low"}
                decoding="async"
                className={imageState === "loaded" ? classes.loadedImage : classes.pendingImage}
                onLoad={() => setImageStates((current) => ({ ...current, [template.id]: "loaded" }))}
                onError={() => setImageStates((current) => ({ ...current, [template.id]: "error" }))}
              />}
            </Motion.button>
          );
        })}
      </div>
      <fieldset className={classes.choices}>
        <legend>{uiText("public:heroTemplateShowcase.chooseAFreeTemplate")}</legend>
        {templates.map((template, index) => (
          <label key={template.id} className={classes.choice}>
            <input type="radio" name={groupId} value={template.id} checked={selected.id === template.id} onChange={() => onSelect(template.id)} />
            <span><small aria-hidden="true">{String(index + 1).padStart(2, "0")}</small>{template.name}</span>
          </label>
        ))}
      </fieldset>
      <p className={classes.caption} role="status" aria-live="polite">
        <strong>{selected.name}</strong><span>{uiText("public:heroTemplateShowcase.freeTemplate")} {selected.layouts.includes("sidebar") ? uiText("editor:newCvSetupModal.twoColumns") : uiText("editor:newCvSetupModal.oneColumn")}</span>
      </p>
      {imageStates[selected.id] === "error" && <p className={classes.error} role="status">{uiText("public:heroTemplateShowcase.couldNotLoadThePreviewChooseA")}</p>}
      {/* Compact layouts repeat the primary action after selection so users
          need not scroll back past the previews to continue. */}
      <div className={classes.mobileAction}>{mobileAction}</div>
    </div>
  );
}
