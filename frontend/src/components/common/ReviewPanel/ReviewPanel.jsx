import { useEffect, useId, useRef } from "react";
import { FiX } from "react-icons/fi";
import classes from "./ReviewPanel.module.css";

/**
 * Non-modal review surface with a fixed header/footer and scrollable body.
 * The canvas remains operable. Its caller owns trigger focus restoration and
 * session state; this shell owns initial keyboard focus and Escape handling.
 */
export default function ReviewPanel({ title, subtitle, onClose, footer, children }) {
  const titleId = useId();
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <section className={classes.panel} aria-labelledby={titleId} data-scoped-ai-panel="true"
      data-editor-control="true" onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      }}>
      <header className={classes.header}>
        <div><h2 id={titleId}>{title}</h2><p>{subtitle}</p></div>
        <button ref={closeRef} type="button" className={classes.close} aria-label="Zamknij propozycje AI" onClick={onClose}>
          <FiX aria-hidden="true" />
        </button>
      </header>
      <div className={classes.body}>{children}</div>
      {footer ? <footer className={classes.footer}>{footer}</footer> : null}
    </section>
  );
}
