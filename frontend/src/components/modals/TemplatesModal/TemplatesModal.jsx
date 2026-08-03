/**
 * Template picker. Free vs paid cards respect entitlements; picking logs a
 * product metric and can warn before replacing a non-empty canvas.
 * Cards are grouped under the seven product collections (Finanse → Iconic).
 */
import { use, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle } from "react-icons/fi";
import classes from "./TemplatesModal.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { TEMPLATES } from "../../../templates";
import DialogShell from "../../common/DialogShell/DialogShell";
import { logEvent } from "../../../services/eventLog";
import { isTemplateAllowed } from "../../../utils/entitlements";
import { groupTemplatesByCollection } from "../../../utils/templateCollections";

function templateCountLabel(count) {
    if (count === 1) return "1 szablon";
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        return `${count} szablony`;
    }
    return `${count} szablonów`;
}

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
                title: "Szablon w planie Standard",
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
    const templateGroups = useMemo(() => groupTemplatesByCollection(TEMPLATES), []);

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
                            ? `${TEMPLATES.length} szablonów CV · 7 kolekcji`
                            : `${freeCount} z ${TEMPLATES.length} dostępnych na planie Free`}
                    </span>
                )}
            >
                <div className={classes.groups}>
                    {templateGroups.map((group) => (
                        <section key={group.collection} className={classes.group}>
                            <header className={classes.groupHeader}>
                                <h3 className={classes.groupTitle}>{group.collection}</h3>
                                <span className={classes.groupCount}>
                                    {templateCountLabel(group.templates.length)}
                                </span>
                            </header>
                            <div className={classes.grid}>
                                {group.templates.map((t) => {
                                    const locked = !isTemplateAllowed(t, entitlements);
                                    return (
                                        <div key={t.id} className={`${classes.card} ${locked ? classes.cardLocked : ""}`}>
                                            <div className={classes.previewWrap}>
                                                <Preview id={t.id} name={t.name} />
                                                {locked ? <span className={classes.lockBadge}>Standard</span> : null}
                                            </div>
                                            <div className={classes.cardName}>{t.name}</div>
                                            <div className={classes.cardIndustry}>{t.industry}</div>
                                            <button
                                                type="button"
                                                className={locked ? classes.lockedBtn : classes.useBtn}
                                                onClick={() => handlePick(t)}
                                            >
                                                {locked ? "Odblokuj w Standard" : "Użyj szablonu"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
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
