import { useContext, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import classes from "./DialogShell.module.css";
import CloseButton from "../CloseButton/CloseButton";
import { DialogSuspensionContext } from "./DialogSuspensionContext";

// Shared modal shell for Docs/Templates/Plans/AI. Owns the backdrop, semantic
// dialog labelling, keyboard focus lifecycle, header, and Escape-to-close so
// every modal gets identical interaction behavior.
//
// `variant="fullscreen"` is used by the bio/CV wizard: edge-to-edge overlay
// with a single scroll surface (body), sticky header/footer, and no floating
// card over the editor. `variant="decision"` gives short account and product
// gates a stronger editorial hierarchy without duplicating the shell.
// `surface="paper"` keeps large form surfaces and close controls white while
// retaining the caller's accent tokens and the unchanged backdrop treatment.
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

        const focusInitialControl = window.requestAnimationFrame(() => {
            const firstControl = initialFocusSelector
                ? dialogRef.current?.querySelector(initialFocusSelector)
                : dialogRef.current?.querySelector(focusableSelector);
            (firstControl || dialogRef.current)?.focus({ preventScroll: true });
        });

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
            ).filter((element) => element.getAttribute("aria-hidden") !== "true");

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
            window.cancelAnimationFrame(focusInitialControl);
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
    }, [initialFocusSelector, renderedOpen, restoreFocusSelector]);

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
                <div className={classes.header}>
                    <div>
                        {eyebrow && <span className={classes.eyebrow}>{eyebrow}</span>}
                        <h2 id={titleId}>{title}</h2>
                        {subtitle && <p id={subtitleId}>{subtitle}</p>}
                    </div>
                    <CloseButton
                        ariaLabel={`Zamknij: ${title}`}
                        clickHandler={onClose}
                        top={isDecision ? 24 : 18}
                        right={isDecision ? 32 : 28}
                        width={isDecision ? 44 : 36}
                        height={isDecision ? 44 : 36}
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
