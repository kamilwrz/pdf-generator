/**
 * Endless-loop template gallery for AiCvPanel step 2.
 *
 * Renders a fixed-size window of templates computed by modulo indexing into
 * `templates`, so the "prev"/"next" arrows never hit a dead end — advancing
 * past the last template wraps to the first, and vice versa. Framer Motion's
 * `layout` animation on each card handles the sliding shift automatically:
 * a card that stays visible keeps its React key and animates to its new
 * slot, the card that scrolls off exits, and the newly revealed one enters —
 * no manual pixel/transform math, no DOM-cloning trick.
 *
 * Replaces the previous split view (a separate hover-triggered mockup pane
 * next to a text-only list): the mockup thumbnail is now the card itself, and
 * hovering it directly enlarges it in place (`whileHover`), which is both a
 * simpler interaction and immune to the previous pane's visibility bug.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import classes from "./TemplateCarousel.module.css";
import { isTemplateAllowed } from "../../../utils/entitlements";

// How many cards are visible at once. Chosen to fit comfortably inside the
// AiCvPanel dialog's extracted-state width (1400px) with room for the
// hover-scale growth on the edge cards without clipping into the dialog padding.
const VISIBLE_COUNT = 5;

const ChevronLeft = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
);
const ChevronRight = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
);

/**
 * @param {object} props
 * @param {Array<{id:string,name:string,accent:string,tier:string}>} props.templates
 * @param {object} props.entitlements - Current plan entitlements, passed to `isTemplateAllowed`.
 * @param {string|null} props.fillingId - Template id currently being filled, for the spinner overlay.
 * @param {(template: object) => void} props.onSelect - Called with the chosen template on click.
 */
export default function TemplateCarousel({ templates, entitlements, fillingId, onSelect }) {
    const [startIndex, setStartIndex] = useState(0);
    const total = templates.length;
    // Looping only makes sense once there are more templates than fit on
    // screen at once; otherwise every template is already visible and the
    // arrows would just reorder them pointlessly.
    const canLoop = total > VISIBLE_COUNT;

    const visible = useMemo(() => {
        const count = Math.min(VISIBLE_COUNT, total);
        return Array.from({ length: count }, (_, i) => templates[(startIndex + i) % total]);
    }, [templates, startIndex, total]);

    function prev() {
        setStartIndex((s) => (s - 1 + total) % total);
    }
    function next() {
        setStartIndex((s) => (s + 1) % total);
    }

    if (total === 0) return null;

    return (
        <div className={classes.carousel}>
            {canLoop && (
                <div className={classes.controls}>
                    <button type="button" className={classes.navBtn} onClick={prev} aria-label="Poprzednie szablony">
                        <ChevronLeft />
                    </button>
                    <button type="button" className={classes.navBtn} onClick={next} aria-label="Następne szablony">
                        <ChevronRight />
                    </button>
                </div>
            )}
            <div className={classes.track}>
                <AnimatePresence mode="popLayout" initial={false}>
                    {visible.map((t) => {
                        const locked = !isTemplateAllowed(t, entitlements);
                        const filling = fillingId === t.id;
                        return (
                            <motion.button
                                type="button"
                                key={t.id}
                                layout
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                whileHover={locked ? undefined : { scale: 1.09, zIndex: 2 }}
                                whileFocus={locked ? undefined : { scale: 1.09, zIndex: 2 }}
                                transition={{
                                    layout: { type: "spring", stiffness: 320, damping: 32 },
                                    opacity: { duration: 0.18 },
                                    scale: { duration: 0.18 },
                                }}
                                className={classes.card}
                                onClick={() => onSelect(t)}
                                disabled={fillingId !== null || locked}
                                title={locked ? "Dostępne w planie Standard" : undefined}
                            >
                                <span className={classes.imgWrap}>
                                    <img
                                        className={classes.img}
                                        src={`/template-mockups/${t.id}.png`}
                                        alt=""
                                        loading="lazy"
                                        draggable={false}
                                    />
                                    {locked && <span className={classes.lockBadge}>Standard</span>}
                                    {filling && (
                                        <span className={classes.fillingOverlay}>
                                            <span className={classes.spinner} />
                                        </span>
                                    )}
                                </span>
                                <span className={classes.label}>
                                    <span className={classes.dot} style={{ background: t.accent }} />
                                    <span className={classes.name}>{t.name}</span>
                                </span>
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}
