/**
 * Template picker. Free vs paid cards respect entitlements; picking logs a
 * product metric and can warn before replacing a non-empty canvas.
 * Each template is an individual card (name + short stylistic description).
 */
import { useState } from "react";
import classes from "./TemplatesModal.module.css";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import { TEMPLATES } from "../../../templates";
import DialogShell from "../../common/DialogShell/DialogShell";
import { logEvent } from "../../../services/eventLog";
import { isTemplateAllowed } from "../../../utils/entitlements";
import { getTemplateAtsReadability } from "../../../utils/templateLayouts";
import { fillTemplate } from "../../../services/fillTemplate";
import { createEmptyBioCvData } from "../../../utils/bioCvData";

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
    const { loadTemplate, A4_Elements, loadAiElements, activeCvData, flowSpacing } = useCanvasContext();
    const { entitlements, pushToast } = useSession();
    const {
        isTemplates,
        showTemplates,
        autoOpenedTemplates,
        markTemplatesModalSeen,
    } = useUiSurfaces();

    const [pendingTemplate, setPendingTemplate] = useState(null);
    const [loadingTemplateId, setLoadingTemplateId] = useState(null);

    async function applyTemplate(t) {
        if (!t || loadingTemplateId) return;
        // Template identity belongs to the layout, not the user's document name.
        const title = "";
        setLoadingTemplateId(t.id);
        try {
            if (Array.isArray(t.elements)) {
                const applied = await loadTemplate(t.elements, title, t.id);
                if (applied === false) return;
            } else {
                // Pro packs never enter the public JS bundle. A blank selection
                // uses a minimal editable profile; a template change reuses the
                // semantic CV snapshot already attached to the document.
                const profile = activeCvData || {
                    ...createEmptyBioCvData(),
                    name: "Imię Nazwisko",
                    title: "Stanowisko",
                };
                const response = await fillTemplate(profile, t.id, { spacing: flowSpacing });
                const applied = await loadAiElements(
                    response.elements,
                    title,
                    t.id,
                    { cvData: profile },
                );
                if (applied === false) return;
            }
            if (autoOpenedTemplates) {
                logEvent("template_picked", t.id);
                markTemplatesModalSeen();
            }
            setPendingTemplate(null);
            showTemplates();
        } catch (error) {
            pushToast?.({
                title: "Nie udało się wczytać szablonu",
                msg: error?.message || "Spróbuj ponownie za chwilę.",
                variant: "error",
            });
        } finally {
            setLoadingTemplateId(null);
        }
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
                open={isTemplates && pendingTemplate == null}
                onClose={handleClose}
                width={1280}
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
                            const ats = getTemplateAtsReadability(t);
                            return (
                                <div key={t.id} className={`${classes.card} ${locked ? classes.cardLocked : ""}`}>
                                    <div className={classes.previewWrap}>
                                        <Preview id={t.id} name={t.name} />
                                        {locked ? <span className={classes.lockBadge}>Pro</span> : null}
                                    </div>
                                    <div className={classes.cardName}>{t.name}</div>
                                    <div className={classes.cardDescription}>{t.description}</div>
                                    <span
                                        className={`${classes.atsBadge} ${classes[`atsBadge_${ats.id}`] || ""}`}
                                        title={ats.hint}
                                    >
                                        {ats.label}
                                    </span>
                                    <button
                                        type="button"
                                        className={locked ? classes.lockedBtn : classes.useBtn}
                                        onClick={() => handlePick(t)}
                                        disabled={loadingTemplateId != null}
                                    >
                                        {locked
                                            ? "Odblokuj w Pro"
                                            : loadingTemplateId === t.id
                                                ? "Wczytywanie…"
                                                : "Użyj szablonu"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </DialogShell>

            <DialogShell
                open={pendingTemplate != null}
                onClose={() => setPendingTemplate(null)}
                width={420}
                role="alertdialog"
                initialFocusSelector="[data-dialog-initial-focus]"
                title="Zastąpić płótno?"
                subtitle={pendingTemplate
                    ? `Szablon „${pendingTemplate.name}” zastąpi bieżącą treść. Niezapisane elementy zostaną usunięte.`
                    : ""}
                footer={(
                    <div className={classes.confirmActions}>
                            <button
                                type="button"
                                className={classes.confirmCancel}
                                data-dialog-initial-focus
                                onClick={() => setPendingTemplate(null)}
                            >
                                Anuluj
                            </button>
                            <button
                                type="button"
                                className={classes.confirmApply}
                                onClick={() => applyTemplate(pendingTemplate)}
                                disabled={loadingTemplateId != null}
                            >
                                {loadingTemplateId ? "Wczytywanie…" : "Zastąp szablonem"}
                            </button>
                    </div>
                )}
            />
        </>
    );
}
