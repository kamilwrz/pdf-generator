/**
 * Floating AI assistant: quick actions + freeform chat against the canvas.
 * Sends element snapshots to POST /ai/assistant; layout/structure results are
 * previewable review cards before mutating PdfContext.
 */
import { useState, useRef, useEffect, useCallback, use } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { nanoid } from "nanoid";
import { BsStars } from "react-icons/bs";
import { FaArrowsAltH, FaStar, FaPalette, FaBriefcase, FaFont, FaMagic, FaRobot } from "react-icons/fa";
import { RiEditLine } from "react-icons/ri";
import { IoClose, IoSend } from "react-icons/io5";
import { MdCheckCircle, MdCancel } from "react-icons/md";
import classes from "./AiAssistant.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { measureElements } from "../../../utils/elementBounds";

// ── quick actions ─────────────────────────────────────────────────────────
const CHROME_ACCENT = "#466B82";
const ACTIONS = [
    { id: "rating",          label: "Oceń CV",           icon: FaStar,        color: CHROME_ACCENT, description: "Ogólna ocena jakości CV w skali 1–10" },
    { id: "design_rating",   label: "Projekt",           icon: FaPalette,     color: CHROME_ACCENT, description: "Typografia oraz twarde błędy geometrii (kolizje, ucięcia)" },
    { id: "position_rating", label: "Dopasowanie",       icon: FaBriefcase,   color: CHROME_ACCENT, description: "Dopasowanie CV do opisu stanowiska" },
    { id: "grammar",         label: "Gramatyka",         icon: RiEditLine,    color: CHROME_ACCENT, description: "Znajdź i popraw błędy gramatyczne" },
    { id: "language",        label: "Styl",              icon: FaFont,        color: CHROME_ACCENT, description: "Popraw ton i klarowność tekstu" },
    { id: "improve",         label: "Ulepsz",            icon: FaMagic,       color: CHROME_ACCENT, description: "Mocniejsze punkty z czasownikami akcji" },
    { id: "ats_score",       label: "Wynik ATS",         icon: FaRobot,       color: CHROME_ACCENT, description: "Sprawdzenie pod systemy rekrutacyjne ATS" },
    { id: "layout",          label: "Układ",             icon: FaArrowsAltH,  color: CHROME_ACCENT, description: "Napraw kolizje, ucięcia i granice strony; potem wyrównania" },
];
const SEVERITY_LABELS = {
    critical: "krytyczny",
    high: "wysoki",
    medium: "średni",
    low: "niski",
    review: "do sprawdzenia",
};

// ── sub-components ────────────────────────────────────────────────────────

function RatingBadge({ value }) {
    const color = value >= 8 ? "#5FA777" : value >= 6 ? "#F59E0B" : "#D2503C";
    return (
        <div className={classes.ratingBadge} style={{ borderColor: color, color }}>
            <span className={classes.ratingNum}>{value}</span>
            <span className={classes.ratingDen}>/10</span>
        </div>
    );
}

