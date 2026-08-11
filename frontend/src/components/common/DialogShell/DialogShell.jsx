import { useEffect } from "react";
import { createPortal } from "react-dom";
import classes from "./DialogShell.module.css";
import CloseButton from "../CloseButton/CloseButton";

// Shared modal shell for Docs/Templates/Plans/AI. Owns the backdrop,
// popIn animation, header (title+subtitle+close) and Escape-to-close so
// every dialog gets identical dismiss behavior.
//
// `variant="fullscreen"` is used by the bio/CV wizard: edge-to-edge overlay
// with a single scroll surface (body), sticky header/footer, and no floating
// card over the editor. Other dialogs keep the default centered card.
//
// `radius` is an optional per-instance override for the dialog corner radius.
// It is applied inline only when provided (ignored for fullscreen).
//
// Portals to `document.body` so stacking context / overflow on the editor
// chrome cannot clip the dialog. Callers must keep a single open instance —
// auto-open flows (e.g. LongCv) guard against opening twice for the same doc.
export default function DialogShell({
    open,
    onClose,
    width = 560,
    radius,
    title,
    subtitle,
    footer,
    bodyClassName,
    variant = "modal",
    children,
}) {
    const isFullscreen = variant === "fullscreen";

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !isFullscreen) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open, isFullscreen]);

    if (!open) return null;

    return createPortal(
        <div
            className={`${classes.backdrop}${isFullscreen ? ` ${classes.backdropFullscreen}` : ""}`}
            onClick={onClose}
        >
            <div
                className={`${classes.dialog}${isFullscreen ? ` ${classes.dialogFullscreen}` : ""}`}
                style={isFullscreen
                    ? undefined
                    : { width, ...(radius != null ? { borderRadius: radius } : {}) }}
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
