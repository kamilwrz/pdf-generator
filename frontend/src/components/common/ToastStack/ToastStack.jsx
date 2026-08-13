/**
 * Stacked toast renderer for useToasts() notifications.
 */
import classes from "./ToastStack.module.css";
import CloseButton from "../CloseButton/CloseButton";
import { FiDownload } from "react-icons/fi";

const VARIANTS = {
    success: {
        accent: "var(--success)",
        iconBg: "var(--success-soft)",
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ),
    },
    error: {
        accent: "var(--danger)",
        iconBg: "var(--danger-soft)",
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
        ),
    },
};

// Rendered once in PdfCanvas. `offsetForGallery` shifts the stack left so it
// never sits under the Gallery drawer; `bottom` clears the always-on-screen
// PageControls bar + AiAssistant FAB that already occupy this corner.
export default function ToastStack({ toasts, onDismiss, offsetForGallery }) {
    if (toasts.length === 0) return null;

    return (
        <div className={classes.stack} style={{ right: offsetForGallery ? 396 : 16 }}>
            {toasts.map((t) => {
                const variant = VARIANTS[t.variant] || VARIANTS.success;
                return (
                    <div key={t.id} className={classes.toast} style={{ borderLeftColor: variant.accent }}>
                        <div className={classes.icon} style={{ background: variant.iconBg, color: variant.accent }}>
                            {variant.icon}
                        </div>
                        <div className={classes.body}>
                            <div className={classes.title}>{t.title}</div>
                            {t.msg && <div className={classes.msg}>{t.msg}</div>}
                            {t.action && (
                                <a className={classes.action} href={t.action.href} download={t.action.download}>
                                    <FiDownload /> {t.action.label}
                                </a>
                            )}
                        </div>
                        <CloseButton clickHandler={() => onDismiss(t.id)} top={10} right={10} width="24px" height="24px" />
                    </div>
                );
            })}
        </div>
    );
}