function CorrectionCard({ msgId, patch, correctionStates, onAccept, onReject, A4_Elements }) {
    const { element_id, ...fields } = patch;
    const el = A4_Elements.find(e => e.element_id === element_id);
    const state = correctionStates[`${msgId}_${element_id}`] || "pending";

    return (
        <div className={`${classes.corrCard} ${classes[`corr_${state}`]}`}>
            {Object.entries(fields).map(([field, newVal]) => (
                <div key={field} className={classes.diffRow}>
                    <span className={classes.diffField}>{field}</span>
                    {el && <span className={classes.diffOld}>{String(el[field] ?? "–").slice(0, 50)}</span>}
                    <span className={classes.diffArrow}>→</span>
                    <span className={classes.diffNew}>{String(newVal).slice(0, 50)}</span>
                </div>
            ))}
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
    A4_Elements,
}) {
    const isUser = msg.role === "user";
    const pendingCount = (msg.corrections || []).filter(
        c => (correctionStates[`${msg.id}_${c.element_id}`] || "pending") === "pending"
    ).length;

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

                {/* rating badge */}
                {typeof msg.rating === "number" && <RatingBadge value={msg.rating} />}

                {/* main message text */}
                <p className={classes.msgText}>{msg.text}</p>

                {/* tips */}
                {msg.tips?.length > 0 && (
                    <ul className={classes.tips}>
                        {msg.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
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
        editElementValues,
        applyLayoutPatches,
        applyStructureOperation,
        applyCloneOperation,
        applyDeleteOperation,
        setLayoutPreviewPatches,
        setStructurePreviewGroup,
        setDeletionPreviewIds,
        pageSize,
        setCurrentPage,
        entitlements,
        refreshEntitlements,
    } = use(PdfContext);

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [jobDesc, setJobDesc] = useState("");
    const [showJobDesc, setShowJobDesc] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [correctionStates, setCorrectionStates] = useState({});
    const [layoutStates, setLayoutStates] = useState({});
    const [structureStates, setStructureStates] = useState({});
    const [deletionStates, setDeletionStates] = useState({});
    const [cloneStates, setCloneStates] = useState({});

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    // ── correction handlers ──────────────────────────────────────────────

    const acceptCorrection = useCallback((msgId, patch) => {
        const { element_id, ...fields } = patch;
        editElementValues(fields, element_id);
        setCorrectionStates(prev => ({ ...prev, [`${msgId}_${element_id}`]: "accepted" }));
    }, [editElementValues]);

    const rejectCorrection = useCallback((msgId, element_id) => {
        setCorrectionStates(prev => ({ ...prev, [`${msgId}_${element_id}`]: "rejected" }));
    }, []);

    const applyAll = useCallback((msgId, corrections) => {
        corrections.forEach(patch => {
            const key = `${msgId}_${patch.element_id}`;
            if ((correctionStates[key] || "pending") === "pending") {
                const { element_id, ...fields } = patch;
                editElementValues(fields, element_id);
            }
        });
        const newStates = {};
        corrections.forEach(({ element_id }) => {
            newStates[`${msgId}_${element_id}`] = "accepted";
        });
        setCorrectionStates(prev => ({ ...prev, ...newStates }));
    }, [correctionStates, editElementValues]);

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

    const send = useCallback(async (action, userText) => {
        if (isLoading) return;

        // Prior turns only — the current userText is sent as `message`.
        const history = messages
            .filter((m) => (m.role === "user" || m.role === "assistant") && m.text)
            .slice(-12)
            .map((m) => ({
                role: m.role,
                content: String(m.text).slice(0, 1500),
            }));

        const userMsg = {
            id: nanoid(),
            role: "user",
            text: userText,
        };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const actionMeta = ACTIONS.find(a => a.id === action);
            const res = await api.httpRequest(
                ENDPOINTS.AI.ASSISTANT, "POST",
                JSON.stringify({
                    action,
                    elements: measureElements(A4_Elements),
                    message: action === "chat" ? userText : "",
                    job_description: action === "position_rating" ? jobDesc : "",
                    page_size: pageSize,
                    history: action === "chat" ? history : [],
                }),
                "Asystent AI nie odpowiedział"
            );

            if (res.usage) {
                console.log("[GPT API cost]", {
                    action,
                    model: res.usage.model,
                    prompt_tokens: res.usage.prompt_tokens,
                    completion_tokens: res.usage.completion_tokens,
                    total_tokens: res.usage.total_tokens,
                    cost_usd: res.usage.cost_usd,
                    cost_pln_estimate: res.usage.cost_pln_estimate,
                    rates_usd_per_1m: res.usage.rates_usd_per_1m,
                });
            }

            const assistantMsg = {
                id: nanoid(),
                role: "assistant",
                text: res.message,
                rating: res.rating ?? null,
                tips: res.tips ?? [],
                corrections: res.corrections ?? [],
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
                actionLabel: actionMeta?.label,
                actionColor: actionMeta?.color,
            };
            setMessages(prev => [...prev, assistantMsg]);
            // A successful call consumed AI credits — refresh the visible balance.
            refreshEntitlements?.();
        } catch (err) {
            setMessages(prev => [...prev, {
                id: nanoid(),
                role: "assistant",
                text: `Błąd: ${err.message}`,
                tips: [],
                corrections: [],
                web_sources: [],
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [A4_Elements, api, isLoading, jobDesc, messages, pageSize, refreshEntitlements]);

    const handleAction = useCallback((actionId) => {
        const meta = ACTIONS.find(a => a.id === actionId);
        if (actionId === "position_rating") {
            setShowJobDesc(true);
            return;
        }
        send(actionId, meta?.label || actionId);
    }, [send]);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || isLoading) return;
        if (showJobDesc) {
            // confirm position_rating with job description
            setShowJobDesc(false);
            send("position_rating", `Przeanalizuj moje CV pod kątem tego stanowiska:\n${jobDesc.slice(0, 200)}…`);
            setInput("");
            return;
        }
        send("chat", text);
        setInput("");
    }, [input, isLoading, showJobDesc, jobDesc, send]);

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
                                    <div className={classes.headerSub}>Analizuj, poprawiaj i ulepszaj</div>
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

                        {/* action buttons */}
                        <div className={classes.actions}>
                            {ACTIONS.map(action => (
                                <button
                                    key={action.id}
                                    className={classes.actionBtn}
                                    style={{ "--action-color": action.color }}
                                    onClick={() => handleAction(action.id)}
                                    disabled={isLoading}
                                    title={action.description}
                                >
                                    <action.icon className={classes.actionIcon} />
                                    <span>{action.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* job description input (for position fit) */}
                        <AnimatePresence>
                            {showJobDesc && (
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
                                            onClick={() => setShowJobDesc(false)}
                                        >Anuluj</button>
                                        <button
                                            className={classes.jobDescAnalyse}
                                            disabled={!jobDesc.trim() || isLoading}
                                            onClick={() => {
                                                setShowJobDesc(false);
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
                                    <p>Kliknij akcję powyżej, zadaj pytanie o swoje CV lub wpisz polecenie, np. „zmień rozmiar czcionki nagłówków na 13px”.</p>
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
                                placeholder="Zadaj pytanie lub wydaj polecenie…"
                                rows={1}
                                disabled={isLoading || showJobDesc}
                            />
                            <button
                                className={classes.sendBtn}
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading || showJobDesc}
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
