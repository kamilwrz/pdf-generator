import { useState, useRef, useEffect, useCallback, use } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { nanoid } from "nanoid";
import { BsStars } from "react-icons/bs";
import { FaStar, FaPalette, FaBriefcase, FaFont, FaMagic, FaRobot } from "react-icons/fa";
import { RiEditLine } from "react-icons/ri";
import { IoClose, IoSend } from "react-icons/io5";
import { MdCheckCircle, MdCancel } from "react-icons/md";
import classes from "./AiAssistant.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";

// ── quick actions ─────────────────────────────────────────────────────────
const ACTIONS = [
    { id: "rating",          label: "Rate CV",      icon: FaStar,        color: "#F59E0B", description: "Overall CV quality score 1–10" },
    { id: "design_rating",   label: "Design",       icon: FaPalette,     color: "#6B21A8", description: "Visual design & layout assessment" },
    { id: "position_rating", label: "Position Fit", icon: FaBriefcase,   color: "#0D9488", description: "Match CV to a job description" },
    { id: "grammar",         label: "Grammar",      icon: RiEditLine,    color: "#4C51BF", description: "Find and fix grammar errors" },
    { id: "language",        label: "Style",        icon: FaFont,        color: "#2B6CB0", description: "Improve writing tone and clarity" },
    { id: "improve",         label: "Improve",      icon: FaMagic,       color: "#5FA777", description: "Stronger bullets with action verbs" },
    { id: "ats_score",       label: "ATS Score",    icon: FaRobot,       color: "#D63384", description: "Applicant tracking system check" },
];

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
                    <button className={classes.corrAccept} onClick={() => onAccept(msgId, patch)} title="Apply">
                        <MdCheckCircle /> Accept
                    </button>
                    <button className={classes.corrReject} onClick={() => onReject(msgId, element_id)} title="Reject">
                        <MdCancel /> Reject
                    </button>
                </div>
            )}
            {state === "accepted" && <span className={classes.corrBadge} style={{ color: "#5FA777" }}>✓ Applied</span>}
            {state === "rejected" && <span className={classes.corrBadge} style={{ color: "#9A8E7F" }}>✗ Skipped</span>}
        </div>
    );
}

function ChatMessage({ msg, correctionStates, onAccept, onReject, onApplyAll, A4_Elements }) {
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
                            <span>{msg.corrections.length} correction{msg.corrections.length !== 1 ? "s" : ""}</span>
                            {pendingCount > 0 && (
                                <button className={classes.applyAll} onClick={() => onApplyAll(msg.id, msg.corrections)}>
                                    Apply all ({pendingCount})
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

                {/* web sources */}
                {msg.web_sources?.length > 0 && (
                    <div className={classes.sources}>
                        <span className={classes.sourcesLabel}>Sources:</span>
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
    const { A4_Elements, editElementValues } = use(PdfContext);

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [jobDesc, setJobDesc] = useState("");
    const [showJobDesc, setShowJobDesc] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [correctionStates, setCorrectionStates] = useState({});

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
                    elements: A4_Elements,
                    message: action === "chat" ? userText : "",
                    job_description: action === "position_rating" ? jobDesc : "",
                }),
                "AI Assistant failed"
            );

            const assistantMsg = {
                id: nanoid(),
                role: "assistant",
                text: res.message,
                rating: res.rating ?? null,
                tips: res.tips ?? [],
                corrections: res.corrections ?? [],
                web_sources: res.web_sources ?? [],
                actionLabel: actionMeta?.label,
                actionColor: actionMeta?.color,
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err) {
            setMessages(prev => [...prev, {
                id: nanoid(),
                role: "assistant",
                text: `Error: ${err.message}`,
                tips: [],
                corrections: [],
                web_sources: [],
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [A4_Elements, api, isLoading, jobDesc]);

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
            send("position_rating", `Analyse my CV for this position:\n${jobDesc.slice(0, 200)}…`);
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
                title="AI Assistant"
                aria-label="Open AI Assistant"
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
                                    <div className={classes.headerTitle}>AI Assistant</div>
                                    <div className={classes.headerSub}>Analyse, correct & improve</div>
                                </div>
                            </div>
                            <button className={classes.closeBtn} onClick={() => setIsOpen(false)}>
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
                                        Paste the job description to analyse your CV fit:
                                    </label>
                                    <textarea
                                        className={classes.jobDescInput}
                                        value={jobDesc}
                                        onChange={e => setJobDesc(e.target.value)}
                                        placeholder="Senior Frontend Engineer at Acme Inc…"
                                        rows={4}
                                    />
                                    <div className={classes.jobDescRow}>
                                        <button
                                            className={classes.jobDescCancel}
                                            onClick={() => setShowJobDesc(false)}
                                        >Cancel</button>
                                        <button
                                            className={classes.jobDescAnalyse}
                                            disabled={!jobDesc.trim() || isLoading}
                                            onClick={() => {
                                                setShowJobDesc(false);
                                                send("position_rating", `Analyse my CV for this position:\n${jobDesc.slice(0, 200)}…`);
                                            }}
                                        >
                                            Analyse
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
                                    <p>Click an action above or type a question about your CV.</p>
                                </div>
                            )}
                            {messages.map(msg => (
                                <ChatMessage
                                    key={msg.id}
                                    msg={msg}
                                    correctionStates={correctionStates}
                                    onAccept={acceptCorrection}
                                    onReject={rejectCorrection}
                                    onApplyAll={applyAll}
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
                                placeholder="Ask anything about your CV…"
                                rows={1}
                                disabled={isLoading || showJobDesc}
                            />
                            <button
                                className={classes.sendBtn}
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading || showJobDesc}
                                aria-label="Send"
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
