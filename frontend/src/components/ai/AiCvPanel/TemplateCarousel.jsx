/**
 * Endless-loop template gallery for AiCvPanel step 2 / Bio / ChangeTemplate.
 *
 * Templates are individual product entries (name + short description). Renders
 * a fixed-size window computed by modulo indexing into the registry-ordered
 * list, so the "prev"/"next" arrows never hit a dead end.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import classes from "./TemplateCarousel.module.css";
import { isTemplateAllowed } from "../../../utils/entitlements";
import { listTemplatesInRegistryOrder } from "../../../utils/templateLayouts";

const VISIBLE_COUNT = 5;

const ChevronLeft = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
);
const ChevronRight = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6 6-6" /></svg>
);

/**
 * @param {object} props
 * @param {Array<{id:string,name:string,description?:string,accent:string,tier:string,layouts?:string[]}>} props.templates
 * @param {object} props.entitlements
 * @param {string|null} props.fillingId
 * @param {(template: object) => void} props.onSelect
 * @param {boolean} [props.fillHeight] - Stretch the gallery to fill a flex parent (AiCvPanel step 2).
 */
export default function TemplateCarousel({ templates, entitlements, fillingId, onSelect, fillHeight = false }) {
    const [startIndex, setStartIndex] = useState(0);

    const orderedTemplates = useMemo(
        () => listTemplatesInRegistryOrder(templates),
        [templates],
    );

    const total = orderedTemplates.length;
    const canLoop = total > VISIBLE_COUNT;

    const visible = useMemo(() => {
        const count = Math.min(VISIBLE_COUNT, total);
        if (count === 0) return [];
        return Array.from({ length: count }, (_, i) => orderedTemplates[(startIndex + i) % total]);
    }, [orderedTemplates, startIndex, total]);

    function prev() {
        setStartIndex((s) => (s - 1 + total) % total);
    }
    function next() {
        setStartIndex((s) => (s + 1) % total);
    }

    if (!templates?.length) return null;

    return (
        <div className={`${classes.carousel}${fillHeight ? ` ${classes.carouselFill}` : ""}`}>
            <div className={classes.toolbar}>
                <p className={classes.toolbarHint}>
                    Każdy szablon ma własny styl — wybierz układ pasujący do dokumentu.
                </p>
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
            </div>
            <div className={`${classes.track}${fillHeight ? ` ${classes.trackFill}` : ""}`}>
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
                                title={locked ? "Dostępne w planie Standard" : t.description}
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
                                    <span className={classes.description}>{t.description}</span>
                                </span>
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}
