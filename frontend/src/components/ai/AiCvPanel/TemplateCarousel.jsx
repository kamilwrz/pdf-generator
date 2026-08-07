/**
 * Endless-loop template gallery for AiCvPanel step 2 / Bio / ChangeTemplate.
 *
 * Templates are individual product entries (name + short description). Renders
 * a fixed-size window computed by modulo indexing into the registry-ordered
 * list, so the "prev"/"next" arrows never hit a dead end.
 *
 * When `selectedId` is set (e.g. the document's active template in
 * "Zmień szablon"), browsing starts at that card and it is marked as current.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import classes from "./TemplateCarousel.module.css";
import { isTemplateAllowed } from "../../../utils/entitlements";
import {
    listTemplatesInRegistryOrder,
    startIndexForSelectedTemplate,
} from "../../../utils/templateLayouts";

const DEFAULT_VISIBLE_COUNT = 5;

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
 * @param {string|null} [props.selectedId] - Currently applied template (shown + start window)
 * @param {(template: object) => void} props.onSelect
 * @param {boolean} [props.fillHeight] - Stretch the gallery to fill a flex parent (AiCvPanel step 2).
 * @param {number} [props.visibleCount] - How many cards to show in the browsing window.
 * @param {string} [props.actionLabel] - Optional CTA label under each selectable card.
 */
export default function TemplateCarousel({
    templates,
    entitlements,
    fillingId,
    selectedId = null,
    onSelect,
    fillHeight = false,
    visibleCount = DEFAULT_VISIBLE_COUNT,
    actionLabel = null,
}) {
    const windowCount = Math.max(1, Number(visibleCount) || DEFAULT_VISIBLE_COUNT);
    const orderedTemplates = useMemo(
        () => listTemplatesInRegistryOrder(templates),
        [templates],
    );

    const [startIndex, setStartIndex] = useState(() =>
        startIndexForSelectedTemplate(orderedTemplates, selectedId),
    );

    // Remounts already reset state when the change-template dialog opens, but
    // keep the window aligned if the active template changes while mounted
    // (e.g. after a successful restyle before the dialog closes).
    useEffect(() => {
        setStartIndex(startIndexForSelectedTemplate(orderedTemplates, selectedId));
    }, [orderedTemplates, selectedId]);

    const total = orderedTemplates.length;
    const canLoop = total > windowCount;
    const selectedTemplate = selectedId
        ? orderedTemplates.find((template) => template.id === selectedId)
        : null;

    const visible = useMemo(() => {
        const count = Math.min(windowCount, total);
        if (count === 0) return [];
        return Array.from({ length: count }, (_, i) => orderedTemplates[(startIndex + i) % total]);
    }, [orderedTemplates, startIndex, total, windowCount]);

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
                    {selectedTemplate
                        ? `Aktualny szablon: ${selectedTemplate.name} — przeglądaj inne układy.`
                        : "Każdy szablon ma własny styl — wybierz układ pasujący do dokumentu."}
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
                        const selected = selectedId === t.id;
                        return (
                            <motion.button
                                type="button"
                                key={t.id}
                                layout
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                whileHover={locked || selected ? undefined : { scale: 1.09, zIndex: 2 }}
                                whileFocus={locked || selected ? undefined : { scale: 1.09, zIndex: 2 }}
                                transition={{
                                    layout: { type: "spring", stiffness: 320, damping: 32 },
                                    opacity: { duration: 0.18 },
                                    scale: { duration: 0.18 },
                                }}
                                className={`${classes.card}${selected ? ` ${classes.cardSelected}` : ""}`}
                                onClick={() => {
                                    if (selected || locked) return;
                                    onSelect(t);
                                }}
                                disabled={fillingId !== null || locked}
                                aria-current={selected ? "true" : undefined}
                                title={
                                    locked
                                        ? "Dostępne w planie Standard"
                                        : selected
                                            ? `Aktualny szablon: ${t.name}`
                                            : t.description
                                }
                            >
                                <span className={classes.imgWrap}>
                                    <img
                                        className={classes.img}
                                        src={`/template-mockups/${t.id}.png`}
                                        alt=""
                                        loading="lazy"
                                        draggable={false}
                                    />
                                    {selected && <span className={classes.currentBadge}>Obecny</span>}
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
                                    {actionLabel && !locked && !selected && (
                                        <span className={classes.actionLabel}>{actionLabel}</span>
                                    )}
                                </span>
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}
