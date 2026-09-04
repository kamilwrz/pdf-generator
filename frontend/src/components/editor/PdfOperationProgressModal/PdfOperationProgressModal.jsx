import { useEffect, useRef } from "react";
import { FiCheck, FiDownload, FiSave } from "react-icons/fi";
import { createPortal } from "react-dom";
import classes from "./PdfOperationProgressModal.module.css";

const OPERATION_CONFIG = Object.freeze({
    save: {
        Icon: FiSave,
        eyebrow: "Zapis CV",
        destination: "Moje dokumenty",
        heading: "Zapisujemy Twoje CV",
        description: "Zachowujemy projekt do dalszej edycji. Plik PDF nie zostanie teraz pobrany.",
        progressLabel: "Postęp zapisu CV",
        fallbackControlLabel: "Zapisz dokument",
        footer: "Po zapisie pozostaniesz w edytorze",
        livePrefix: "Zapisywanie CV",
        phases: [
            { id: "prepare", title: "Przygotowanie CV", description: "Sprawdzamy strony, treść i układ dokumentu." },
            { id: "persist", title: "Zapis w Moich dokumentach", description: "Przesyłamy treść, styl i ustawienia edytora." },
            { id: "confirm", title: "Potwierdzenie wersji", description: "Upewniamy się, że kolejne zmiany trafią do tego samego CV." },
        ],
    },
    download: {
        Icon: FiDownload,
        eyebrow: "Pobieranie CV",
        destination: "Ten komputer",
        heading: "Przygotowujemy plik PDF",
        description: "Tworzymy aktualną wersję CV. Projekt w edytorze i Moich dokumentach pozostanie bez zmian.",
        progressLabel: "Postęp pobierania CV",
        fallbackControlLabel: "Pobierz PDF",
        footer: "Pobieranie rozpocznie się automatycznie",
        livePrefix: "Pobieranie CV",
        phases: [
            { id: "prepare", title: "Przygotowanie stron", description: "Sprawdzamy treść, układ i podział na strony." },
            { id: "render", title: "Generowanie pliku PDF", description: "Renderujemy aktualną wersję CV w formacie PDF." },
            { id: "download", title: "Rozpoczęcie pobierania", description: "Przekazujemy gotowy plik do Twojej przeglądarki." },
        ],
    },
});

/**
 * Shared, blocking progress surface for save and download operations.
 *
 * Both variants use the same geometry, focus containment and semantic progress
 * contract while keeping their destinations and side effects explicit. The
 * active phase is supplied by `usePdfExport`, which advances it only after the
 * corresponding real operation boundary has completed.
 *
 * @param {{ open?: boolean, operation?: "save"|"download", phase?: string, title?: string }} props
 * @returns {React.ReactPortal|null} A portalled, editor-only operation status modal.
 */
export default function PdfOperationProgressModal({ open = true, operation = "save", phase, title = "" }) {
    const modalRef = useRef(null);
    const previousFocusRef = useRef(null);
    const config = OPERATION_CONFIG[operation] ?? OPERATION_CONFIG.save;
    const activeIndex = Math.max(0, config.phases.findIndex((item) => item.id === phase));
    const activePhase = config.phases[activeIndex];
    const progress = ((activeIndex + 1) / config.phases.length) * 100;
    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    const fileLabel = `${trimmedTitle || "Twoje CV"}.pdf`;
    const Icon = config.Icon;
    const titleId = `${operation}-progress-title`;
    const descriptionId = `${operation}-progress-description`;

    useEffect(() => {
        if (!open) return undefined;

        // Neither persistence nor server-side rendering can be cancelled once
        // started. Keep focus inside the status surface until the operation
        // settles, then return it to the exact initiating control when possible.
        previousFocusRef.current = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const focusFrame = window.requestAnimationFrame(() => modalRef.current?.focus({ preventScroll: true }));
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
            const previousFocus = previousFocusRef.current;
            const restoreTarget = previousFocus instanceof HTMLElement
                && previousFocus !== document.body
                && previousFocus.isConnected
                ? previousFocus
                : document.querySelector(`button[aria-label="${config.fallbackControlLabel}"]`);
            if (restoreTarget instanceof HTMLElement) restoreTarget.focus({ preventScroll: true });
        };
    }, [config.fallbackControlLabel, open]);

    if (!open) return null;

    return createPortal(
        <div className={classes.overlay}>
            <section
                ref={modalRef}
                className={classes.modal}
                role="dialog"
                aria-modal="true"
                aria-busy="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
            >
                <header className={classes.header}>
                    <div className={classes.mark} aria-hidden="true"><Icon /><span>PDF</span></div>
                    <div className={classes.intro}>
                        <div className={classes.eyebrow}>
                            <span>{config.eyebrow}</span>
                            <span className={classes.destination}>{config.destination}</span>
                        </div>
                        <h2 id={titleId}>{config.heading}</h2>
                        <p id={descriptionId}>{config.description}</p>
                    </div>
                </header>

                <div className={classes.body}>
                    <div
                        className={classes.progressTrack}
                        role="progressbar"
                        aria-label={config.progressLabel}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={Math.round(progress)}
                    >
                        <span style={{ width: `${progress}%` }} />
                    </div>

                    <ol className={classes.steps}>
                        {config.phases.map((item, index) => {
                            const isComplete = index < activeIndex;
                            const isActive = index === activeIndex;
                            const statusLabel = isComplete ? "Gotowe" : (isActive ? "W toku" : "Oczekuje");
                            return (
                                <li
                                    key={item.id}
                                    className={`${classes.step} ${isComplete ? classes.complete : ""} ${isActive ? classes.active : ""}`}
                                    aria-current={isActive ? "step" : undefined}
                                >
                                    <span className={classes.stepIndex} aria-hidden="true">
                                        {isComplete ? <FiCheck /> : String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span className={classes.stepCopy}>
                                        <strong>{item.title}</strong>
                                        <span>{item.description}</span>
                                    </span>
                                    <span className={classes.stepStatus}>{statusLabel}</span>
                                </li>
                            );
                        })}
                    </ol>
                </div>

                <footer className={classes.footer}>
                    <span className={classes.fileLabel} title={fileLabel}>{fileLabel}</span>
                    <span>{config.footer}</span>
                </footer>
                <p className={classes.liveStatus} role="status" aria-live="polite" aria-atomic="true">
                    {`${config.livePrefix}. Aktualny etap: ${activePhase.title}.`}
                </p>
            </section>
        </div>,
        document.body,
    );
}
