import { useEffect, useId } from "react";
import { motion as Motion, AnimatePresence, useReducedMotion } from "framer-motion";
import classes from "./PanelShell.module.css";
import CloseButton from "../CloseButton/CloseButton";

// Shared docked-panel shell for Upload/Gallery. Standardizes the header
// (title+subtitle+close) and Escape-to-close; outer position/size/slide
// direction stay with the caller (via `className` + `motionProps`) since
// Upload docks as a card near the sidebar while Gallery is a full-height
// right-edge drawer — genuinely different shapes, not worth forcing into
// one geometry.
export default function PanelShell({ open, onClose, className, style, motionProps, title, subtitle, footer, children }) {
    const titleId = useId();
    const reduceMotion = useReducedMotion();
    const resolvedMotionProps = reduceMotion
        ? { ...motionProps, initial: false, transition: { duration: 0 } }
        : motionProps;

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <Motion.section className={className} style={style} aria-labelledby={titleId} {...resolvedMotionProps}>
                    <div className={classes.header}>
                        <div>
                            <h2 id={titleId}>{title}</h2>
                            {subtitle && <p>{subtitle}</p>}
                        </div>
                        <CloseButton ariaLabel={`Zamknij: ${title}`} clickHandler={onClose} top={12} right={16} />
                    </div>
                    <div className={classes.body}>
                        {children}
                    </div>
                    {footer && <div className={classes.footer}>{footer}</div>}
                </Motion.section>
            )}
        </AnimatePresence>
    );
}
