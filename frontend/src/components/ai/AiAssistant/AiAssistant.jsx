import { useState, useRef, useEffect, useCallback, use } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { nanoid } from "nanoid";
import { BsStars } from "react-icons/bs";
import { FaArrowsAltH, FaStar, FaPalette, FaBriefcase, FaFont, FaMagic, FaRobot } from "react-icons/fa";
import { RiEditLine } from "react-icons/ri";
import { IoClose, IoSend } from "react-icons/io5";
import { MdCheckCircle, MdCancel } from "react-icons/md";
import classes from "./AiAssistant.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";

// ── quick actions ─────────────────────────────────────────────────────────
const ACTIONS = [
    { id: "rating",          label: "Oceń CV",           icon: FaStar,        color: "#F59E0B", description: "Ogólna ocena jakości CV w skali 1–10" },
    { id: "design_rating",   label: "Projekt",           icon: FaPalette,     color: "#6B21A8", description: "Ocena wyglądu i układu wizualnego" },
    { id: "position_rating", label: "Dopasowanie",       icon: FaBriefcase,   color: "#0D9488", description: "Dopasowanie CV do opisu stanowiska" },
    { id: "grammar",         label: "Gramatyka",         icon: RiEditLine,    color: "#4C51BF", description: "Znajdź i popraw błędy gramatyczne" },
    { id: "language",        label: "Styl",              icon: FaFont,        color: "#2B6CB0", description: "Popraw ton i klarowność tekstu" },
    { id: "improve",         label: "Ulepsz",            icon: FaMagic,       color: "#5FA777", description: "Mocniejsze punkty z czasownikami akcji" },
    { id: "ats_score",       label: "Wynik ATS",         icon: FaRobot,       color: "#D63384", description: "Sprawdzenie pod systemy rekrutacyjne ATS" },
    { id: "layout",          label: "Układ",             icon: FaArrowsAltH,  color: "#B56520", description: "Sprawdź rozmieszczenie, wyrównanie i odstępy" },
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

function ChatMessage({
    msg,
    correctionStates,
    layoutStates,
    onAccept,
    onReject,
    onApplyAll,
    onPreviewLayout,
    onClearLayoutPreview,
    onAcceptLayout,
    onRejectLayout,
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

                {msg.layout_issues?.length > 0 && (
                    <ul className={classes.layoutIssues}>
                        {msg.layout_issues.map((issue, index) => <li key={index}>{issue.message}</li>)}
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

function createLayoutSnapshot(elements) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    return elements.map(element => {
        const left = Number(element.left) || 0;
        const top = Number(element.top) || 0;
        let width = Number(element.width) || 0;
        let height = Number(element.height) || 0;

        if (element.category === "text" && context) {
            const fontSize = Number(element.fontSize) || 12;
            const weight = element.bold ? 700 : 400;
            const style = element.italic ? "italic" : "normal";
            context.font = `${style} ${weight} ${fontSize}px ${element.fontFamily || "sans-serif"}`;
            width = Math.max(
                ...String(element.content || "").split("\n").map(line => context.measureText(line).width),
                fontSize
            );
            height = Math.max(fontSize * 1.35, (element.fontSize || fontSize) * 1.35);
        }

        return {
            ...element,
            layout_bounds: { left, top, width, height },
        };
    });
}

export default function AiAssistant() {
    const {
        A4_Elements,
        editElementValues,
        applyLayoutPatches,
        setLayoutPreviewPatches,
        pageSize,
    } = use(PdfContext);

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [jobDesc, setJobDesc] = useState("");
    const [showJobDesc, setShowJobDesc] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [correctionStates, setCorrectionStates] = useState({});
    const [layoutStates, setLayoutStates] = useState({});

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
        setLayoutPreviewPatches(group.patches || []);
        setLayoutStates(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(key => {
                if (next[key] === "preview") next[key] = "pending";
            });
            next[`${msgId}_${group.id}`] = "preview";
            return next;
        });
    }, [setLayoutPreviewPatches]);

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

    // ── send message to backend ──────────────────────────────────────────

    const send = useCallback(async (action, userText) => {
        if (isLoading) return;

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
                    elements: action === "layout" ? createLayoutSnapshot(A4_Elements) : A4_Elements,
                    message: action === "chat" ? userText : "",
                    job_description: action === "position_rating" ? jobDesc : "",
                    page_size: pageSize,
                }),
                "Asystent AI nie odpowiedział"
            );

            const assistantMsg = {
                id: nanoid(),
                role: "assistant",
                text: res.message,
                rating: res.rating ?? null,
                tips: res.tips ?? [],
                corrections: res.corrections ?? [],
                layout_groups: res.layout_groups ?? [],
                layout_issues: res.layout_issues ?? [],
                web_sources: res.web_sources ?? [],
                actionLabel: actionMeta?.label,
                actionColor: actionMeta?.color,
            };
            setMessages(prev => [...prev, assistantMsg]);
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
    }, [A4_Elements, api, isLoading, jobDesc, pageSize]);

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
            </button>

            {/* ── sliding panel ── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.aside
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
                            <button className={classes.closeBtn} onClick={() => {
                                setLayoutPreviewPatches([]);
                                setIsOpen(false);
                            }}>
                                <IoClose />
                            </button>
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
                                <motion.div
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
                                </motion.div>
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
                                    onAccept={acceptCorrection}
                                    onReject={rejectCorrection}
                                    onApplyAll={applyAll}
                                    onPreviewLayout={previewLayoutGroup}
                                    onClearLayoutPreview={clearLayoutPreview}
                                    onAcceptLayout={acceptLayoutGroup}
                                    onRejectLayout={rejectLayoutGroup}
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
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
}
