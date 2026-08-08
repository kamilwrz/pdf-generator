/**
 * Template picker. Free vs paid cards respect entitlements; picking logs a
 * product metric and can warn before replacing a non-empty canvas.
 * Each template is an individual card (name + short stylistic description).
 */
import { use, useState } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle } from "react-icons/fi";
import classes from "./TemplatesModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { TEMPLATES } from "../../../templates";
import DialogShell from "../../common/DialogShell/DialogShell";
import { logEvent } from "../../../services/eventLog";
import { isTemplateAllowed } from "../../../utils/entitlements";

// Real cropped screenshot of the template's own canvas data — see
// frontend/public/template-mockups/. Card aspect ratio matches A4 portrait.
function Preview({ id, name }) {
    return (
        <div className={classes.paper}>
            <img className={classes.previewImg} src={`/template-mockups/${id}.png`} alt={name} loading="lazy" />
        </div>
    );
}

export default function TemplatesModal() {
    const {
        isTemplates, showTemplates, loadTemplate, A4_Elements,
        autoOpenedTemplates, markTemplatesModalSeen, entitlements, pushToast,
    } = use(PdfContext);

    const [pendingTemplate, setPendingTemplate] = useState(null);

    function applyTemplate(t) {
        const title = `CV ${t.name}`;
        loadTemplate(t.elements, title, t.id);
        if (autoOpenedTemplates) {
            logEvent("template_picked", t.id);
            markTemplatesModalSeen();
        }
        setPendingTemplate(null);
        showTemplates();
    }

    function handlePick(t) {
        if (!isTemplateAllowed(t, entitlements)) {
            pushToast?.({
                title: "Szablon w planie Pro",
                msg: "Ten szablon odblokujesz po ulepszeniu planu.",
                variant: "error",
            });
            return;
        }
        if (A4_Elements.length > 0) {
            setPendingTemplate(t);
            return;
        }
        applyTemplate(t);
    }

    // Dismissing (backdrop click / close button / Escape). While the replace
    // confirm is open, cancel only that confirm — don't close the picker.
    function handleClose() {
        if (pendingTemplate != null) {
            setPendingTemplate(null);
            return;
        }
        if (autoOpenedTemplates) {
            logEvent("template_dismissed");
            markTemplatesModalSeen();
        }
        showTemplates();
    }

    const freeCount = TEMPLATES.filter((t) => isTemplateAllowed(t, entitlements)).length;

    return (
        <>
            <DialogShell
                open={isTemplates}
                onClose={handleClose}
                width={1280}
                radius={2}
                title="Szablony"
                subtitle="Wybierz układ — treść na płótnie zostanie zastąpiona."
                footer={(
                    <span className={classes.countLabel}>
                        {entitlements?.template_tier === "all"
                            ? `${TEMPLATES.length} szablonów CV`
                            : `${freeCount} z ${TEMPLATES.length} dostępnych na planie Free`}
                    </span>
                )}
            >
                <div className={classes.gridWrap}>
                    <div className={classes.grid}>
                        {TEMPLATES.map((t) => {
                            const locked = !isTemplateAllowed(t, entitlements);
                            return (
                                <div key={t.id} className={`${classes.card} ${locked ? classes.cardLocked : ""}`}>
                                    <div className={classes.previewWrap}>
                                        <Preview id={t.id} name={t.name} />
                                        {locked ? <span className={classes.lockBadge}>Pro</span> : null}
                                    </div>
                                    <div className={classes.cardName}>{t.name}</div>
                                    <div className={classes.cardDescription}>{t.description}</div>
                                    <button
                                        type="button"
                                        className={locked ? classes.lockedBtn : classes.useBtn}
                                        onClick={() => handlePick(t)}
                                    >
                                        {locked ? "Odblokuj w Pro" : "Użyj szablonu"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </DialogShell>

            {pendingTemplate != null && createPortal(
                <div className={classes.confirmBackdrop} onClick={() => setPendingTemplate(null)}>
                    <div
                        className={classes.confirmDialog}
                        role="alertdialog"
                        aria-labelledby="template-replace-title"
                        aria-describedby="template-replace-desc"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={classes.confirmHeader}>
                            <div className={classes.confirmIcon} aria-hidden="true">
                                <FiAlertTriangle />
                            </div>
                            <div>
                                <h2 id="template-replace-title">Zastąpić płótno?</h2>
                                <p id="template-replace-desc">
                                    Szablon „{pendingTemplate.name}” zastąpi bieżącą treść.
                                    Niezapisane elementy zostaną usunięte.
                                </p>
                            </div>
                        </div>
                        <div className={classes.confirmFooter}>
                            <button
                                type="button"
                                className={classes.confirmCancel}
                                onClick={() => setPendingTemplate(null)}
                            >
                                Anuluj
                            </button>
                            <button
                                type="button"
                                className={classes.confirmApply}
                                onClick={() => applyTemplate(pendingTemplate)}
                            >
                                Zastąp szablonem
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
