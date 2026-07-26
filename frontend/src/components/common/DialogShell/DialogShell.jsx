import { useEffect } from "react";
import { createPortal } from "react-dom";
import classes from "./DialogShell.module.css";
import CloseButton from "../CloseButton/CloseButton";

// Shared centered-modal shell for Docs/Templates/AI. Owns the backdrop,
// popIn animation, header (title+subtitle+close) and Escape-to-close so
// every dialog gets identical dismiss behavior instead of each
// re-implementing (or, as with the old ModalPdfs, omitting) it.
export default function DialogShell({ open, onClose, width = 560, title, subtitle, footer, children }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className={classes.backdrop} onClick={onClose}>
            <div className={classes.dialog} style={{ width }} onClick={(e) => e.stopPropagation()}>
                <div className={classes.header}>
                    <div>
                        <h2>{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <CloseButton clickHandler={onClose} top={12} right={16} />
                </div>
                <div className={classes.body}>
                    {children}
                </div>
                {footer && <div className={classes.footer}>{footer}</div>}
            </div>
        </div>,
        document.body
    );
}
