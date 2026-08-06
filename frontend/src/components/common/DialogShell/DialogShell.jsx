import { useEffect } from "react";
import { createPortal } from "react-dom";
import classes from "./DialogShell.module.css";
import CloseButton from "../CloseButton/CloseButton";

// Shared centered-modal shell for Docs/Templates/Plans/AI. Owns the backdrop,
// popIn animation, header (title+subtitle+close) and Escape-to-close so
// every dialog gets identical dismiss behavior instead of each
// re-implementing (or, as with the old ModalPdfs, omitting) it.
//
// `radius` is an optional per-instance override for the dialog corner radius.
// It is applied inline only when provided, so dialogs that omit it keep the
// shared 8px radius from the stylesheet. Large surfaces (plans, templates,
// BioCv form steps) pass width={1280} and a near-zero radius; fill/summary
// galleries use 1400px with the same sharper editorial look.
export default function DialogShell({
    open,
    onClose,
    width = 560,
    radius,
    title,
    subtitle,
    footer,
    bodyClassName,
    children,
}) {
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
            <div
                className={classes.dialog}
                style={{ width, ...(radius != null ? { borderRadius: radius } : {}) }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={classes.header}>
                    <div>
                        <h2>{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <CloseButton clickHandler={onClose} top={18} right={28} width={32} height={32} radius={2} />
                </div>
                <div className={`${classes.body}${bodyClassName ? ` ${bodyClassName}` : ""}`}>
                    {children}
                </div>
                {footer && <div className={classes.footer}>{footer}</div>}
            </div>
        </div>,
        document.body
    );
}
