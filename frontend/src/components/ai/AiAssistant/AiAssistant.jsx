/**
 * Floating AI assistant: quick actions + freeform chat against the canvas.
 * Sends element snapshots to POST /ai/assistant; chat may return previewable
 * position/structure/deletion/clone review cards before mutating PdfContext.
 */
import { useState, useRef, useEffect, useCallback, useMemo, use } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { nanoid } from "nanoid";
import { BsStars } from "react-icons/bs";
import {
    FaArrowsAltH, FaPalette, FaBriefcase, FaFont, FaMagic,
    FaLanguage, FaSearch,
} from "react-icons/fa";
import { RiEditLine, RiScissorsLine } from "react-icons/ri";
import { IoClose, IoSend } from "react-icons/io5";
import { MdCheckCircle, MdCancel } from "react-icons/md";
import classes from "./AiAssistant.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
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

// ── goal-oriented quick actions ───────────────────────────────────────────
// User-facing tiles map to goals; backend still uses specialised API actions
// (rating, grammar, layout, …). Do not expose every endpoint as its own tile.
const CHROME_ACCENT = "#171717";

/** Labels for API actions shown on assistant message chips. */
const ACTION_META = {
    rating:          { label: "Sprawdź CV",           color: CHROME_ACCENT },
    design_rating:   { label: "Wygląd i typografia",  color: CHROME_ACCENT },
    position_rating: { label: "Dopasuj do oferty",    color: CHROME_ACCENT },
    grammar:         { label: "Sprawdź błędy",        color: CHROME_ACCENT },
    language:        { label: "Popraw język",         color: CHROME_ACCENT },
    improve:         { label: "Wzmocnij treść",       color: CHROME_ACCENT },
    shorten:         { label: "Skróć CV",             color: CHROME_ACCENT },
    ats_score:       { label: "Czytelność dla ATS",   color: CHROME_ACCENT },
    layout:          { label: "Układ strony",         color: CHROME_ACCENT },
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
 * Top-level goals. Submenus open for improve_content / check_appearance /
 * translate; check_cv and match_job start their flows immediately.
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
        description: "Oceń dopasowanie CV do opisu stanowiska",
        panel: "match_job",
    },
    {
        id: "check_appearance",
        label: "Sprawdź wygląd",
        icon: FaPalette,
        color: CHROME_ACCENT,
        description: "Typografia i układ strony",
        panel: "check_appearance",
        proOnly: true,
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

const APPEARANCE_SUBACTIONS = [
    {
        id: "design_rating",
        label: "Wygląd i typografia",
        description: "Hierarchia, kolory, wyróżnienia i spójność",
        icon: FaPalette,
        kind: "api",
    },
    {
        id: "layout",
        label: "Układ strony",
        description: "Odstępy, wyrównania, kolumny i puste miejsca",
        icon: FaArrowsAltH,
        kind: "layout_toggle",
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

const LAYOUT_MODE_GREETING = (
    "Cześć! Tryb Układ jest aktywny. Opisz zmianę geometrii albo wybierz jedną "
    + "z propozycji poniżej. Analiza ruszy dopiero po wysłaniu zlecenia."
);

/** Category ids that should offer a "Popraw treść" CTA when the score is weak. */
const CONTENT_CATEGORY_IDS = new Set(["completeness", "experience", "language"]);
/** Category ids that should offer a "Sprawdź wygląd" CTA when the score is weak. */
const APPEARANCE_CATEGORY_IDS = new Set(["structure", "hierarchy", "emphasis", "color", "alignment"]);
const WEAK_CATEGORY_RATIO = 0.7;

/**
 * Short labels for the chat UI; fuller `prompt` text is what GPT receives.
 * Keep prompts concrete and tied to layout_contract / real_gap vocabulary.
 * `primary: true` chips appear first; the rest sit under "Więcej opcji".
 */
const LAYOUT_SUGGESTIONS = [
    {
        id: "full-rhythm",
        label: "Dopasuj automatycznie",
        primary: true,
        prompt: (
            "Przeprowadź pełną korektę geometrii według layout_contract: odstępy pod "
            + "nagłówkami (~6 px), stack (~4), record (~14), section (~18), wyrównanie "
            + "nagłówków i dat, spójność kolumn oraz nachodzenia. Zwróć maksymalnie "
            + "6 najważniejszych grup — tylko tam, gdzie rytm peerów jest wyraźnie "
            + "niespójny. Preferuj najmniejszą zmianę. Jeśli układ już trzyma kontrakt, "
            + "status=no_changes i krótki summary; nie wymyślaj nowego rytmu."
        ),
    },
    {
        id: "record-gaps",
        label: "Wyrównaj odstępy",
        primary: true,
        prompt: (
            "Porównaj odstępy między kolejnymi wpisami doświadczenia i wykształcenia "
            + "(oraz podobnymi listami, np. projektami). Ujednolić je do "
            + "layout_contract.spacing_px.record (ok. 10 px). Przesuwaj całe bloki "
            + "wpisów (move_scope=blocks), nie pojedyncze tytuły bez daty/opisu."
        ),
    },
    {
        id: "overlaps",
        label: "Napraw nachodzenia",
        primary: true,
        prompt: (
            "Wykryj nachodzenia tekstu na tekst, tekstu na linie/kształty oraz "
            + "elementy wychodzące poza stronę. Zaproponuj najmniejsze bezpieczne "
            + "przesunięcia (priorytet: critical/high). Nie zmieniaj fontów, kolorów "
            + "ani treści. Pomiń locked/fixedToPage, chyba że blokują czytelność "
            + "ruchomego tekstu — wtedy przesuń tekst."
        ),
    },
    {
        id: "columns",
        label: "Wyrównaj kolumny",
        primary: true,
        prompt: (
            "Sprawdź spójność kolumn: wspólne left dla lewej kolumny treści oraz "
            + "stabilne przerwy między kolumnami (np. treść vs daty lub sidebar). "
            + "Wyrównaj tylko elementy, które wyraźnie wypadają z siatki peerów. "
            + "Nie zlewaj osobnych kolumn w jedną."
        ),
    },
    {
        id: "header-gaps",
        label: "Ujednolić odstępy pod nagłówkami",
        prompt: (
            "Sprawdź real_gap pod każdym nagłówkiem sekcji (treść względem dolnej "
            + "krawędzi nagłówka/linii). Ujednolić je do rytmu z layout_contract "
            + "(ok. 6 px, zakres 6–10). Nie celuj w 0 px. Zaproponuj tylko grupy "
            + "section_header_gap tam, gdzie peery różnią się wyraźnie."
        ),
    },
    {
        id: "section-gaps",
        label: "Sprawdź odstępy między sekcjami",
        prompt: (
            "Sprawdź odstępy między końcem jednej sekcji a następnym nagłówkiem. "
            + "Preferuj layout_contract.spacing_px.section (ok. 21 px). Odstęp między "
            + "sekcjami ma być wyraźnie większy niż wewnątrz wpisu. Zaproponuj "
            + "najmniejsze ruchy, które ujednolicą rytm."
        ),
    },
    {
        id: "stack-rhythm",
        label: "Popraw rytm wewnątrz wpisów",
        prompt: (
            "We wpisach doświadczenia/wykształcenia sprawdź odstępy tytuł → meta/firma "
            + "→ opis/punkty. Preferuj layout_contract.spacing_px.stack (ok. 4 px). "
            + "Nie ruszaj całych sekcji — tylko niespójne elementy wewnątrz wpisów, "
            + "zachowując wyrównanie dat względem tytułów."
        ),
    },
    {
        id: "date-column",
        label: "Ustaw daty w jednej kolumnie",
        prompt: (
            "Wyrównaj daty doświadczenia i wykształcenia do jednej prawej kolumny "
            + "(wspólne left/right peerów). Daty mają pozostać w tym samym wierszu "
            + "co odpowiadający tytuł (text_rows). Nie zmieniaj treści ani kolejności "
            + "wpisów — tylko geometrię."
        ),
    },
    {
        id: "left-margins",
        label: "Wyrównaj lewe marginesy",
        prompt: (
            "Znajdź teksty tej samej roli (nagłówki sekcji, tytuły wpisów, opisy), "
            + "które odstają leftem od dominującej kolumny. Ujednolić lewe krawędzie "
            + "w ramach tej samej kolumny/sekcji najmniejszym ruchem. Nie ruszaj "
            + "celowo dwukolumnowych układów ani chrome fixedToPage."
        ),
    },
    {
        id: "header-chrome",
        label: "Dopasuj ikony i linie do nagłówków",
        prompt: (
            "Dla każdego nagłówka sekcji sprawdź ikonę/marker, tekst tytułu i linię "
            + "dekoracyjną. Wyrównaj je wizualnie w jednym wierszu nagłówka; linia "
            + "nie może przechodzić przez tekst. Gdy jest flowRole, użyj go do "
            + "rozpoznania chrome. Preferuj after_rule z layout_contract przed "
            + "pierwszą treścią sekcji."
        ),
    },
];

const PRIMARY_LAYOUT_SUGGESTIONS = LAYOUT_SUGGESTIONS.filter((s) => s.primary);
const SECONDARY_LAYOUT_SUGGESTIONS = LAYOUT_SUGGESTIONS.filter((s) => !s.primary);

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
    const color = percent >= 80 ? "#5FA777" : percent >= 60 ? "#F59E0B" : "#D2503C";
    return (
        <div className={classes.ratingBadge} style={{ borderColor: color, color }}>
            <span className={classes.ratingNum}>{percent}</span>
            <span className={classes.ratingDen}>%</span>
        </div>
    );
}

/**
 * Structured score dashboard for rating / ATS / position / design results.
 * CTAs are computed on the client so the model does not invent navigation.
 */
function RatingDashboard({
    msg,
    onOpenContentPanel,
    onOpenAppearancePanel,
    onRunAts,
    onOpenMatchJob,
    ctaDisabled,
}) {
    const categories = Array.isArray(msg.categories) ? msg.categories : [];
    const strengths = Array.isArray(msg.strengths) ? msg.strengths : [];
    const priorities = Array.isArray(msg.priorities) ? msg.priorities : [];
    const actionId = msg.actionId;
    const isAts = actionId === "ats_score";
    // Prefer category math over `rating × 10`:
    // - ATS uses fixed weights (avoids 96% → false 100%).
    // - design / rating / position use rubric maxes (avoids 100% bars + 90% badge
    //   when the model returns rating=9 with every category at full score).
    const percent = isAts
        ? (overallPercentFromCategories(categories, ATS_CATEGORY_WEIGHTS)
            ?? ratingToPercent(msg.rating))
        : (overallPercentFromRubric(categories) ?? ratingToPercent(msg.rating));

    const weakContent = categories.some((cat) => {
        const p = categoryPercent(cat);
        return p != null && p < WEAK_CATEGORY_RATIO * 100 && CONTENT_CATEGORY_IDS.has(cat.id);
    });
    const weakAppearance = categories.some((cat) => {
        const p = categoryPercent(cat);
        return p != null && p < WEAK_CATEGORY_RATIO * 100 && APPEARANCE_CATEGORY_IDS.has(cat.id);
    });

    const showAtsCta = actionId === "rating";
    const showMatchCta = actionId === "ats_score";
    const showContentCta = actionId === "rating" && weakContent;
    const showAppearanceCta = actionId === "rating" && weakAppearance;

    const hasBody = percent != null || categories.length > 0
        || strengths.length > 0 || priorities.length > 0
        || showAtsCta || showMatchCta || showContentCta || showAppearanceCta;
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

            {(showAtsCta || showContentCta || showAppearanceCta || showMatchCta) && (
                <div className={classes.dashboardCtas}>
                    {showAtsCta && (
                        <button
                            type="button"
                            className={classes.dashboardCta}
                            disabled={ctaDisabled}
                            onClick={() => onRunAts?.()}
                        >
                            Sprawdź ATS
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
                    {showAppearanceCta && (
                        <button
                            type="button"
                            className={classes.dashboardCta}
                            disabled={ctaDisabled}
                            onClick={() => onOpenAppearancePanel?.()}
                        >
                            Sprawdź wygląd
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
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "#5FA777" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "#9A8E7F" }}>✗ Pominięto</span>}
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
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "#5FA777" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "#9A8E7F" }}>✗ Pominięto</span>}
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
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "#5FA777" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "#9A8E7F" }}>✗ Pominięto</span>}
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
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "#5FA777" }}>✓ Zastosowano</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "#9A8E7F" }}>✗ Pominięto</span>}
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
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "#D2503C" }}>✓ Usunięto</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "#9A8E7F" }}>✗ Pominięto</span>}
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
    onPickLayoutSuggestion,
    suggestionsDisabled,
    onOpenContentPanel,
    onOpenAppearancePanel,
    onRunAts,
    onOpenMatchJob,
    ctaDisabled,
    A4_Elements,
}) {
    const isUser = msg.role === "user";
    const [showMoreLayout, setShowMoreLayout] = useState(false);
    const pendingCount = (msg.corrections || []).filter(
        c => (correctionStates[`${msg.id}_${c.element_id}`] || "pending") === "pending"
    ).length;
    // Suggestion chips may send a longer GPT prompt while the bubble shows a
    // short label via displayText, so the user still sees what they commissioned.
    const visibleText = msg.displayText || msg.text;
    const hasDashboard = !isUser && (
        typeof msg.rating === "number"
        || (msg.categories?.length > 0)
        || (msg.strengths?.length > 0)
        || (msg.priorities?.length > 0)
        || msg.actionId === "rating"
        || msg.actionId === "ats_score"
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
                        onOpenContentPanel={onOpenContentPanel}
                        onOpenAppearancePanel={onOpenAppearancePanel}
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

                {msg.layoutSuggestions?.length > 0 && (
                    <div className={classes.layoutSuggestions}>
                        <span className={classes.layoutSuggestionsLabel}>Propozycje</span>
                        <div className={classes.layoutSuggestionList} role="group" aria-label="Propozycje układu">
                            {msg.layoutSuggestions.map((suggestion) => (
                                <button
                                    key={suggestion.id}
                                    type="button"
                                    className={classes.layoutSuggestion}
                                    disabled={suggestionsDisabled}
                                    onClick={() => onPickLayoutSuggestion?.(suggestion)}
                                >
                                    {suggestion.label}
                                </button>
                            ))}
                        </div>
                        {msg.layoutSuggestionsMore?.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    className={classes.layoutMoreToggle}
                                    onClick={() => setShowMoreLayout((v) => !v)}
                                >
                                    {showMoreLayout ? "Mniej opcji" : "Więcej opcji"}
                                </button>
                                {showMoreLayout && (
                                    <div className={classes.layoutSuggestionList} role="group" aria-label="Więcej propozycji układu">
                                        {msg.layoutSuggestionsMore.map((suggestion) => (
                                            <button
                                                key={suggestion.id}
                                                type="button"
                                                className={classes.layoutSuggestion}
                                                disabled={suggestionsDisabled}
                                                onClick={() => onPickLayoutSuggestion?.(suggestion)}
                                            >
                                                {suggestion.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
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
    const {
        A4_Elements,
        activeTemplateId,
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
        entitlements,
        refreshEntitlements,
        showPlanModal,
        assistantAction,
    } = use(PdfContext);

    const [isOpen, setIsOpen] = useState(false);
    const [layoutMode, setLayoutMode] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [jobDesc, setJobDesc] = useState("");
    // Goal submenu: improve_content | check_appearance | translate | match_job | null
    const [activePanel, setActivePanel] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [correctionStates, setCorrectionStates] = useState({});
    const [layoutStates, setLayoutStates] = useState({});
    const [structureStates, setStructureStates] = useState({});
    const [deletionStates, setDeletionStates] = useState({});
    const [cloneStates, setCloneStates] = useState({});
    // Detected (or user-overridden) CV language. Empty until the first backend
    // response reports one; the selector then reflects it. Sent with content
    // actions so corrections come back in the CV language, not always Polish.
    const [cvLanguage, setCvLanguage] = useState("");

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const layoutHistoryStartRef = useRef(null);
    // Synchronous in-flight guard: React state `isLoading` updates too late to
    // block a double-click on suggestion chips before the next render.
    const requestInFlightRef = useRef(false);
    // Bumped when the active template changes so a late assistant response from
    // the previous document context cannot re-populate a cleared chat.
    const chatSessionRef = useRef(0);
    const prevTemplateIdRef = useRef(activeTemplateId);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Changing template (picker / Zmień szablon / AI fill) replaces the canvas.
    // Drop the prior conversation, review cards, and layout session so history
    // and pending patches cannot target elements that no longer exist.
    useEffect(() => {
        if (prevTemplateIdRef.current === activeTemplateId) return;
        prevTemplateIdRef.current = activeTemplateId;
        chatSessionRef.current += 1;
        setMessages([]);
        setInput("");
        setJobDesc("");
        setActivePanel(null);
        setLayoutMode(false);
        setCorrectionStates({});
        setLayoutStates({});
        setStructureStates({});
        setDeletionStates({});
        setCloneStates({});
        layoutHistoryStartRef.current = null;
        // Patches / deletion ids are arrays in PdfCanvas state — never null
        // (preview useMemo reads `.length` without a null guard).
        setLayoutPreviewPatches?.([]);
        setStructurePreviewGroup?.(null);
        setDeletionPreviewIds?.([]);
        setAiCorrectionHighlights?.([]);
    }, [
        activeTemplateId,
        setAiCorrectionHighlights,
        setDeletionPreviewIds,
        setLayoutPreviewPatches,
        setStructurePreviewGroup,
    ]);

    // Keep A4 marks in sync with every pending review category (content, style,
    // layout, structure, deletion, clone). Clear when the panel closes / unmounts.
    useEffect(() => {
        if (!isOpen) {
            setAiCorrectionHighlights?.([]);
            return;
        }
        setAiCorrectionHighlights?.(collectPendingAiHighlights({
            messages,
            correctionStates,
            layoutStates,
            structureStates,
            deletionStates,
            cloneStates,
        }));
    }, [
        isOpen,
        messages,
        correctionStates,
        layoutStates,
        structureStates,
        deletionStates,
        cloneStates,
        setAiCorrectionHighlights,
    ]);

    useEffect(() => () => setAiCorrectionHighlights?.([]), [setAiCorrectionHighlights]);

    useEffect(() => {
        const textarea = inputRef.current;
        if (!textarea) return;

        // Keep short prompts comfortably two lines high and grow longer prompts
        // only until the composer reaches its scrolling limit.
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 136)}px`;
    }, [input]);

    // Keep one client for the mounted assistant. Recreating it on every render
    // would also recreate `send`, making the layout-session callbacks unstable.
    const api = useMemo(
        () => new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` }),
        [],
    );

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
                [],
                { allowAmbiguous: true },
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
                        [],
                        { allowAmbiguous: true },
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
        requestInFlightRef.current = true;
        // Capture before await: a template change mid-flight increments the
        // session and must discard both success and error bubbles for that call.
        const sessionAtStart = chatSessionRef.current;

        // A new layout session must reason from the current canvas rather than
        // repeat conclusions from ordinary chat or an earlier layout run.
        // Follow-up questions inside the active session still receive their
        // own prior turns, which preserves conversational geometry analysis.
        const historyStart = action === "layout" && Number.isInteger(layoutHistoryStartRef.current)
            ? layoutHistoryStartRef.current
            : 0;
        const history = messages
            .slice(historyStart)
            .filter((m) => (m.role === "user" || m.role === "assistant") && m.text)
            .slice(-12)
            .map((m) => ({
                role: m.role,
                content: String(m.text).slice(0, 1500),
            }));

        const usesMessage = action === "chat" || action === "layout";
        // Keep the full prompt in `text` for session history / GPT follow-ups.
        // `displayText` is only for the bubble when the user picked a short label.
        const userMsg = {
            id: nanoid(),
            role: "user",
            text: userText,
            ...(options.displayText ? { displayText: options.displayText } : {}),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            // Warm the Render dyno before a long GPT call, especially a full-canvas layout analysis.
            wakeBackend();
            const actionMeta = ACTION_META[action] || { label: action, color: CHROME_ACCENT };
            // Full-canvas layout analysis can exceed the default 90s auth timeout.
            const timeoutMs = action === "layout" ? 240_000 : 120_000;
            const targetLanguage = options.target_language || "";
            // Content actions (grammar/language/improve/shorten) may carry a CV
            // language. An explicit option wins; otherwise reuse the last
            // detected/selected language. Empty lets the backend auto-detect.
            const cvLanguageOverride = options.cv_language || cvLanguage;
            const contentActions = ["grammar", "language", "improve", "shorten"];
            const res = await api.httpRequest(
                ENDPOINTS.AI.ASSISTANT, "POST",
                JSON.stringify({
                    action,
                    elements: measureElements(A4_Elements),
                    message: usesMessage ? userText : "",
                    job_description: action === "position_rating" ? jobDesc : "",
                    page_size: pageSize,
                    history: usesMessage ? history : [],
                    // Layout AI uses the slug for layout_contract hints; other
                    // actions ignore it. Freestyle / reopened docs may omit it.
                    ...(action === "layout" && activeTemplateId
                        ? { template_id: activeTemplateId }
                        : {}),
                    ...(action === "translate" && targetLanguage
                        ? { target_language: targetLanguage }
                        : {}),
                    ...(cvLanguageOverride && contentActions.includes(action)
                        ? { cv_language: cvLanguageOverride }
                        : {}),
                }),
                "Asystent AI nie odpowiedział",
                {
                    timeoutMs,
                    // Retry cold-start / proxy blips only — not client AbortError timeouts
                    // (layout can already take minutes and must not be re-billed blindly).
                    retries: 3,
                    retryDelayMs: 2_500,
                    retryOnTimeout: false,
                },
            );

            if (chatSessionRef.current !== sessionAtStart) return;

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
            if (chatSessionRef.current !== sessionAtStart) return;
            setMessages(prev => [...prev, {
                id: nanoid(),
                role: "assistant",
                text: `Błąd: ${err.message}`,
                tips: [],
                corrections: [],
                web_sources: [],
            }]);
        } finally {
            requestInFlightRef.current = false;
            setIsLoading(false);
        }
    }, [A4_Elements, activeTemplateId, api, cvLanguage, isLoading, jobDesc, messages, pageSize, refreshEntitlements]);

    const toggleLayoutMode = useCallback(() => {
        // Keep the client journey clear; the API remains the source of
        // truth for the Pro appearance entitlement.
        if (entitlements && entitlements.plan_slug !== "pro") {
            showPlanModal?.();
            return;
        }
        setIsOpen(true);
        setActivePanel(null);
        if (layoutMode) {
            setLayoutMode(false);
            layoutHistoryStartRef.current = null;
            setMessages(prev => [...prev, {
                id: nanoid(),
                role: "assistant",
                text: "Tryb Układ wyłączony. Wracasz do zwykłego czatu.",
                tips: [],
                corrections: [],
                layout_groups: [],
                layout_issues: [],
            }]);
            return;
        }
        // Enabling layout mode is intentionally local: it must not consume
        // credits or upload the canvas before the user submits a request.
        layoutHistoryStartRef.current = messages.length + 1;
        setLayoutMode(true);
        setMessages(prev => [...prev, {
            id: nanoid(),
            role: "assistant",
            text: LAYOUT_MODE_GREETING,
            tips: [],
            layoutSuggestions: PRIMARY_LAYOUT_SUGGESTIONS,
            layoutSuggestionsMore: SECONDARY_LAYOUT_SUGGESTIONS,
            corrections: [],
            layout_groups: [],
            layout_issues: [],
        }]);
    }, [entitlements, layoutMode, messages.length, showPlanModal]);

    const handleGoalAction = useCallback((goalId) => {
        const goal = GOAL_ACTIONS.find((g) => g.id === goalId);
        if (!goal) return;

        if (goal.proOnly && entitlements && entitlements.plan_slug !== "pro") {
            showPlanModal?.();
            return;
        }

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
    }, [entitlements, send, showPlanModal]);

    const handleContentSubaction = useCallback((actionId) => {
        const meta = CONTENT_SUBACTIONS.find((a) => a.id === actionId);
        setActivePanel(null);
        send(actionId, meta?.label || actionId);
    }, [send]);

    const handleAppearanceSubaction = useCallback((sub) => {
        if (sub.kind === "layout_toggle") {
            toggleLayoutMode();
            return;
        }
        setActivePanel(null);
        send(sub.id, sub.label);
    }, [send, toggleLayoutMode]);

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

    const openAppearancePanel = useCallback(() => {
        if (entitlements && entitlements.plan_slug !== "pro") {
            showPlanModal?.();
            return;
        }
        setIsOpen(true);
        setActivePanel("check_appearance");
    }, [entitlements, showPlanModal]);

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

    const handleLayoutSuggestion = useCallback((suggestion) => {
        if (!suggestion?.prompt || requestInFlightRef.current || isLoading || !layoutMode) return;
        send("layout", suggestion.prompt, { displayText: suggestion.label });
    }, [isLoading, layoutMode, send]);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || isLoading) return;
        if (activePanel === "match_job") {
            // confirm position_rating with job description from the panel
            setActivePanel(null);
            send("position_rating", `Przeanalizuj moje CV pod kątem tego stanowiska:\n${jobDesc.slice(0, 200)}…`);
            setInput("");
            return;
        }
        send(layoutMode ? "layout" : "chat", text);
        setInput("");
    }, [input, isLoading, activePanel, jobDesc, layoutMode, send]);

    const handleKey = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* ── floating action button ── */}
            <button
                className={`${classes.fab} ${isLoading ? classes.fabLoading : ""}`}
                onClick={() => setIsOpen(o => !o)}
                title="Asystent AI"
                aria-label="Otwórz asystenta AI"
            >
                <BsStars />
                <span className={classes.fabLabel}>Asystent AI</span>
            </button>

            {/* ── sliding panel ── */}
            <AnimatePresence>
                {isOpen && (
                    <Motion.aside
                        className={classes.panel}
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    >
                        {/* header */}
                        <div className={classes.header}>
                            <div className={classes.headerLeft}>
                                <BsStars className={classes.headerIcon} />
                                <div>
                                    <div className={classes.headerTitle}>Asystent AI</div>
                                    <div className={classes.headerSub}>
                                        {layoutMode ? "Tryb Układ aktywny — pytaj o geometrię CV" : "Analizuj, poprawiaj i ulepszaj"}
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
                                <button className={classes.closeBtn} onClick={() => {
                                    setLayoutPreviewPatches([]);
                                    setStructurePreviewGroup(null);
                                    setDeletionPreviewIds([]);
                                    setIsOpen(false);
                                }}>
                                    <IoClose />
                                </button>
                            </div>
                        </div>

                        {/* goal-oriented quick actions */}
                        <div className={classes.actions}>
                            {GOAL_ACTIONS.map((action) => (
                                <button
                                    key={action.id}
                                    className={`${classes.actionBtn} ${
                                        (action.panel && activePanel === action.panel)
                                        || (action.id === "check_appearance" && layoutMode)
                                            ? classes.actionBtnActive
                                            : ""
                                    }`}
                                    style={{ "--action-color": action.color }}
                                    onClick={() => handleGoalAction(action.id)}
                                    disabled={isLoading && !(action.id === "check_appearance" && layoutMode)}
                                    title={action.proOnly && entitlements?.plan_slug !== "pro"
                                        ? `${action.description}. Dostępne w planie Pro.`
                                        : action.description}
                                    aria-pressed={action.panel ? activePanel === action.panel : undefined}
                                >
                                    <action.icon className={classes.actionIcon} />
                                    <span>
                                        {action.proOnly && entitlements?.plan_slug !== "pro"
                                            ? `${action.label} · Pro`
                                            : action.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {layoutMode && (
                            <div className={classes.layoutModeBanner}>
                                Układ włączony — każde pytanie dostaje pełny JSON A4. Otwórz „Sprawdź wygląd” → Układ, aby wyjść.
                            </div>
                        )}

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
                            {activePanel === "check_appearance" && (
                                <Motion.div
                                    className={classes.subPanel}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={classes.subPanelTitle}>Sprawdź wygląd</div>
                                    <div className={classes.subPanelList}>
                                        {APPEARANCE_SUBACTIONS.map((sub) => (
                                            <button
                                                key={sub.id}
                                                type="button"
                                                className={`${classes.subPanelBtn} ${
                                                    sub.kind === "layout_toggle" && layoutMode
                                                        ? classes.actionBtnActive
                                                        : ""
                                                }`}
                                                disabled={isLoading && !(sub.kind === "layout_toggle")}
                                                onClick={() => handleAppearanceSubaction(sub)}
                                                aria-pressed={sub.kind === "layout_toggle" ? layoutMode : undefined}
                                            >
                                                <sub.icon className={classes.subPanelIcon} />
                                                <span>
                                                    <strong>
                                                        {sub.kind === "layout_toggle" && layoutMode
                                                            ? "Układ strony · wyłącz"
                                                            : sub.label}
                                                    </strong>
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
                                    <label className={classes.jobDescLabel}>
                                        Wklej opis stanowiska, aby ocenić dopasowanie CV:
                                    </label>
                                    <textarea
                                        className={classes.jobDescInput}
                                        value={jobDesc}
                                        onChange={e => setJobDesc(e.target.value)}
                                        placeholder="Starszy programista frontend w Acme Inc…"
                                        rows={4}
                                    />
                                    <div className={classes.jobDescRow}>
                                        <button
                                            className={classes.jobDescCancel}
                                            onClick={() => setActivePanel(null)}
                                        >Anuluj</button>
                                        <button
                                            className={classes.jobDescAnalyse}
                                            disabled={!jobDesc.trim() || isLoading}
                                            onClick={() => {
                                                setActivePanel(null);
                                                send("position_rating", `Przeanalizuj moje CV pod kątem tego stanowiska:\n${jobDesc.slice(0, 200)}…`);
                                            }}
                                        >
                                            Analizuj
                                        </button>
                                    </div>
                                </Motion.div>
                            )}
                        </AnimatePresence>

                        {/* chat messages */}
                        <div className={classes.messages}>
                            {messages.length === 0 && (
                                <div className={classes.emptyState}>
                                    <BsStars className={classes.emptyIcon} />
                                    <p>Wybierz cel powyżej — sprawdź CV, popraw treść, dopasuj do oferty, wygląd lub przetłumacz — albo wpisz własne pytanie.</p>
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
                                    onPickLayoutSuggestion={handleLayoutSuggestion}
                                    suggestionsDisabled={isLoading || !layoutMode}
                                    onOpenContentPanel={openContentPanel}
                                    onOpenAppearancePanel={openAppearancePanel}
                                    onRunAts={runAtsScore}
                                    onOpenMatchJob={openMatchJobPanel}
                                    ctaDisabled={isLoading}
                                    A4_Elements={A4_Elements}
                                />
                            ))}
                            {isLoading && (
                                <div className={classes.typing}>
                                    <div className={classes.typingDot} />
                                    <div className={classes.typingDot} />
                                    <div className={classes.typingDot} />
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* chat input */}
                        <div className={classes.inputArea}>
                            <textarea
                                ref={inputRef}
                                className={classes.chatInput}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKey}
                                placeholder={layoutMode
                                    ? "np. Który nagłówek odstaje? Czy wpis Citibank jest za nisko?"
                                    : "Zadaj pytanie lub wydaj polecenie…"}
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
