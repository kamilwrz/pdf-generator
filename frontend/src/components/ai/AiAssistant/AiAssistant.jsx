/**
 * Floating AI assistant: quick actions + freeform chat against the canvas.
 * Sends element snapshots to POST /ai/assistant; chat may return previewable
 * position/structure/deletion/clone review cards before mutating canvas state.
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { AnimatePresence, motion as Motion, useReducedMotion } from "framer-motion";
import { nanoid } from "nanoid";
import { BsStars } from "react-icons/bs";
import {
    FaBriefcase, FaFont, FaMagic, FaLanguage, FaSearch,
} from "react-icons/fa";
import { RiEditLine, RiScissorsLine } from "react-icons/ri";
import { IoClose, IoSend } from "react-icons/io5";
import { MdCheckCircle, MdCancel } from "react-icons/md";
import classes from "./AiAssistant.module.css";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import { syncCvDataFromCanvas } from "../../../utils/syncCvDataFromCanvas";
import { ApiClient, ENDPOINTS, wakeBackend } from "../../../services/api";
import { measureElements } from "../../../utils/elementBounds";
import {
    ATS_CATEGORY_WEIGHTS,
    atsReadabilityBand,
    overallPercentFromCategories,
    overallPercentFromRubric,
} from "../../../utils/atsScore";
import { collectPendingAiHighlights } from "../../../utils/aiCorrectionHighlights";
import { useDocumentLifecycle } from "../../../store/document-lifecycle-context";
import {
    canvasEvidenceElementIds,
    requirementStatusLabel,
    validateJobOfferInput,
} from "../../../utils/jobTailoring";

// A structural canvas toolbar occupies 203px at 100% zoom. The additional
// 29px keeps its 10px page offset plus a clearly visible Swiss-grid gutter.
// Reserve the same space on either side so opening chat never solves a right
// collision by hiding a left-lane toolbar behind the application sidebar.
const CANVAS_CONTEXT_CLEARANCE_PX = 232;

// ── goal-oriented quick actions ───────────────────────────────────────────
// User-facing tiles map to goals; backend still uses specialised API actions
// (rating, grammar, translate, …). Do not expose every endpoint as its own tile.
const CHROME_ACCENT = "var(--color-ink)";

/** Labels for API actions shown on assistant message chips. */
const ACTION_META = {
    rating:          { label: "Sprawdź CV",           color: CHROME_ACCENT },
    position_rating: { label: "Dopasuj do oferty",    color: CHROME_ACCENT },
    grammar:         { label: "Sprawdź błędy",        color: CHROME_ACCENT },
    language:        { label: "Popraw język",         color: CHROME_ACCENT },
    improve:         { label: "Wzmocnij treść",       color: CHROME_ACCENT },
    shorten:         { label: "Skróć CV",             color: CHROME_ACCENT },
    ats_score:       { label: "Czytelność dla ATS",   color: CHROME_ACCENT },
    translate:       { label: "Przetłumacz CV",       color: CHROME_ACCENT },
    chat:            { label: "Czat",                 color: CHROME_ACCENT },
};

/**
 * Remove an empty AI content replacement while preserving any valid style-only
 * fields. Record deletion has its own explicit review flow; a correction card
 * must never clear a CV element because a provider returned an empty string.
 */
function withoutEmptyContentReplacement(fields, allowEmptyContent = false) {
    if (!("content" in fields) || String(fields.content ?? "").trim() || allowEmptyContent) {
        return fields;
    }
    const { content: _emptyContent, ...remainingFields } = fields;
    return remainingFields;
}

/**
 * Top-level goals. Submenus open for improve_content / translate / match_job;
 * check_cv starts its flow immediately.
 */
const GOAL_ACTIONS = [
    {
        id: "check_cv",
        label: "Sprawdź CV",
        icon: FaSearch,
        color: CHROME_ACCENT,
        description: "Ogólny audyt CV: treść, doświadczenie, język i struktura",
    },
    {
        id: "improve_content",
        label: "Popraw treść",
        icon: FaMagic,
        color: CHROME_ACCENT,
        description: "Wzmocnij opisy, popraw styl lub sprawdź błędy",
        panel: "improve_content",
    },
    {
        id: "match_job",
        label: "Dopasuj do oferty",
        icon: FaBriefcase,
        color: CHROME_ACCENT,
        description: "Wklej link — oceń dopasowanie i przygotuj bezpieczne poprawki",
        panel: "match_job",
    },
    {
        id: "translate",
        label: "Przetłumacz CV",
        icon: FaLanguage,
        color: CHROME_ACCENT,
        description: "Przetłumacz treść CV na wybrany język",
        panel: "translate",
    },
];

const CONTENT_SUBACTIONS = [
    {
        id: "improve",
        label: "Wzmocnij treść",
        description: "Mocniejsze opisy i bardziej konkretne osiągnięcia",
        icon: FaMagic,
    },
    {
        id: "language",
        label: "Popraw język",
        description: "Profesjonalniejszy styl, mniej ogólników i frazesów",
        icon: FaFont,
    },
    {
        id: "grammar",
        label: "Sprawdź błędy",
        description: "Ortografia, gramatyka i interpunkcja",
        icon: RiEditLine,
    },
    {
        id: "shorten",
        label: "Skróć CV",
        description: "Skróć i połącz fragmenty, aby zmieścić na mniejszej liczbie stron",
        icon: RiScissorsLine,
    },
];

/** Codes match backend TRANSLATE_LANGUAGES (UA → uk). */
const TRANSLATE_LANGUAGES = [
    { code: "pl", label: "Polski" },
    { code: "en", label: "Angielski" },
    { code: "de", label: "Niemiecki" },
    { code: "fr", label: "Francuski" },
    { code: "es", label: "Hiszpański" },
    { code: "uk", label: "Ukraiński" },
    { code: "it", label: "Włoski" },
    { code: "nl", label: "Niderlandzki" },
];

/** Category ids that should offer a "Popraw treść" CTA when the score is weak. */
const CONTENT_CATEGORY_IDS = new Set(["completeness", "experience", "language"]);
const WEAK_CATEGORY_RATIO = 0.7;

function ratingToPercent(rating) {
    if (typeof rating !== "number" || Number.isNaN(rating)) return null;
    return Math.max(10, Math.min(100, Math.round(rating * 10)));
}

function categoryPercent(category) {
    const max = Number(category?.max);
    const score = Number(category?.score);
    if (!(max > 0) || Number.isNaN(score)) return null;
    return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
}

const SEVERITY_LABELS = {
    critical: "krytyczny",
    high: "wysoki",
    medium: "średni",
    low: "niski",
    review: "do sprawdzenia",
};

// ── sub-components ────────────────────────────────────────────────────────

function RatingBadge({ value, percent: percentProp }) {
    // Prefer an explicit percent (ATS weighted categories). Otherwise map the
    // legacy 1–10 rubric with `rating × 10` for non-ATS dashboards.
    const percent = typeof percentProp === "number" && !Number.isNaN(percentProp)
        ? Math.max(0, Math.min(100, Math.round(percentProp)))
        : ratingToPercent(value);
    if (percent == null) return null;
    const color = percent >= 80
        ? "var(--color-success)"
        : percent >= 60
            ? "var(--color-warning)"
            : "var(--color-danger)";
    return (
        <div className={classes.ratingBadge} style={{ borderColor: color, color }}>
            <span className={classes.ratingNum}>{percent}</span>
            <span className={classes.ratingDen}>%</span>
        </div>
    );
}

/**
 * Structured score dashboard for rating, ATS, and position results.
 * CTAs are computed on the client so the model does not invent navigation.
 */
