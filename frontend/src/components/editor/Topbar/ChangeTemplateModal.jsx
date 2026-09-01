/**
 * "Zmień szablon" dialog — restyles the CV currently on the canvas.
 *
 * Reuses the exact cv_data captured by AiCvPanel/BioCvModal on their last
 * successful fill (`CanvasContext.activeCvData`) and the same TemplateCarousel
 * gallery. Applying a card calls `useApplyCvTemplate` (identical
 * `/ai/fill_template` + `replaceActiveElements` path as the topbar arrows)
 * and then closes this dialog.
 */
import { useCallback, useMemo } from "react";
import classes from "./ChangeTemplateModal.module.css";
import DialogShell from "../../common/DialogShell/DialogShell";
import TemplateCarousel from "../../ai/AiCvPanel/TemplateCarousel";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import { TEMPLATES } from "../../../templates";
import { selectCvTemplates } from "../../../utils/cvTemplateSelection";
import { useApplyCvTemplate } from "../../../hooks/useApplyCvTemplate";

export default function ChangeTemplateModal() {
    const { isChangeTemplateModal, showChangeTemplateModal } = useUiSurfaces();
    const { activeCvData, activeTemplateId } = useCanvasContext();
    const { entitlements } = useSession();
    const { applyTemplate, fillingId, error } = useApplyCvTemplate();

    const cvTemplates = useMemo(() => selectCvTemplates(TEMPLATES), []);
    const activeTemplate = useMemo(
        () => cvTemplates.find((template) => template.id === activeTemplateId) || null,
        [cvTemplates, activeTemplateId],
    );

    const handleChangeTemplate = useCallback(async (template) => {
        const applied = await applyTemplate(template);
        if (applied) showChangeTemplateModal();
    }, [applyTemplate, showChangeTemplateModal]);

    return (
        <DialogShell
            open={Boolean(isChangeTemplateModal)}
            onClose={showChangeTemplateModal}
            width={1400}
            title="Zmień szablon"
            subtitle="Dane Twojego CV zostają takie same — zmienia się tylko wygląd."
        >
            <div className={classes.wrap}>
                {activeCvData ? (
                    <>
                        <div className={classes.identity}>
                            <div className={classes.identityName}>{activeCvData.name || "Twoje CV"}</div>
                            {activeCvData.title && <div className={classes.identityMeta}>{activeCvData.title}</div>}
                            {activeTemplate && (
                                <div className={classes.identityTemplate}>
                                    Aktualny szablon: <strong>{activeTemplate.name}</strong>
                                    {activeTemplate.description ? ` · ${activeTemplate.description}` : ""}
                                </div>
                            )}
                            <div className={classes.identityStats}>
                                <span>{activeCvData.experience?.length ?? 0} {activeCvData.experience?.length === 1 ? "stanowisko" : "stanowisk"}</span>
                                <span>·</span>
                                <span>{activeCvData.education?.length ?? 0} {activeCvData.education?.length === 1 ? "wpis edukacyjny" : "wpisów edukacyjnych"}</span>
                                <span>·</span>
                                <span>{activeCvData.skills?.length ?? 0} {activeCvData.skills?.length === 1 ? "umiejętność" : "umiejętności"}</span>
                            </div>
                        </div>
                        {cvTemplates.length > 0 ? (
                            <div className={classes.carouselSection}>
                                <TemplateCarousel
                                    templates={cvTemplates}
                                    entitlements={entitlements}
                                    fillingId={fillingId}
                                    selectedId={activeTemplateId}
                                    onSelect={handleChangeTemplate}
                                />
                            </div>
                        ) : (
                            <p className={classes.hint}>Nie ma jeszcze dostępnych szablonów CV.</p>
                        )}
                        {error && <div className={classes.error}>{error}</div>}
                    </>
                ) : (
                    <p className={classes.hint}>
                        Ten dokument nie ma jeszcze danych do ponownego wypełnienia. Użyj „Wypełnij z PDF” lub
                        kreatora krok po kroku, aby móc później zmieniać szablon jednym kliknięciem.
                    </p>
                )}
            </div>
        </DialogShell>
    );
}
