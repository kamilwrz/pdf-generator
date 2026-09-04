import { useEffect, useRef } from "react";
import { FiCheck, FiSave } from "react-icons/fi";
import { createPortal } from "react-dom";
import classes from "./SaveProgressModal.module.css";

const SAVE_STEPS = [
    {
        id: "prepare",
        title: "Przygotowanie CV",
        description: "Sprawdzamy strony, treść i układ dokumentu.",
    },
    {
        id: "persist",
        title: "Zapis w Moich dokumentach",
        description: "Przesyłamy treść, styl i ustawienia edytora.",
    },
    {
        id: "confirm",
        title: "Potwierdzenie wersji",
        description: "Upewniamy się, że kolejne zmiany trafią do tego samego CV.",
    },
];

const PHASE_INDEX = Object.freeze({ prepare: 0, persist: 1, confirm: 2 });

/**
 * Blocking progress surface shown only while the current CV is persisted.
 *
 * The modal intentionally distinguishes account persistence from PDF export:
 * saving keeps the user in the editor and never starts a file download. Its
 * steps follow real boundaries reported by `usePdfExport` rather than a timer.
 * The surface contains no actions because dismissing it mid-request could make
 * the final server revision ambiguous; success and recovery remain available
 * through the editor's existing toast feedback after the request settles.
 *
 * @param {{ open?: boolean, phase?: "prepare"|"persist"|"confirm", title?: string }} props
 * @returns {React.ReactPortal|null} A portalled, editor-only save status modal.
 */
export default function SaveProgressModal({ open = true, phase = "prepare", title = "" }) {
    const modalRef = useRef(null);
    const previousFocusRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        // Saving cannot be cancelled safely after the request begins. Move
        // focus into the modal and contain keyboard navigation there until the
        // server resolves, then return focus to the original Save control.
        previousFocusRef.current = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const focusFrame = window.requestAnimationFrame(() => {
            modalRef.current?.focus({ preventScroll: true });
        });
        const containFocus = (event) => {
            if (event.key !== "Tab" && event.key !== "Escape") return;
            event.preventDefault();
            modalRef.current?.focus({ preventScroll: true });
        };
        window.addEventListener("keydown", containFocus);

        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.removeEventListener("keydown", containFocus);
            document.body.style.overflow = previousBodyOverflow;
            // Disabling the Save button can make Chromium move focus to body
            // before this effect captures it. Prefer a meaningful prior target,
            // then fall back to the now-enabled Save action explicitly.
            const previousFocus = previousFocusRef.current;
            const restoreTarget = previousFocus instanceof HTMLElement
                && previousFocus !== document.body
                && previousFocus.isConnected
                ? previousFocus
                : document.querySelector('button[aria-label="Zapisz dokument"]');
            if (restoreTarget instanceof HTMLElement) {
                restoreTarget.focus({ preventScroll: true });
            }
        };
    }, [open]);

    if (!open) return null;

    const activeIndex = PHASE_INDEX[phase] ?? PHASE_INDEX.prepare;
    const progress = ((activeIndex + 1) / SAVE_STEPS.length) * 100;
    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    const fileLabel = `${trimmedTitle || "Twoje CV"}.pdf`;

    return createPortal(
        <div
            className={classes.overlay}
        >
            <section
                ref={modalRef}
                className={classes.modal}
                role="dialog"
                aria-modal="true"
                aria-busy="true"
                aria-labelledby="save-progress-title"
                aria-describedby="save-progress-description"
                tabIndex={-1}
            >
                <header className={classes.header}>
                    <div className={classes.mark} aria-hidden="true">
                        <FiSave />
                        <span>CV</span>
                    </div>
                    <div className={classes.intro}>
                        <div className={classes.eyebrow}>
                            <span>Zapis CV</span>
                            <span className={classes.destination}>Moje dokumenty</span>
                        </div>
                        <h2 id="save-progress-title">Zapisujemy Twoje CV</h2>
                        <p id="save-progress-description">
                            Zachowujemy projekt do dalszej edycji. Plik PDF nie zostanie teraz pobrany.
                        </p>
                    </div>
                </header>

                <div className={classes.body}>
                    <div
                        className={classes.progressTrack}
                        role="progressbar"
                        aria-label="Postęp zapisu CV"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={Math.round(progress)}
                    >
                        <span style={{ width: `${progress}%` }} />
                    </div>

                    <ol className={classes.steps}>
                        {SAVE_STEPS.map((step, index) => {
                            const isComplete = index < activeIndex;
                            const isActive = index === activeIndex;
                            const statusLabel = isComplete ? "Gotowe" : (isActive ? "W toku" : "Oczekuje");

                            return (
                                <li
                                    key={step.id}
                                    className={`${classes.step} ${isComplete ? classes.complete : ""} ${isActive ? classes.active : ""}`}
                                    aria-current={isActive ? "step" : undefined}
                                >
                                    <span className={classes.stepIndex} aria-hidden="true">
                                        {isComplete ? <FiCheck /> : String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span className={classes.stepCopy}>
                                        <strong>{step.title}</strong>
                                        <span>{step.description}</span>
                                    </span>
                                    <span className={classes.stepStatus}>{statusLabel}</span>
                                </li>
                            );
                        })}
                    </ol>
                </div>

                <footer className={classes.footer}>
                    <span className={classes.fileLabel} title={fileLabel}>{fileLabel}</span>
                    <span>Po zapisie pozostaniesz w edytorze</span>
                </footer>
                <p className={classes.liveStatus} role="status" aria-live="polite" aria-atomic="true">
                    {`Zapisywanie CV. Aktualny etap: ${SAVE_STEPS[activeIndex].title}.`}
                </p>
            </section>
        </div>,
        document.body,
    );
}