function RatingDashboard({
    msg,
    A4_Elements,
    onShowEvidence,
    onHideEvidence,
    onOpenContentPanel,
    onRunAts,
    onOpenMatchJob,
    ctaDisabled,
}) {
    const categories = Array.isArray(msg.categories) ? msg.categories : [];
    const strengths = Array.isArray(msg.strengths) ? msg.strengths : [];
    const priorities = Array.isArray(msg.priorities) ? msg.priorities : [];
    const jobRequirements = Array.isArray(msg.jobRequirements) ? msg.jobRequirements : [];
    const evidenceGaps = Array.isArray(msg.evidenceGaps) ? msg.evidenceGaps : [];
    const currentCanvasElementIds = new Set(
        (Array.isArray(A4_Elements) ? A4_Elements : [])
            .map((element) => element?.element_id)
            .filter((elementId) => elementId != null && elementId !== "")
            .map(String),
    );
    const actionId = msg.actionId;
    const isAts = actionId === "ats_score";
    // Prefer category math over `rating × 10`:
    // - ATS uses fixed weights (avoids 96% → false 100%).
    // - rating / position use rubric maxes (avoids 100% bars + 90% badge
    //   when the model returns rating=9 with every category at full score).
    const percent = isAts
        ? (overallPercentFromCategories(categories, ATS_CATEGORY_WEIGHTS)
            ?? ratingToPercent(msg.rating))
        : (overallPercentFromRubric(categories) ?? ratingToPercent(msg.rating));

    const weakContent = categories.some((cat) => {
        const p = categoryPercent(cat);
        return p != null && p < WEAK_CATEGORY_RATIO * 100 && CONTENT_CATEGORY_IDS.has(cat.id);
    });
    const showAtsCta = actionId === "rating" || actionId === "position_rating";
    const showMatchCta = actionId === "ats_score";
    const showContentCta = actionId === "rating" && weakContent;

    const hasBody = percent != null || categories.length > 0
        || strengths.length > 0 || priorities.length > 0
        || jobRequirements.length > 0 || evidenceGaps.length > 0
        || showAtsCta || showMatchCta || showContentCta;
    if (!hasBody) return null;

    const atsBand = isAts ? atsReadabilityBand(percent) : null;

    return (
        <div className={classes.ratingDashboard}>
            {percent != null && (
                <div className={classes.ratingDashboardScore}>
                    <RatingBadge value={msg.rating} percent={percent} />
                    <div className={classes.ratingDashboardHeading}>
                        <span className={classes.ratingDashboardLabel}>
                            {isAts ? "Czytelność dla ATS" : "Ocena ogólna"}
                        </span>
                        {atsBand ? (
                            <span className={classes.ratingDashboardBand}>{atsBand}</span>
                        ) : null}
                    </div>
                </div>
            )}

            {isAts && (
                <p className={classes.atsDisclaimer}>
                    Ocena sprawdza strukturę i czytelność dokumentu. Różne systemy ATS mogą
                    interpretować CV inaczej.
                </p>
            )}

            {actionId === "position_rating" && msg.jobOffer && (
                <div className={classes.jobOfferSummary}>
                    <span className={classes.dashboardBlockLabel}>Analizowana oferta</span>
                    <strong>{msg.jobOffer.title || "Oferta z podanego źródła"}</strong>
                    {(msg.jobOffer.company || msg.jobOffer.location) && (
                        <span>{[msg.jobOffer.company, msg.jobOffer.location].filter(Boolean).join(" · ")}</span>
                    )}
                    {msg.jobOffer.source && (
                        <span>Źródło: {msg.jobOffer.source === "manual_fallback" ? "wklejony opis (fallback)" : msg.jobOffer.source}</span>
                    )}
                    {msg.jobOffer.fetch_warning && (
                        <span className={classes.jobOfferWarning}>{msg.jobOffer.fetch_warning}</span>
                    )}
                </div>
            )}

            {jobRequirements.length > 0 && (
                <div className={classes.dashboardBlock}>
                    <span className={classes.dashboardBlockLabel}>Wymagania oferty</span>
                    <ul className={classes.requirementList}>
                        {jobRequirements.map((item, index) => {
                            const statusLabel = requirementStatusLabel(item.match_status);
                            const evidenceElementIds = canvasEvidenceElementIds(item)
                                .filter((elementId) => currentCanvasElementIds.has(elementId));
                            const canHighlightEvidence = evidenceElementIds.length > 0;
                            const previewKey = `${msg.id || "job-match"}:${item.id || index}`;
                            const statusClassName = `${classes.requirementStatus} ${classes[`requirement_${item.match_status}`]}`;

                            return (
                                <li key={item.id || `${item.text}-${index}`}>
                                    {canHighlightEvidence ? (
                                        <button
                                            type="button"
                                            className={`${statusClassName} ${classes.requirementStatusInteractive}`}
                                            aria-label={`${statusLabel}. Pokaż dowody w CV dla wymagania: ${item.text}`}
                                            onPointerEnter={() => onShowEvidence?.(
                                                "pointer",
                                                previewKey,
                                                evidenceElementIds,
                                                item.match_status,
                                            )}
                                            onPointerLeave={() => onHideEvidence?.("pointer", previewKey)}
                                            onPointerCancel={() => onHideEvidence?.("pointer", previewKey)}
                                            onFocus={() => onShowEvidence?.(
                                                "focus",
                                                previewKey,
                                                evidenceElementIds,
                                                item.match_status,
                                            )}
                                            onClick={(event) => event.currentTarget.focus({ preventScroll: true })}
                                            onBlur={() => onHideEvidence?.("focus", previewKey)}
                                        >
                                            {statusLabel}
                                        </button>
                                    ) : (
                                        <span className={statusClassName}>{statusLabel}</span>
                                    )}
                                    <div>
                                        <strong>{item.text}</strong>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {evidenceGaps.length > 0 && (
                <div className={classes.dashboardBlock}>
                    <span className={classes.dashboardBlockLabel}>Luki w dowodach</span>
                    <ul className={classes.evidenceGapList}>
                        {evidenceGaps.map((item, index) => (
                            <li key={`${item.requirement_id || "gap"}-${index}`}>
                                <strong>{item.title}</strong>
                                {item.description ? <span>{item.description}</span> : null}
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        className={classes.dashboardCta}
                        disabled={ctaDisabled}
                        onClick={() => onOpenMatchJob?.()}
                    >
                        Uzupełnij fakty i przeanalizuj ponownie
                    </button>
                </div>
            )}

            {categories.length > 0 && (
                <ul className={classes.categoryList}>
                    {categories.map((cat) => {
                        const p = categoryPercent(cat);
                        return (
                            <li key={cat.id} className={classes.categoryRow}>
                                <div className={classes.categoryMeta}>
                                    <span>{cat.label}</span>
                                    <span>{p != null ? `${p}%` : "–"}</span>
                                </div>
                                <div className={classes.categoryTrack}>
                                    <div
                                        className={classes.categoryFill}
                                        style={{ width: `${p ?? 0}%` }}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {strengths.length > 0 && (
                <div className={classes.dashboardBlock}>
                    <span className={classes.dashboardBlockLabel}>Mocne strony</span>
                    <ul className={classes.strengthList}>
                        {strengths.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
            )}

            {priorities.length > 0 && (
                <div className={classes.dashboardBlock}>
                    <span className={classes.dashboardBlockLabel}>Najważniejsze do poprawy</span>
                    <ol className={classes.priorityList}>
                        {priorities.map((item, i) => (
                            <li key={i}>
                                <div className={classes.priorityBody}>
                                    <strong>{item.title}</strong>
                                    {item.description ? <span>{item.description}</span> : null}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {(showAtsCta || showContentCta || showMatchCta) && (
                <div className={classes.dashboardCtas}>
                    {showAtsCta && (
                        <button
                            type="button"
                            className={classes.dashboardCta}
                            disabled={ctaDisabled}
                            onClick={() => onRunAts?.()}
                        >
                            {actionId === "position_rating" ? "Sprawdź czytelność ATS" : "Sprawdź ATS"}
                        </button>
                    )}
                    {showContentCta && (
                        <button
                            type="button"
                            className={classes.dashboardCta}
                            disabled={ctaDisabled}
                            onClick={() => onOpenContentPanel?.()}
                        >
                            Popraw treść
                        </button>
                    )}
                    {showMatchCta && (
                        <button
                            type="button"
                            className={classes.dashboardCta}
                            disabled={ctaDisabled}
                            onClick={() => onOpenMatchJob?.()}
                        >
                            Dopasuj do oferty
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function correctionFieldLabel(field) {
    if (field === "content") return "treść";
    return field;
}

/**
 * Review card for grammar/style/improve patches.
 * Collapsed by default; pointer or keyboard focus expands the full Przed/Po
 * comparison in the chat's scroll context, so the composer cannot cover it.
 * Native `title` tooltips are intentionally omitted — long CV text must not
 * spawn a browser hover bubble over the strikethrough “Przed” line.
 */
function CorrectionCard({ msgId, patch, correctionStates, onAccept, onReject, A4_Elements }) {
    const cardRef = useRef(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const { element_id, ...fields } = patch;
    const el = A4_Elements.find(e => e.element_id === element_id);
    const state = correctionStates[`${msgId}_${element_id}`] || "pending";

    const expandForPointer = () => {
        setIsExpanded(true);

        // Keep the expanded card inside the chat's scroll area rather than
        // moving it into a detached overlay. Waiting for the next frame lets
        // the browser calculate the full Przed/Po height before scrolling.
        requestAnimationFrame(() => {
            const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            cardRef.current?.scrollIntoView({
                block: "nearest",
                inline: "nearest",
                behavior: reduceMotion ? "auto" : "smooth",
            });
        });
    };

    const collapseAfterPointerLeaves = () => {
        setIsExpanded(false);
    };

    const collapseAfterFocusLeaves = (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsExpanded(false);
        }
    };

    return (
        <div
            ref={cardRef}
            className={`${classes.corrCard} ${classes[`corr_${state}`]} ${isExpanded ? classes.corrCardExpanded : ""}`}
            onPointerEnter={expandForPointer}
            onPointerLeave={collapseAfterPointerLeaves}
            onFocus={() => setIsExpanded(true)}
            onBlur={collapseAfterFocusLeaves}
        >
            {Object.entries(fields).map(([field, newVal]) => {
                const oldVal = String(el?.[field] ?? "–");
                const nextVal = String(newVal ?? "–");
                return (
                    <div key={field} className={classes.diffRow}>
                        <span className={classes.diffField}>{correctionFieldLabel(field)}</span>
                        <div className={classes.diffCompare}>
                            <div className={classes.diffBlock} data-side="old">
                                <span className={classes.diffLabel}>Przed</span>
                                <span className={classes.diffOld}>{oldVal}</span>
                            </div>
                            <span className={classes.diffArrow} aria-hidden="true">→</span>
                            <div className={classes.diffBlock} data-side="new">
                                <span className={classes.diffLabel}>Po</span>
                                <span className={classes.diffNew}>{nextVal}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
            {state === "pending" && (
                <div className={classes.corrActions}>
                    <button className={classes.corrAccept} onClick={() => onAccept(msgId, patch)} title="Zastosuj">
                        <MdCheckCircle /> Akceptuj
                    </button>
                    <button className={classes.corrReject} onClick={() => onReject(msgId, element_id)} title="Odrzuć">
                        <MdCancel /> Odrzuć
                    </button>
                </div>
            )}
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "var(--color-success)" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "var(--color-muted)" }}>✗ Pominięto</span>}
        </div>
    );
}

function LayoutGroupCard({ msgId, group, layoutStates, onPreview, onClearPreview, onAccept, onReject }) {
    const key = `${msgId}_${group.id}`;
    const state = layoutStates[key] || "pending";
    const moves = group.patches?.length || 0;

    return (
        <div className={`${classes.layoutCard} ${classes[`layout_${state}`]}`}>
            <div className={classes.layoutCardHeader}>
                <span className={`${classes.layoutSeverity} ${classes[`severity_${group.severity}`]}`}>
                    {SEVERITY_LABELS[group.severity] ?? group.severity ?? SEVERITY_LABELS.review}
                </span>
                <span className={classes.layoutMoves}>{moves} {moves === 1 ? "przesunięcie" : moves < 5 ? "przesunięcia" : "przesunięć"}</span>
            </div>
            <strong>{group.title}</strong>
            <p>{group.reason}</p>
            {state === "pending" && (
                <div className={classes.layoutActions}>
                    <button className={classes.layoutPreview} onClick={() => onPreview(msgId, group)}>
                        Podgląd
                    </button>
                    <button className={classes.layoutAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Zastosuj
                    </button>
                    <button className={classes.layoutReject} onClick={() => onReject(msgId, group)}>
                        <MdCancel /> Pomiń
                    </button>
                </div>
            )}
            {state === "preview" && (
                <div className={classes.layoutActions}>
                    <span className={classes.previewingLabel}>Podgląd aktywny na płótnie</span>
                    <button className={classes.layoutAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Zastosuj
                    </button>
                    <button className={classes.layoutPreview} onClick={() => onClearPreview(msgId, group.id)}>
                        Zatrzymaj podgląd
                    </button>
                </div>
            )}
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "var(--color-success)" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "var(--color-muted)" }}>✗ Pominięto</span>}
        </div>
    );
}

function StructureGroupCard({ msgId, group, structureStates, onPreview, onClearPreview, onAccept, onReject }) {
    const key = `${msgId}_${group.id}`;
    const state = structureStates[key] || "pending";
    const addedCount = group.add_elements?.length || 0;
    const movedCount = group.patches?.length || 0;

    return (
        <div className={`${classes.structureCard} ${classes[`structure_${state}`]}`}>
            <div className={classes.structureCardHeader}>
                <span>Przebudowa sekcji</span>
                <span>{addedCount} nowych pól · {movedCount} przesunięć</span>
            </div>
            <strong>{group.title}</strong>
            <p>{group.reason}</p>
            {state === "pending" && (
                <div className={classes.layoutActions}>
                    <button className={classes.layoutPreview} onClick={() => onPreview(msgId, group)}>
                        Podgląd
                    </button>
                    <button className={classes.layoutAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Zastosuj
                    </button>
                    <button className={classes.layoutReject} onClick={() => onReject(msgId, group)}>
                        <MdCancel /> Pomiń
                    </button>
                </div>
            )}
            {state === "preview" && (
                <div className={classes.layoutActions}>
                    <span className={classes.previewingLabel}>Podgląd aktywny na płótnie</span>
                    <button className={classes.layoutAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Zastosuj
                    </button>
                    <button className={classes.layoutPreview} onClick={() => onClearPreview(msgId, group.id)}>
                        Zatrzymaj podgląd
                    </button>
                </div>
            )}
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "var(--color-success)" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "var(--color-muted)" }}>✗ Pominięto</span>}
        </div>
    );
}

function CloneGroupCard({ msgId, group, cloneStates, onPreview, onClearPreview, onAccept, onReject }) {
    const key = `${msgId}_${group.id}`;
    const state = cloneStates[key] || "pending";
    const addedCount = group.add_elements?.length || 0;

    return (
        <div className={`${classes.structureCard} ${classes[`structure_${state}`]}`}>
            <div className={classes.structureCardHeader}>
                <span>Klonowanie</span>
                <span>{addedCount} {addedCount === 1 ? "kopia" : "kopii"}</span>
            </div>
            <strong>{group.title}</strong>
            <p>{group.reason}</p>
            {state === "pending" && (
                <div className={classes.layoutActions}>
                    <button className={classes.layoutPreview} onClick={() => onPreview(msgId, group)}>
                        Podgląd
                    </button>
                    <button className={classes.layoutAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Zastosuj
                    </button>
                    <button className={classes.layoutReject} onClick={() => onReject(msgId, group)}>
                        <MdCancel /> Pomiń
                    </button>
                </div>
            )}
            {state === "preview" && (
                <div className={classes.layoutActions}>
                    <span className={classes.previewingLabel}>Podgląd aktywny na płótnie</span>
                    <button className={classes.layoutAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Zastosuj
                    </button>
                    <button className={classes.layoutPreview} onClick={() => onClearPreview(msgId, group.id)}>
                        Zatrzymaj podgląd
                    </button>
                </div>
            )}
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "var(--color-success)" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "var(--color-muted)" }}>✗ Pominięto</span>}
        </div>
    );
}

function DeletionGroupCard({ msgId, group, deletionStates, onPreview, onClearPreview, onAccept, onReject }) {
    const key = `${msgId}_${group.id}`;
    const state = deletionStates[key] || "pending";
    const count = group.remove_element_ids?.length || 0;

    return (
        <div className={`${classes.deletionCard} ${classes[`deletion_${state}`]}`}>
            <div className={classes.structureCardHeader}>
                <span>Usuwanie elementów</span>
                <span>{count} {count === 1 ? "element" : "elementów"}</span>
            </div>
            <strong>{group.title}</strong>
            <p>{group.reason}</p>
            {state === "pending" && (
                <div className={classes.layoutActions}>
                    <button className={classes.layoutPreview} onClick={() => onPreview(msgId, group)}>
                        Podgląd
                    </button>
                    <button className={classes.deleteAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Usuń
                    </button>
                    <button className={classes.layoutReject} onClick={() => onReject(msgId, group)}>
                        <MdCancel /> Pomiń
                    </button>
                </div>
            )}
            {state === "preview" && (
                <div className={classes.layoutActions}>
                    <span className={classes.previewingLabel}>Podgląd aktywny na płótnie</span>
                    <button className={classes.deleteAccept} onClick={() => onAccept(msgId, group)}>
                        <MdCheckCircle /> Usuń
                    </button>
                    <button className={classes.layoutPreview} onClick={() => onClearPreview(msgId, group.id)}>
                        Zatrzymaj podgląd
                    </button>
                </div>
            )}
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "var(--color-danger)" }}>✓ Usunięto</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "var(--color-muted)" }}>✗ Pominięto</span>}
        </div>
    );
}

function ChatMessage({
    msg,
    correctionStates,
    layoutStates,
    structureStates,
    deletionStates,
    cloneStates,
    onAccept,
    onReject,
    onApplyAll,
    onPreviewLayout,
    onClearLayoutPreview,
    onAcceptLayout,
    onRejectLayout,
    onPreviewStructure,
    onClearStructurePreview,
    onAcceptStructure,
    onRejectStructure,
    onPreviewDeletion,
    onClearDeletionPreview,
    onAcceptDeletion,
    onRejectDeletion,
    onPreviewClone,
    onClearClonePreview,
    onAcceptClone,
    onRejectClone,
    onOpenContentPanel,
    onRunAts,
    onOpenMatchJob,
    onShowEvidence,
    onHideEvidence,
    ctaDisabled,
    A4_Elements,
}) {
    const isUser = msg.role === "user";
    const pendingCount = (msg.corrections || []).filter(
        c => (correctionStates[`${msg.id}_${c.element_id}`] || "pending") === "pending"
    ).length;
    // Structured flows may send fuller context while the bubble keeps a concise
    // label via displayText, so the user still sees what they commissioned.
    const visibleText = msg.displayText || msg.text;
    const hasDashboard = !isUser && (
        typeof msg.rating === "number"
        || (msg.categories?.length > 0)
        || (msg.strengths?.length > 0)
        || (msg.priorities?.length > 0)
        || (msg.jobRequirements?.length > 0)
        || (msg.evidenceGaps?.length > 0)
        || msg.actionId === "rating"
        || msg.actionId === "ats_score"
        || msg.actionId === "position_rating"
    );

    return (
        <div className={`${classes.msgWrap} ${isUser ? classes.msgUser : classes.msgAssistant}`}>
            {!isUser && (
                <div className={classes.msgIcon}><BsStars /></div>
            )}
            <div className={classes.msgBubble}>
                {/* action label */}
                {msg.actionLabel && !isUser && (
                    <div className={classes.msgAction} style={{ color: msg.actionColor }}>
                        {msg.actionLabel}
                    </div>
                )}

                {/* Lead summary first, then structured score card — reads as prose → details. */}
                {visibleText ? (
                    <p className={`${classes.msgText} ${!isUser ? classes.msgTextAssistant : ""}`}>
                        {visibleText}
                    </p>
                ) : null}

                {hasDashboard && (
                    <RatingDashboard
                        msg={msg}
                        A4_Elements={A4_Elements}
                        onShowEvidence={onShowEvidence}
                        onHideEvidence={onHideEvidence}
                        onOpenContentPanel={onOpenContentPanel}
                        onRunAts={onRunAts}
                        onOpenMatchJob={onOpenMatchJob}
                        ctaDisabled={ctaDisabled}
                    />
                )}

                {/* Tips under the dashboard; skip when priorities already cover the same ground. */}
                {msg.tips?.length > 0 && !(hasDashboard && msg.priorities?.length > 0) && (
                    <div className={classes.tipsBlock}>
                        <span className={classes.tipsBlockLabel}>Wskazówki</span>
                        <ul className={classes.tips}>
                            {msg.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                        </ul>
                    </div>
                )}

                {/* correction cards */}
                {msg.corrections?.length > 0 && (
                    <div className={classes.corrections}>
                        <div className={classes.corrHeader}>
                            <span>{msg.corrections.length} {msg.corrections.length === 1 ? "poprawka" : msg.corrections.length < 5 ? "poprawki" : "poprawek"}</span>
                            {pendingCount > 0 && (
                                <button className={classes.applyAll} onClick={() => onApplyAll(msg.id, msg.corrections)}>
                                    Zastosuj wszystkie ({pendingCount})
                                </button>
                            )}
                        </div>
                        {msg.corrections.map(patch => (
                            <CorrectionCard
                                key={patch.element_id}
                                msgId={msg.id}
                                patch={patch}
                                correctionStates={correctionStates}
                                onAccept={onAccept}
                                onReject={onReject}
                                A4_Elements={A4_Elements}
                            />
                        ))}
                    </div>
                )}

                {/* reviewed layout groups */}
                {msg.layout_groups?.length > 0 && (
                    <div className={classes.layoutGroups}>
                        <div className={classes.corrHeader}>
                            <span>{msg.layout_groups.length} {msg.layout_groups.length === 1 ? "sugestia układu" : msg.layout_groups.length < 5 ? "sugestie układu" : "sugestii układu"}</span>
                        </div>
                        {msg.layout_groups.map(group => (
                            <LayoutGroupCard
                                key={group.id}
                                msgId={msg.id}
                                group={group}
                                layoutStates={layoutStates}
                                onPreview={onPreviewLayout}
                                onClearPreview={onClearLayoutPreview}
                                onAccept={onAcceptLayout}
                                onReject={onRejectLayout}
                            />
                        ))}
                    </div>
                )}

                {msg.structure_groups?.length > 0 && (
                    <div className={classes.layoutGroups}>
                        <div className={classes.corrHeader}>
                            <span>{msg.structure_groups.length} {msg.structure_groups.length === 1 ? "propozycja przebudowy" : "propozycje przebudowy"}</span>
                        </div>
                        {msg.structure_groups.map(group => (
                            <StructureGroupCard
                                key={group.id}
                                msgId={msg.id}
                                group={group}
                                structureStates={structureStates}
                                onPreview={onPreviewStructure}
                                onClearPreview={onClearStructurePreview}
                                onAccept={onAcceptStructure}
                                onReject={onRejectStructure}
                            />
                        ))}
                    </div>
                )}

                {msg.clone_groups?.length > 0 && (
                    <div className={classes.layoutGroups}>
                        <div className={classes.corrHeader}>
                            <span>{msg.clone_groups.length} {msg.clone_groups.length === 1 ? "propozycja klonowania" : "propozycje klonowania"}</span>
                        </div>
                        {msg.clone_groups.map(group => (
                            <CloneGroupCard
                                key={group.id}
                                msgId={msg.id}
                                group={group}
                                cloneStates={cloneStates}
                                onPreview={onPreviewClone}
                                onClearPreview={onClearClonePreview}
                                onAccept={onAcceptClone}
                                onReject={onRejectClone}
                            />
                        ))}
                    </div>
                )}

                {msg.deletion_groups?.length > 0 && (
                    <div className={classes.layoutGroups}>
                        <div className={classes.corrHeader}>
                            <span>{msg.deletion_groups.length} {msg.deletion_groups.length === 1 ? "propozycja usunięcia" : "propozycje usunięcia"}</span>
                        </div>
                        {msg.deletion_groups.map(group => (
                            <DeletionGroupCard
                                key={group.id}
                                msgId={msg.id}
                                group={group}
                                deletionStates={deletionStates}
                                onPreview={onPreviewDeletion}
                                onClearPreview={onClearDeletionPreview}
                                onAccept={onAcceptDeletion}
                                onReject={onRejectDeletion}
                            />
                        ))}
                    </div>
                )}

                {msg.layout_issues?.length > 0 && (
                    <ul className={classes.layoutIssues}>
                        {msg.layout_issues.map((issue, index) => <li key={index}>{issue.message}</li>)}
                    </ul>
                )}
                {msg.structure_issues?.length > 0 && (
                    <ul className={classes.layoutIssues}>
                        {msg.structure_issues.map((issue, index) => <li key={index}>{issue.message}</li>)}
                    </ul>
                )}
                {msg.deletion_issues?.length > 0 && (
                    <ul className={classes.layoutIssues}>
                        {msg.deletion_issues.map((issue, index) => <li key={index}>{issue.message}</li>)}
                    </ul>
                )}

                {/* web sources */}
                {msg.web_sources?.length > 0 && (
                    <div className={classes.sources}>
                        <span className={classes.sourcesLabel}>Źródła:</span>
                        {msg.web_sources.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={classes.sourceLink}>
                                {new URL(url).hostname}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── main component ────────────────────────────────────────────────────────

export default function AiAssistant() {
    const reduceMotion = useReducedMotion();
    const {
        sessionKey,
        captureDocumentScope,
        isDocumentScopeCurrent,
    } = useDocumentLifecycle();
    const {
        A4_Elements,
        activeCvData,
        editElementValues,
        setActiveCvData,
        collapseSpilledMainIntoSidebar,
        applyLayoutPatches,
        applyStructureOperation,
        applyCloneOperation,
        applyDeleteOperation,
        setLayoutPreviewPatches,
        setStructurePreviewGroup,
        setDeletionPreviewIds,
        setAiCorrectionHighlights,
        pageSize,
        setCurrentPage,
    } = useCanvasContext();
    const {
        entitlements,
        refreshEntitlements,
    } = useSession();
    const {
        assistantAction,
    } = useUiSurfaces();

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [jobDesc, setJobDesc] = useState("");
    const [jobOfferUrl, setJobOfferUrl] = useState("");
    const [candidateNotes, setCandidateNotes] = useState("");
    const [jobUrlError, setJobUrlError] = useState("");
    // Goal submenu: improve_content | translate | match_job | null
    const [activePanel, setActivePanel] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [correctionStates, setCorrectionStates] = useState({});
    const [layoutStates, setLayoutStates] = useState({});
    const [structureStates, setStructureStates] = useState({});
    const [deletionStates, setDeletionStates] = useState({});
    const [cloneStates, setCloneStates] = useState({});
    // Pointer and keyboard previews are independent. Pointer hover temporarily
    // wins, then a still-focused status resumes without requiring another Tab.
    const [pointerJobEvidencePreview, setPointerJobEvidencePreview] = useState(null);
    const [focusJobEvidencePreview, setFocusJobEvidencePreview] = useState(null);
    // Detected (or user-overridden) CV language. Empty until the first backend
    // response reports one; the selector then reflects it. Sent with content
    // actions so corrections come back in the CV language, not always Polish.
    const [cvLanguage, setCvLanguage] = useState("");

    const messagesRef = useRef(null);
    const inputRef = useRef(null);
    const fabRef = useRef(null);
    // Synchronous in-flight guard: React state `isLoading` updates too late to
    // block a double-click on suggestion chips before the next render.
    const requestInFlightRef = useRef(false);
    // Bumped when the complete editor document changes so a late assistant
    // response from the previous session cannot re-populate a cleared chat.
    const chatSessionRef = useRef(0);

    /**
     * Show only evidence that still belongs to the currently open CV.
     *
     * A result can remain in chat while the user edits the document. Filtering
     * again here prevents a stale API reference from targeting another session,
     * and the source key prevents an older badge from clearing a newer preview.
     */
    const showJobEvidence = useCallback((channel, sourceKey, elementIds, matchStatus) => {
        const currentElementIds = new Set(
            (Array.isArray(A4_Elements) ? A4_Elements : [])
                .map((element) => element?.element_id)
                .filter((elementId) => elementId != null && elementId !== "")
                .map(String),
        );
        const kind = matchStatus === "matched" ? "evidence_matched" : "evidence_partial";
        const highlights = [...new Set((elementIds || []).map(String))]
            .filter((elementId) => currentElementIds.has(elementId))
            .map((elementId) => ({ elementId, kind }));

        const preview = highlights.length > 0 ? { sourceKey, highlights } : null;
        if (channel === "focus") {
            setFocusJobEvidencePreview(preview);
        } else {
            setPointerJobEvidencePreview(preview);
        }
    }, [A4_Elements]);

    const hideJobEvidence = useCallback((channel, sourceKey) => {
        const clearMatchingPreview = (current) => (
            current?.sourceKey === sourceKey ? null : current
        );
        if (channel === "focus") {
            setFocusJobEvidencePreview(clearMatchingPreview);
        } else {
            setPointerJobEvidencePreview(clearMatchingPreview);
        }
    }, []);

    const activeJobEvidencePreview = pointerJobEvidencePreview ?? focusJobEvidencePreview;

    useLayoutEffect(() => {
        const messageList = messagesRef.current;
        if (!isOpen || !messageList) return;

        // React can append a user bubble, mount the typing indicator, append
        // the reply, and remove the indicator in quick succession. A smooth
        // scroll scheduled for the next frame can then target geometry that no
        // longer exists and leave the conversation painted above a blank area.
        // Commit the bounded list's final position before paint instead. This
        // never scrolls the fixed panel, page, header, actions, or composer.
        messageList.scrollTop = Math.max(
            0,
            messageList.scrollHeight - messageList.clientHeight,
        );
    }, [isLoading, isOpen, messages]);

    useLayoutEffect(() => {
        const editorShell = document.querySelector(".main-container");
        const canvasArea = editorShell?.querySelector(".canvas-area");
        if (!editorShell || !canvasArea) return undefined;

        // The assistant remains an overlay: only a single A4 page is shifted,
        // and only while enough background exists to keep contextual controls
        // clear of both the chat and the full-height application sidebar.
        // On compact layouts and two-page spreads CSS deliberately ignores the
        // offset so the current document task keeps the full scrollable canvas.
        if (!isOpen) {
            editorShell.removeAttribute("data-ai-assistant-open");
            canvasArea.style.removeProperty("--ai-assistant-canvas-shift");
            return undefined;
        }

        editorShell.setAttribute("data-ai-assistant-open", "true");
        const panel = document.getElementById("ai-assistant-panel");
        const singlePageHost = canvasArea.querySelector(".canvas-single");
        const page = singlePageHost?.querySelector("[data-page-canvas]");
        const pageWrapper = page?.parentElement;

        const updateCanvasShift = () => {
            if (!panel || !singlePageHost || !page) {
                canvasArea.style.setProperty("--ai-assistant-canvas-shift", "0px");
                return;
            }

            const canvasRect = canvasArea.getBoundingClientRect();
            const hostRect = singlePageHost.getBoundingClientRect();
            const pageRect = page.getBoundingClientRect();
            const panelWidth = panel.getBoundingClientRect().width;
            // Page-to-host distance is invariant while the host translates.
            // Rebuild the unshifted position from scrollLeft instead of the
            // animated visual X; an observer callback during the transition
            // therefore cannot feed a partial transform into the next offset.
            const unshiftedHostLeft = canvasRect.left - canvasArea.scrollLeft;
            const basePageLeft = unshiftedHostLeft + (pageRect.left - hostRect.left);
            const basePageRight = basePageLeft + pageRect.width;
            const finalPanelLeft = canvasRect.right - panelWidth;
            const desiredShift = Math.max(
                0,
                basePageRight + CANVAS_CONTEXT_CLEARANCE_PX - finalPanelLeft,
            );
            const maximumShift = Math.max(
                0,
                basePageLeft - canvasRect.left - CANVAS_CONTEXT_CLEARANCE_PX,
            );
            const nextShift = Math.min(desiredShift, maximumShift);
            canvasArea.style.setProperty(
                "--ai-assistant-canvas-shift",
                `${Math.round(nextShift * 100) / 100}px`,
            );
        };

        updateCanvasShift();
        const resizeObserver = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(updateCanvasShift)
            : null;
        resizeObserver?.observe(canvasArea);
        if (panel) resizeObserver?.observe(panel);
        if (pageWrapper) resizeObserver?.observe(pageWrapper);
        window.addEventListener("resize", updateCanvasShift);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener("resize", updateCanvasShift);
            editorShell.removeAttribute("data-ai-assistant-open");
            canvasArea.style.removeProperty("--ai-assistant-canvas-shift");
        };
    }, [isOpen]);

    // A document epoch covers saved-document opens, new/imported documents,
    // template regeneration and guest restoration. Reset every assistant-owned
    // state so review cards can never target element ids from another epoch.
    useEffect(() => {
        chatSessionRef.current += 1;
        requestInFlightRef.current = false;
        setIsLoading(false);
        setMessages([]);
        setInput("");
        setJobDesc("");
        setJobOfferUrl("");
        setCandidateNotes("");
        setJobUrlError("");
        setActivePanel(null);
        setCorrectionStates({});
        setLayoutStates({});
        setStructureStates({});
        setDeletionStates({});
        setCloneStates({});
        setPointerJobEvidencePreview(null);
        setFocusJobEvidencePreview(null);
        // Patches / deletion ids are arrays in PdfCanvas state — never null
        // (preview useMemo reads `.length` without a null guard).
        setLayoutPreviewPatches?.([]);
        setStructurePreviewGroup?.(null);
        setDeletionPreviewIds?.([]);
        setAiCorrectionHighlights?.([]);
    }, [
        sessionKey,
        setAiCorrectionHighlights,
        setDeletionPreviewIds,
        setLayoutPreviewPatches,
        setStructurePreviewGroup,
    ]);

    // Keep A4 marks in sync with every pending review category. A temporary job
    // evidence preview intentionally replaces those marks so the hovered/focused
    // requirement has one unambiguous visual answer. Pending marks return as soon
    // as the evidence control loses both hover and focus.
    useEffect(() => {
        if (!isOpen) {
            setAiCorrectionHighlights?.([]);
            return;
        }
        const pendingHighlights = collectPendingAiHighlights({
            messages,
            correctionStates,
            layoutStates,
            structureStates,
            deletionStates,
            cloneStates,
        });
        setAiCorrectionHighlights?.(
            activeJobEvidencePreview?.highlights?.length > 0
                ? activeJobEvidencePreview.highlights
                : pendingHighlights,
        );
    }, [
        isOpen,
        messages,
        correctionStates,
        layoutStates,
        structureStates,
        deletionStates,
        cloneStates,
        activeJobEvidencePreview,
        setAiCorrectionHighlights,
    ]);

    useEffect(() => {
        if (!isOpen) {
            setPointerJobEvidencePreview(null);
            setFocusJobEvidencePreview(null);
        }
    }, [isOpen]);

    useEffect(() => () => setAiCorrectionHighlights?.([]), [setAiCorrectionHighlights]);

    useEffect(() => {
        const textarea = inputRef.current;
        if (!textarea) return;

        // Keep short prompts comfortably two lines high and grow longer prompts
        // only until the composer reaches its scrolling limit.
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 136)}px`;
    }, [input]);

    // ── correction handlers ──────────────────────────────────────────────

    const acceptCorrection = useCallback((msgId, patch) => {
        const { element_id, ...fields } = patch;
        const previousElement = A4_Elements.find((element) => element.element_id === element_id);
        const targetExists = Boolean(previousElement);
        if (!targetExists) return;
        const safeFields = withoutEmptyContentReplacement(
            fields,
            messages.find((message) => message.id === msgId)?.actionId === "shorten",
        );
        if (Object.keys(safeFields).length === 0) {
            setCorrectionStates(prev => ({ ...prev, [`${msgId}_${element_id}`]: "rejected" }));
            return;
        }
        // AI content may target an off-page textarea. Mark it as changed rather
        // than preserving its generator placeholder height, so its first mount
        // can grow to the full generated summary instead of clipping it.
        const nextFields = "content" in safeFields
            ? { ...safeFields, preserveInitialLayout: false }
            : safeFields;
        editElementValues(nextFields, element_id);
        if ("content" in nextFields) {
            // Update the source profile at acceptance time, not only through
            // PdfCanvas's render effect. Several AI cards can be accepted in
            // one event while reflow replaces the canvas array, which can
            // otherwise make the next template fill use stale language.
            setActiveCvData((currentProfile) => syncCvDataFromCanvas(
                currentProfile,
                [previousElement],
                [{ ...previousElement, ...nextFields }],
            ));
        }
        setCorrectionStates(prev => ({ ...prev, [`${msgId}_${element_id}`]: "accepted" }));
        collapseSpilledMainIntoSidebar?.();
    }, [A4_Elements, collapseSpilledMainIntoSidebar, editElementValues, messages, setActiveCvData]);

    const rejectCorrection = useCallback((msgId, element_id) => {
        setCorrectionStates(prev => ({ ...prev, [`${msgId}_${element_id}`]: "rejected" }));
    }, []);

    const applyAll = useCallback((msgId, corrections) => {
        const acceptedIds = [];
        corrections.forEach(patch => {
            const key = `${msgId}_${patch.element_id}`;
            const previousElement = A4_Elements.find(
                (element) => element.element_id === patch.element_id,
            );
            if (previousElement && (correctionStates[key] || "pending") === "pending") {
                const { element_id, ...fields } = patch;
                const safeFields = withoutEmptyContentReplacement(
                    fields,
                    messages.find((message) => message.id === msgId)?.actionId === "shorten",
                );
                if (Object.keys(safeFields).length === 0) return;
                const nextFields = "content" in safeFields
                    ? { ...safeFields, preserveInitialLayout: false }
                    : safeFields;
                editElementValues(nextFields, element_id);
                if ("content" in nextFields) {
                    // Use a functional profile update so every accepted card
                    // is applied to the result of the previous card rather
                    // than to the stale profile captured by this render.
                    setActiveCvData((currentProfile) => syncCvDataFromCanvas(
                        currentProfile,
                        [previousElement],
                        [{ ...previousElement, ...nextFields }],
                    ));
                }
                acceptedIds.push(element_id);
            }
        });
        const newStates = {};
        acceptedIds.forEach((element_id) => {
            newStates[`${msgId}_${element_id}`] = "accepted";
        });
        setCorrectionStates(prev => ({ ...prev, ...newStates }));
        const message = messages.find((item) => item.id === msgId);
        if (
            acceptedIds.length > 0
            && message?.updatedCvData
            && message.actionId !== "position_rating"
        ) {
            // Profile-aware content actions return the exact structure that
            // later template fills consume. Apply it atomically only after the
            // user accepts all review cards, preserving the reject workflow.
            // Job tailoring is excluded because its profile payload may also
            // contain a card the user rejected; accepted job cards are synced
            // individually from the canvas above.
            setActiveCvData(message.updatedCvData);
        }
        collapseSpilledMainIntoSidebar?.();
    }, [A4_Elements, collapseSpilledMainIntoSidebar, correctionStates, editElementValues, messages, setActiveCvData]);

    const previewLayoutGroup = useCallback((msgId, group) => {
        setStructurePreviewGroup(null);
        setDeletionPreviewIds([]);
        setStructureStates((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, state]) => [key, state === "preview" ? "pending" : state]),
        ));
        setLayoutPreviewPatches(group.patches || []);
        const targetPage = group.target_page
            ?? group.patches?.find(patch => Number.isInteger(patch.page))?.page;
        if (Number.isInteger(targetPage) && targetPage > 0) setCurrentPage(targetPage);
        setLayoutStates(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(key => {
                if (next[key] === "preview") next[key] = "pending";
            });
            next[`${msgId}_${group.id}`] = "preview";
            return next;
        });
    }, [setCurrentPage, setDeletionPreviewIds, setLayoutPreviewPatches, setStructurePreviewGroup]);

    const clearLayoutPreview = useCallback((msgId, groupId) => {
        setLayoutPreviewPatches([]);
        setLayoutStates(prev => {
            const key = `${msgId}_${groupId}`;
            return prev[key] === "preview" ? { ...prev, [key]: "pending" } : prev;
        });
    }, [setLayoutPreviewPatches]);

    const acceptLayoutGroup = useCallback((msgId, group) => {
        applyLayoutPatches(group.patches || []);
        setLayoutPreviewPatches([]);
        setLayoutStates(prev => ({ ...prev, [`${msgId}_${group.id}`]: "accepted" }));
    }, [applyLayoutPatches, setLayoutPreviewPatches]);

    const rejectLayoutGroup = useCallback((msgId, group) => {
        const key = `${msgId}_${group.id}`;
        if (layoutStates[key] === "preview") setLayoutPreviewPatches([]);
        setLayoutStates(prev => ({ ...prev, [key]: "rejected" }));
    }, [layoutStates, setLayoutPreviewPatches]);

    const previewStructureGroup = useCallback((msgId, group) => {
        setLayoutPreviewPatches([]);
        setDeletionPreviewIds([]);
        setCloneStates((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, state]) => [key, state === "preview" ? "pending" : state]),
        ));
        setLayoutStates((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, state]) => [key, state === "preview" ? "pending" : state]),
        ));
        setStructurePreviewGroup(group);
        if (Number.isInteger(group.target_page) && group.target_page > 0) setCurrentPage(group.target_page);
        setStructureStates((previous) => {
            const next = { ...previous };
            Object.keys(next).forEach((key) => {
                if (next[key] === "preview") next[key] = "pending";
            });
            next[`${msgId}_${group.id}`] = "preview";
            return next;
        });
    }, [setCurrentPage, setDeletionPreviewIds, setLayoutPreviewPatches, setStructurePreviewGroup]);

    const clearStructurePreview = useCallback((msgId, groupId) => {
        setStructurePreviewGroup(null);
        setStructureStates((previous) => {
            const key = `${msgId}_${groupId}`;
            return previous[key] === "preview" ? { ...previous, [key]: "pending" } : previous;
        });
    }, [setStructurePreviewGroup]);

    const acceptStructureGroup = useCallback((msgId, group) => {
        applyStructureOperation(group);
        setStructurePreviewGroup(null);
        setStructureStates((previous) => ({ ...previous, [`${msgId}_${group.id}`]: "accepted" }));
    }, [applyStructureOperation, setStructurePreviewGroup]);

    const rejectStructureGroup = useCallback((msgId, group) => {
        const key = `${msgId}_${group.id}`;
        if (structureStates[key] === "preview") setStructurePreviewGroup(null);
        setStructureStates((previous) => ({ ...previous, [key]: "rejected" }));
    }, [setStructurePreviewGroup, structureStates]);

    const previewDeletionGroup = useCallback((msgId, group) => {
        setLayoutPreviewPatches([]);
        setStructurePreviewGroup(null);
        setCloneStates((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, state]) => [key, state === "preview" ? "pending" : state]),
        ));
        setDeletionPreviewIds(group.remove_element_ids || []);
        if (Number.isInteger(group.target_page) && group.target_page > 0) setCurrentPage(group.target_page);
        setDeletionStates((previous) => {
            const next = { ...previous };
            Object.keys(next).forEach((key) => {
                if (next[key] === "preview") next[key] = "pending";
            });
            next[`${msgId}_${group.id}`] = "preview";
            return next;
        });
    }, [setCurrentPage, setDeletionPreviewIds, setLayoutPreviewPatches, setStructurePreviewGroup]);

    const clearDeletionPreview = useCallback((msgId, groupId) => {
        setDeletionPreviewIds([]);
        setDeletionStates((previous) => {
            const key = `${msgId}_${groupId}`;
            return previous[key] === "preview" ? { ...previous, [key]: "pending" } : previous;
        });
    }, [setDeletionPreviewIds]);

    const acceptDeletionGroup = useCallback((msgId, group) => {
        applyDeleteOperation(group);
        setDeletionPreviewIds([]);
        setDeletionStates((previous) => ({ ...previous, [`${msgId}_${group.id}`]: "accepted" }));
    }, [applyDeleteOperation, setDeletionPreviewIds]);

    const rejectDeletionGroup = useCallback((msgId, group) => {
        const key = `${msgId}_${group.id}`;
        if (deletionStates[key] === "preview") setDeletionPreviewIds([]);
        setDeletionStates((previous) => ({ ...previous, [key]: "rejected" }));
    }, [deletionStates, setDeletionPreviewIds]);

    // Clone preview reuses structurePreviewGroup (add_elements only, empty removes).
    const previewCloneGroup = useCallback((msgId, group) => {
        setLayoutPreviewPatches([]);
        setDeletionPreviewIds([]);
        setStructureStates((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, state]) => [key, state === "preview" ? "pending" : state]),
        ));
        setLayoutStates((previous) => Object.fromEntries(
            Object.entries(previous).map(([key, state]) => [key, state === "preview" ? "pending" : state]),
        ));
        setStructurePreviewGroup(group);
        const firstPage = group.add_elements?.[0]?.page;
        if (Number.isInteger(firstPage) && firstPage > 0) setCurrentPage(firstPage);
        setCloneStates((previous) => {
            const next = { ...previous };
            Object.keys(next).forEach((key) => {
                if (next[key] === "preview") next[key] = "pending";
            });
            next[`${msgId}_${group.id}`] = "preview";
            return next;
        });
    }, [setCurrentPage, setDeletionPreviewIds, setLayoutPreviewPatches, setStructurePreviewGroup]);

    const clearClonePreview = useCallback((msgId, groupId) => {
        setStructurePreviewGroup(null);
        setCloneStates((previous) => {
            const key = `${msgId}_${groupId}`;
            return previous[key] === "preview" ? { ...previous, [key]: "pending" } : previous;
        });
    }, [setStructurePreviewGroup]);

    const acceptCloneGroup = useCallback((msgId, group) => {
        applyCloneOperation(group);
        setStructurePreviewGroup(null);
        setCloneStates((previous) => ({ ...previous, [`${msgId}_${group.id}`]: "accepted" }));
    }, [applyCloneOperation, setStructurePreviewGroup]);

    const rejectCloneGroup = useCallback((msgId, group) => {
        const key = `${msgId}_${group.id}`;
        if (cloneStates[key] === "preview") setStructurePreviewGroup(null);
        setCloneStates((previous) => ({ ...previous, [key]: "rejected" }));
    }, [cloneStates, setStructurePreviewGroup]);

    // ── send message to backend ──────────────────────────────────────────

    const send = useCallback(async (action, userText, options = {}) => {
        // Prefer the ref over `isLoading` so a second chip click in the same
        // frame cannot start a parallel request that fails after the first
        // succeeds and leaves a confusing success+error pair in the chat.
        if (requestInFlightRef.current || isLoading) return;
        setPointerJobEvidencePreview(null);
        setFocusJobEvidencePreview(null);
        requestInFlightRef.current = true;
        // Capture before await: a template change mid-flight increments the
        // session and must discard both success and error bubbles for that call.
        const sessionAtStart = chatSessionRef.current;
        const documentScope = captureDocumentScope();
        // ApiClient performs transport retries internally. Keeping this client
        // and key local to one `send` call guarantees every retry is deduplicated
        // by the backend while a later user action receives a fresh key.
        const idempotencyKey = globalThis.crypto?.randomUUID?.() || nanoid();
        const operationApi = new ApiClient({
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
            "Idempotency-Key": idempotencyKey,
        });

        const history = messages
            .filter((m) => (m.role === "user" || m.role === "assistant") && m.text)
            .slice(-12)
            .map((m) => ({
                role: m.role,
                content: String(m.text).slice(0, 1500),
            }));

        const usesMessage = action === "chat";
        const userMsg = {
            id: nanoid(),
            role: "user",
            text: userText,
            sourceRevision: documentScope.revision,
            sourceSessionKey: String(documentScope.epoch),
            ...(options.displayText ? { displayText: options.displayText } : {}),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            // Warm the Render dyno before the provider call.
            wakeBackend();
            const actionMeta = ACTION_META[action] || { label: action, color: CHROME_ACCENT };
            const timeoutMs = 120_000;
            const targetLanguage = options.target_language || "";
            // Every action that rewrites CV content, including translation,
            // must carry the canonical profile. The backend then returns the
            // exact `updated_cv_data` consumed by a later template fill.
            // An explicit language option wins; otherwise reuse the last
            // detected/selected language. Empty lets the backend auto-detect.
            const cvLanguageOverride = options.cv_language || cvLanguage;
            const contentActions = ["grammar", "language", "improve", "shorten", "translate", "position_rating"];
            const res = await operationApi.httpRequest(
                ENDPOINTS.AI.ASSISTANT, "POST",
                JSON.stringify({
                    action,
                    elements: measureElements(A4_Elements),
                    message: usesMessage ? userText : "",
                    job_description: action === "position_rating" ? jobDesc : "",
                    job_offer_url: action === "position_rating" ? jobOfferUrl : "",
                    candidate_notes: action === "position_rating" ? candidateNotes : "",
                    page_size: pageSize,
                    history: usesMessage ? history : [],
                    ...(action === "translate" && targetLanguage
                        ? { target_language: targetLanguage }
                        : {}),
                    ...(contentActions.includes(action) && activeCvData
                        ? { cv_data: activeCvData }
                        : {}),
                    ...(cvLanguageOverride && contentActions.includes(action)
                        ? { cv_language: cvLanguageOverride }
                        : {}),
                }),
                "Asystent AI nie odpowiedział",
                {
                    timeoutMs,
                    // Retry cold-start / proxy blips only, not client AbortError timeouts.
                    retries: 3,
                    retryDelayMs: 2_500,
                    retryOnTimeout: false,
                },
            );

            if (
                chatSessionRef.current !== sessionAtStart
                || !isDocumentScopeCurrent(documentScope, { requireSameRevision: true })
            ) return;

            // Keep the selector aligned with the language the backend used.
            if (res.cv_language && res.cv_language !== cvLanguage) {
                setCvLanguage(res.cv_language);
            }

            if (res.usage) {
                console.log("[GPT API cost]", {
                    action,
                    model: res.usage.model,
                    prompt_tokens: res.usage.prompt_tokens,
                    completion_tokens: res.usage.completion_tokens,
                    total_tokens: res.usage.total_tokens,
                    cost_usd: res.usage.cost_usd,
                    cost_pln_estimate: res.usage.cost_pln_estimate,
                    credits_charged: res.usage.credits_charged,
                    credit_pln: res.usage.credit_pln,
                    rates_usd_per_1m: res.usage.rates_usd_per_1m,
                    service_tier: res.usage.service_tier,
                });
            }

            const assistantMsg = {
                id: nanoid(),
                role: "assistant",
                text: res.message,
                rating: res.rating ?? null,
                tips: res.tips ?? [],
                corrections: res.corrections ?? [],
                categories: res.categories ?? [],
                strengths: res.strengths ?? [],
                priorities: res.priorities ?? [],
                jobOffer: res.job_offer ?? null,
                jobRequirements: res.job_requirements ?? [],
                evidenceGaps: res.evidence_gaps ?? [],
                layout_groups: res.layout_groups ?? [],
                layout_issues: res.layout_issues ?? [],
                structure_groups: res.structure_groups ?? [],
                structure_issues: res.structure_issues ?? [],
                deletion_groups: res.deletion_groups ?? [],
                deletion_issues: res.deletion_issues ?? [],
                clone_groups: res.clone_groups ?? [],
                clone_issues: res.clone_issues ?? [],
                web_sources: res.web_sources ?? [],
                usage: res.usage ?? null,
                actionId: action,
                actionLabel: actionMeta?.label,
                actionColor: actionMeta?.color,
                updatedCvData: res.updated_cv_data ?? null,
                sourceRevision: documentScope.revision,
                sourceSessionKey: String(documentScope.epoch),
            };
            setMessages(prev => [...prev, assistantMsg]);
            // Refresh balance outside the main try so a entitlements blip cannot
            // append a fake "assistant unavailable" error under a good answer.
            try {
                await refreshEntitlements?.();
            } catch {
                /* ignore — credits UI can stay stale until the next refresh */
            }
        } catch (err) {
            if (
                chatSessionRef.current !== sessionAtStart
                || !isDocumentScopeCurrent(documentScope, { requireSameRevision: true })
            ) return;
            setMessages(prev => [...prev, {
                id: nanoid(),
                role: "assistant",
                text: `Błąd: ${err.message}`,
                tips: [],
                corrections: [],
                web_sources: [],
                sourceRevision: documentScope.revision,
                sourceSessionKey: String(documentScope.epoch),
            }]);
        } finally {
            requestInFlightRef.current = false;
            setIsLoading(false);
        }
    }, [A4_Elements, activeCvData, candidateNotes, captureDocumentScope, cvLanguage, isDocumentScopeCurrent, isLoading, jobDesc, jobOfferUrl, messages, pageSize, refreshEntitlements]);

    const handleGoalAction = useCallback((goalId) => {
        const goal = GOAL_ACTIONS.find((g) => g.id === goalId);
        if (!goal) return;

        if (goalId === "check_cv") {
            setActivePanel(null);
            send("rating", goal.label);
            return;
        }

        if (goal.panel) {
            // Toggle the same panel closed; switch panels otherwise.
            setActivePanel((prev) => (prev === goal.panel ? null : goal.panel));
            return;
        }

        send(goalId, goal.label);
    }, [send]);

    const handleContentSubaction = useCallback((actionId) => {
        const meta = CONTENT_SUBACTIONS.find((a) => a.id === actionId);
        setActivePanel(null);
        send(actionId, meta?.label || actionId);
    }, [send]);

    const handleTranslateLanguage = useCallback((lang) => {
        setActivePanel(null);
        send("translate", `Przetłumacz CV na: ${lang.label}`, {
            displayText: `Przetłumacz → ${lang.label}`,
            target_language: lang.code,
        });
    }, [send]);

    // Manual override: user picks the CV language when auto-detection is wrong.
    const handleCvLanguageChange = useCallback((code) => {
        setCvLanguage(code);
    }, []);

    const openContentPanel = useCallback(() => {
        setIsOpen(true);
        setActivePanel("improve_content");
    }, []);

    const openMatchJobPanel = useCallback(() => {
        setIsOpen(true);
        setActivePanel("match_job");
    }, []);

    const runAtsScore = useCallback(() => {
        send("ats_score", "Sprawdź ATS");
    }, [send]);

    // Bridge: another surface (e.g. the "CV too long" modal) can request an
    // assistant action by bumping `assistantAction.nonce`. Open the panel and
    // fire the action once per nonce. The nonce (not just the action id) is the
    // dependency so requesting the same action twice still re-triggers.
    const lastAssistantNonceRef = useRef(0);
    useEffect(() => {
        const nonce = assistantAction?.nonce;
        const action = assistantAction?.action;
        if (!nonce || !action || nonce === lastAssistantNonceRef.current) return;
        lastAssistantNonceRef.current = nonce;
        setIsOpen(true);
        setActivePanel(null);
        const meta = ACTION_META[action];
        send(action, meta?.label || action);
    }, [assistantAction, send]);

    const submitJobTailoring = useCallback(() => {
        const url = jobOfferUrl.trim();
        const description = jobDesc.trim();
        const validationError = validateJobOfferInput(url, description);
        if (validationError) {
            setJobUrlError(validationError);
            return;
        }
        setJobUrlError("");
        setActivePanel(null);
        send("position_rating", "Dopasuj moje CV do tej oferty", {
            displayText: url ? "Dopasuj CV do oferty z linku" : "Dopasuj CV do wklejonej oferty",
        });
    }, [jobDesc, jobOfferUrl, send]);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || isLoading) return;
        if (activePanel === "match_job") {
            submitJobTailoring();
            setInput("");
            return;
        }
        send("chat", text);
        setInput("");
    }, [input, isLoading, activePanel, send, submitJobTailoring]);

    const handleKey = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    useEffect(() => {
        if (!isOpen) return undefined;

        const focusRequest = window.requestAnimationFrame(() => {
            inputRef.current?.focus({ preventScroll: true });
        });
        const opener = fabRef.current;
        const onKeyDown = (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setLayoutPreviewPatches([]);
            setStructurePreviewGroup(null);
            setDeletionPreviewIds([]);
            setIsOpen(false);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.cancelAnimationFrame(focusRequest);
            window.removeEventListener("keydown", onKeyDown);
            if (opener?.isConnected) {
                opener.focus({ preventScroll: true });
            }
        };
    }, [
        isOpen,
        setDeletionPreviewIds,
        setLayoutPreviewPatches,
        setStructurePreviewGroup,
    ]);

    return (
        <>
            {/* ── floating action button ── */}
            <button
                ref={fabRef}
                type="button"
                className={`${classes.fab} ${isLoading ? classes.fabLoading : ""}`}
                onClick={() => setIsOpen(o => !o)}
                title="Asystent AI"
                aria-label={isOpen ? "Zamknij asystenta AI" : "Otwórz asystenta AI"}
                aria-expanded={isOpen}
                aria-controls="ai-assistant-panel"
            >
                <BsStars />
                <span className={classes.fabLabel}>Asystent AI</span>
            </button>

            {/* ── sliding panel ── */}
            <AnimatePresence>
                {isOpen && (
                    <Motion.aside
                        id="ai-assistant-panel"
                        className={classes.panel}
                        initial={reduceMotion ? false : { x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={reduceMotion
                            ? { duration: 0 }
                            : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
                        aria-label="Asystent AI"
                    >
                        {/* header */}
                        <div className={classes.header}>
                            <div className={classes.headerLeft}>
                                <BsStars className={classes.headerIcon} />
                                <div>
                                    <div className={classes.headerTitle}>Asystent AI</div>
                                    <div className={classes.headerSub}>
                                        Analizuj, poprawiaj i ulepszaj
                                    </div>
                                </div>
                            </div>
                            <div className={classes.headerRight}>
                                {entitlements?.limits?.monthly_ai_credits != null && (
                                    <div
                                        className={classes.creditPill}
                                        title={`Wykorzystano ${entitlements.usage?.ai_credits_used ?? 0} z ${entitlements.limits.monthly_ai_credits} kredytów AI w tym miesiącu`}
                                    >
                                        <span className={classes.creditPillValue}>
                                            {entitlements.remaining?.ai_credits ?? Math.max(0, entitlements.limits.monthly_ai_credits - (entitlements.usage?.ai_credits_used ?? 0))}
                                        </span>
                                        <span className={classes.creditPillLabel}>kredytów AI</span>
                                    </div>
                                )}
                                <button type="button" className={classes.closeBtn} aria-label="Zamknij asystenta AI" onClick={() => {
                                    setLayoutPreviewPatches([]);
                                    setStructurePreviewGroup(null);
                                    setDeletionPreviewIds([]);
                                    setIsOpen(false);
                                }}>
                                    <IoClose aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        {/* goal-oriented quick actions */}
                        <div className={classes.actions}>
                            {GOAL_ACTIONS.map((action) => (
                                <button
                                    key={action.id}
                                    className={`${classes.actionBtn} ${action.panel && activePanel === action.panel
                                        ? classes.actionBtnActive
                                        : ""}`}
                                    style={{ "--action-color": action.color }}
                                    onClick={() => handleGoalAction(action.id)}
                                    disabled={isLoading}
                                    title={action.description}
                                    aria-pressed={action.panel ? activePanel === action.panel : undefined}
                                >
                                    <action.icon className={classes.actionIcon} />
                                    <span>{action.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* goal subpanels */}
                        <AnimatePresence>
                            {activePanel === "improve_content" && (
                                <Motion.div
                                    className={classes.subPanel}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={classes.subPanelTitle}>Co chcesz poprawić?</div>
                                    {/* CV language override for content corrections. Defaults to the detected
                                        language reported by the backend; users can correct a misdetection. */}
                                    <label className={classes.cvLangLabel}>
                                        Język CV
                                        <select
                                            className={classes.cvLangSelect}
                                            value={cvLanguage}
                                            onChange={(e) => handleCvLanguageChange(e.target.value)}
                                        >
                                            <option value="">Auto</option>
                                            {TRANSLATE_LANGUAGES.map((lang) => (
                                                <option key={lang.code} value={lang.code}>{lang.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className={classes.subPanelList}>
                                        {CONTENT_SUBACTIONS.map((sub) => (
                                            <button
                                                key={sub.id}
                                                type="button"
                                                className={classes.subPanelBtn}
                                                disabled={isLoading}
                                                onClick={() => handleContentSubaction(sub.id)}
                                            >
                                                <sub.icon className={classes.subPanelIcon} />
                                                <span>
                                                    <strong>{sub.label}</strong>
                                                    <em>{sub.description}</em>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <button type="button" className={classes.jobDescCancel} onClick={() => setActivePanel(null)}>
                                        Anuluj
                                    </button>
                                </Motion.div>
                            )}
                            {activePanel === "translate" && (
                                <Motion.div
                                    className={classes.subPanel}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={classes.subPanelTitle}>Wybierz język docelowy</div>
                                    <div className={classes.langGrid}>
                                        {TRANSLATE_LANGUAGES.map((lang) => (
                                            <button
                                                key={lang.code}
                                                type="button"
                                                className={classes.langBtn}
                                                disabled={isLoading}
                                                onClick={() => handleTranslateLanguage(lang)}
                                            >
                                                <span className={classes.langCode}>{lang.code.toUpperCase()}</span>
                                                {lang.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button type="button" className={classes.jobDescCancel} onClick={() => setActivePanel(null)}>
                                        Anuluj
                                    </button>
                                </Motion.div>
                            )}
                            {activePanel === "match_job" && (
                                <Motion.div
                                    className={classes.jobDescArea}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={classes.jobPanelHeader}>
                                        <strong>Dopasuj CV do konkretnej oferty</strong>
                                        <span>Najpierw przeanalizujemy wymagania, potem pokażemy poprawki do akceptacji.</span>
                                    </div>
                                    <label className={classes.jobDescLabel} htmlFor="ai-job-offer-url">
                                        Link do oferty
                                    </label>
                                    <input
                                        id="ai-job-offer-url"
                                        className={classes.jobDescInput}
                                        type="url"
                                        inputMode="url"
                                        value={jobOfferUrl}
                                        onChange={(event) => {
                                            setJobOfferUrl(event.target.value);
                                            setJobUrlError("");
                                        }}
                                        placeholder="https://firma.pl/oferty/stanowisko"
                                        aria-describedby="ai-job-offer-help ai-job-offer-error"
                                        aria-invalid={Boolean(jobUrlError)}
                                    />
                                    <span id="ai-job-offer-help" className={classes.jobFieldHelp}>
                                        Obsługiwane są publiczne strony HTTPS, w tym Greenhouse i Lever.
                                    </span>
                                    {jobUrlError && (
                                        <span id="ai-job-offer-error" className={classes.jobFieldError} role="alert">
                                            {jobUrlError}
                                        </span>
                                    )}
                                    <label className={classes.jobDescLabel} htmlFor="ai-job-description">
                                        Opis awaryjny <span>(opcjonalnie)</span>
                                    </label>
                                    <textarea
                                        id="ai-job-description"
                                        className={classes.jobDescInput}
                                        value={jobDesc}
                                        onChange={e => setJobDesc(e.target.value)}
                                        placeholder="Wklej treść ogłoszenia, jeśli strona wymaga logowania lub blokuje pobieranie."
                                        rows={4}
                                    />
                                    <label className={classes.jobDescLabel} htmlFor="ai-candidate-notes">
                                        Dodatkowe fakty o Tobie <span>(opcjonalnie)</span>
                                    </label>
                                    <textarea
                                        id="ai-candidate-notes"
                                        className={classes.jobDescInput}
                                        value={candidateNotes}
                                        onChange={(event) => setCandidateNotes(event.target.value)}
                                        placeholder="Np. wdrożyłem tę technologię komercyjnie, ale nie ma jej jeszcze w CV. Nie wpisuj danych, których nie możesz potwierdzić."
                                        rows={3}
                                    />
                                    <p className={classes.jobSafetyNote}>
                                        CV Studio nie dopisze niepotwierdzonych liczb, umiejętności ani doświadczeń. Braki pokaże jako luki w dowodach.
                                    </p>
                                    <div className={classes.jobDescRow}>
                                        <button
                                            type="button"
                                            className={classes.jobDescCancel}
                                            onClick={() => setActivePanel(null)}
                                        >Anuluj</button>
                                        <button
                                            type="button"
                                            className={classes.jobDescAnalyse}
                                            disabled={(!jobOfferUrl.trim() && !jobDesc.trim()) || isLoading}
                                            onClick={submitJobTailoring}
                                        >
                                            Analizuj i przygotuj poprawki
                                        </button>
                                    </div>
                                </Motion.div>
                            )}
                        </AnimatePresence>

                        {/* chat messages */}
                        <div
                            ref={messagesRef}
                            className={classes.messages}
                            role="log"
                            aria-label="Rozmowa z asystentem AI"
                            aria-live="polite"
                        >
                            {messages.length === 0 && (
                                <div className={classes.emptyState}>
                                    <BsStars className={classes.emptyIcon} />
                                    <p>Wybierz cel powyżej — sprawdź CV, popraw treść, dopasuj do oferty lub przetłumacz — albo wpisz własne pytanie.</p>
                                </div>
                            )}
                            {messages.map(msg => (
                                <ChatMessage
                                    key={msg.id}
                                    msg={msg}
                                    correctionStates={correctionStates}
                                    layoutStates={layoutStates}
                                    structureStates={structureStates}
                                    deletionStates={deletionStates}
                                    cloneStates={cloneStates}
                                    onAccept={acceptCorrection}
                                    onReject={rejectCorrection}
                                    onApplyAll={applyAll}
                                    onPreviewLayout={previewLayoutGroup}
                                    onClearLayoutPreview={clearLayoutPreview}
                                    onAcceptLayout={acceptLayoutGroup}
                                    onRejectLayout={rejectLayoutGroup}
                                    onPreviewStructure={previewStructureGroup}
                                    onClearStructurePreview={clearStructurePreview}
                                    onAcceptStructure={acceptStructureGroup}
                                    onRejectStructure={rejectStructureGroup}
                                    onPreviewDeletion={previewDeletionGroup}
                                    onClearDeletionPreview={clearDeletionPreview}
                                    onAcceptDeletion={acceptDeletionGroup}
                                    onRejectDeletion={rejectDeletionGroup}
                                    onPreviewClone={previewCloneGroup}
                                    onClearClonePreview={clearClonePreview}
                                    onAcceptClone={acceptCloneGroup}
                                    onRejectClone={rejectCloneGroup}
                                    onOpenContentPanel={openContentPanel}
                                    onRunAts={runAtsScore}
                                    onOpenMatchJob={openMatchJobPanel}
                                    onShowEvidence={showJobEvidence}
                                    onHideEvidence={hideJobEvidence}
                                    ctaDisabled={isLoading}
                                    A4_Elements={A4_Elements}
                                />
                            ))}
                            {isLoading && (
                                <div className={classes.typing} role="status" aria-live="polite">
                                    <span className={classes.srOnly}>Asystent analizuje dokument. To może potrwać chwilę.</span>
                                    <div className={classes.typingDot} />
                                    <div className={classes.typingDot} />
                                    <div className={classes.typingDot} />
                                </div>
                            )}
                        </div>

                        {/* chat input */}
                        <div className={classes.inputArea}>
                            <textarea
                                ref={inputRef}
                                className={classes.chatInput}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKey}
                                placeholder="Zadaj pytanie lub wydaj polecenie…"
                                rows={2}
                                disabled={isLoading || activePanel === "match_job"}
                            />
                            <button
                                className={classes.sendBtn}
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading || activePanel === "match_job"}
                                aria-label="Wyślij"
                            >
                                <IoSend />
                            </button>
                        </div>
                    </Motion.aside>
                )}
            </AnimatePresence>
        </>
    );
}
