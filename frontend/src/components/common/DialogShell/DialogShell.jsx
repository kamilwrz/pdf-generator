import { t as uiText } from '../../../i18n/index.js';
import { useTranslation } from 'react-i18next';
import { useContext, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import classes from "./DialogShell.module.css";
import CloseButton from "../CloseButton/CloseButton";
import { DialogSuspensionContext } from "./DialogSuspensionContext";

// Shared modal shell for Docs/Templates/Plans/AI. Owns the backdrop, semantic
// dialog labelling, keyboard focus lifecycle, header, and Escape-to-close so
// every modal gets identical interaction behavior.
//
// `variant="fullscreen"` is used by CV setup and the bio/CV wizard: edge-to-edge overlay
// with a single scroll surface (body), sticky header/footer, and no floating
// card over the editor. `variant="decision"` gives short account and product
// gates a stronger editorial hierarchy without duplicating the shell.
// `surface="paper"` keeps large form surfaces and close controls white while
// retaining the caller's accent tokens and the unchanged backdrop treatment.
//
// Optional `headerAction` places task navigation between title and close.
// It remains inside the same focus trap; callers own its permission and busy states.
//
// Portals to `document.body` so stacking context / overflow on the editor
// chrome cannot clip the dialog. Callers must keep a single standard dialog
// open. The editor's recovery provider may temporarily suspend that dialog
// while the central unsaved-changes alert owns focus; the caller stays mounted
// so an in-flight operation and its local state can resume safely afterward.
export default function DialogShell({
    open,
    onClose,
    width = 560,
    title,
    subtitle,
    eyebrow,
    headerAction,
    footer,
    bodyClassName,
    variant = "modal",
    surface = "standard",
    role = "dialog",
    initialFocusSelector,
    restoreFocusSelector,
    layer = "standard",
    children,
}) {
    useTranslation();
    const standardDialogsSuspended = useContext(DialogSuspensionContext);
    const renderedOpen = open && (layer === "recovery" || !standardDialogsSuspended);
    const isFullscreen = variant === "fullscreen";
    const isDecision = variant === "decision";
    const dialogRef = useRef(null);
    const previousFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const subtitleId = useId();

    useEffect(() => {
        // Callers often create `onClose` inline. Keep the newest callback in a
        // ref so their re-renders do not restart the focus lifecycle and replace
        // the original opener with a control that is already inside the dialog.
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!renderedOpen) return undefined;

        previousFocusRef.current = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const focusableSelector = [
            "button:not([disabled])",
            "[href]",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
        ].join(",");

        const onKeyDown = (event) => {
            const openDialogs = document.querySelectorAll("[data-dialog-shell]");
            if (openDialogs[openDialogs.length - 1] !== dialogRef.current) return;

            if (event.key === "Escape") {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) return;

            const focusableControls = Array.from(
                dialogRef.current.querySelectorAll(focusableSelector),
            ).filter((element) => {
                // Disabled fieldsets disable descendants without adding their
                // own disabled attributes. CSS-hidden responsive disclosures
                // must also stay outside the modal's keyboard loop. Explicitly removed
                // tab stops include busy navigation links that still have an href.
                if (element.matches(":disabled") || element.getAttribute("tabindex") === "-1" || element.getAttribute("aria-hidden") === "true") return false;
                return typeof element.checkVisibility !== "function" || element.checkVisibility({ visibilityProperty: true });
            });

            if (focusableControls.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }

            const firstControl = focusableControls[0];
            const lastControl = focusableControls[focusableControls.length - 1];
            const focusIsOutsideDialog = !dialogRef.current.contains(document.activeElement);

            if (event.shiftKey && (document.activeElement === firstControl || focusIsOutsideDialog)) {
                event.preventDefault();
                lastControl.focus();
            } else if (!event.shiftKey && document.activeElement === lastControl) {
                event.preventDefault();
                firstControl.focus();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            const focusTarget = previousFocusRef.current?.isConnected
                ? previousFocusRef.current
                : restoreFocusSelector
                    ? document.querySelector(restoreFocusSelector)
                    : null;
            if (focusTarget instanceof HTMLElement) {
                focusTarget.focus({ preventScroll: true });
            }
        };
    }, [renderedOpen, restoreFocusSelector]);

    // A confirmation can become a fullscreen form without closing the shell.
    // Move initial focus for that new state without replacing the original
    // opener or briefly unlocking body scrolling during the transition.
    useEffect(() => {
        if (!renderedOpen) return undefined;
        const focusAtScheduling = document.activeElement;
        const frame = window.requestAnimationFrame(() => {
            // Do not steal focus if the user already chose a control before the frame.
            if (document.activeElement !== focusAtScheduling && dialogRef.current?.contains(document.activeElement)) return;
            const selector = initialFocusSelector || "button:not([disabled]), input:not([disabled]), [href], [tabindex='0']";
            (dialogRef.current?.querySelector(selector) || dialogRef.current)?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [initialFocusSelector, renderedOpen]);

    if (!renderedOpen) return null;

    return createPortal(
        <div
            className={`${classes.backdrop}${isFullscreen ? ` ${classes.backdropFullscreen}` : ""}${isDecision ? ` ${classes.backdropDecision}` : ""}`}
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                data-dialog-shell=""
                className={`${classes.dialog}${isFullscreen ? ` ${classes.dialogFullscreen}` : ""}${isDecision ? ` ${classes.dialogDecision}` : ""}${surface === "paper" ? ` ${classes.paperSurface}` : ""}`}
                style={isFullscreen ? undefined : { width }}
                role={role}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={subtitle ? subtitleId : undefined}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`${classes.header}${headerAction ? ` ${classes.headerWithAction}` : ""}`}>
                    <div>
                        {eyebrow && <span className={classes.eyebrow}>{eyebrow}</span>}
                        <h2 id={titleId}>{title}</h2>
                        {subtitle && <p id={subtitleId}>{subtitle}</p>}
                    </div>
                    {headerAction && <div className={classes.headerAction}>{headerAction}</div>}
                    <CloseButton
                        ariaLabel={uiText("common:closeDialog", { title })}
                        clickHandler={onClose}
                        top={isDecision ? 24 : 18}
                        right={isDecision ? 32 : 28}
                        width={isDecision || isFullscreen ? 44 : 36}
                        height={isDecision || isFullscreen ? 44 : 36}
                    />
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
