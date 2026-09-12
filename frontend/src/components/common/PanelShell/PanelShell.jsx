import { useEffect, useId } from "react";
import { motion as Motion, AnimatePresence, useReducedMotion } from "framer-motion";
import classes from "./PanelShell.module.css";
import CloseButton from "../CloseButton/CloseButton";
import { useTranslation } from "react-i18next";

/**
 * Shared non-modal panel header, scroll body, footer and Escape handling.
 * Callers own positioning and focus restoration. The comfortable appearance
 * reserves a full-size close target and readable explanatory copy for pickers;
 * existing dense tools retain their compact header.
 */
export default function PanelShell({ open, onClose, className, style, motionProps, title, subtitle, footer, children, appearance = "compact" }) {
    const { t } = useTranslation();
    const titleId = useId();
    const subtitleId = useId();
    const comfortable = appearance === "comfortable";
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
                <Motion.section className={className} style={style} aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined} {...resolvedMotionProps}>
                    <div className={`${classes.header} ${comfortable ? classes.comfortable : ""}`}>
                        <div>
                            <h2 id={titleId}>{title}</h2>
                            {subtitle && <p id={subtitleId}>{subtitle}</p>}
                        </div>
                        <CloseButton ariaLabel={`${t("editor:sectionsPanel.close")}: ${title}`} clickHandler={onClose} top={comfortable ? 16 : 12} right={16} width={comfortable ? 44 : undefined} height={comfortable ? 44 : undefined} />
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
