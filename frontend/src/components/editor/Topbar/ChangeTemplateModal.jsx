import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Change-template dialog — restyles the CV currently on the canvas.
 *
 * Reuses the exact cv_data captured by import or the A4 starter on the last
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
  useTranslation();
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
            title={uiText("editor:newCvSetupModal.changeTemplate")}
            subtitle={uiText("editor:changeTemplateModal.yourCvDataStaysTheSameOnly")}
        >
            <div className={classes.wrap}>
                {activeCvData ? (
                    <>
                        <div className={classes.identity}>
                            <div className={classes.identityName}>{activeCvData.name || uiText("editor:changeTemplateModal.yourCv")}</div>
                            {activeCvData.title && <div className={classes.identityMeta}>{activeCvData.title}</div>}
                            {activeTemplate && (
                                <div className={classes.identityTemplate}>{uiText("editor:changeTemplateModal.currentTemplate")} <strong>{activeTemplate.name}</strong>
                                    {activeTemplate.description ? ` · ${activeTemplate.description}` : ""}
                                </div>
                            )}
                            <div className={classes.identityStats}>
                                <span>{activeCvData.experience?.length ?? 0} {activeCvData.experience?.length === 1 ? "stanowisko" : "stanowisk"}</span>
                                <span>·</span>
                                <span>{activeCvData.education?.length ?? 0} {activeCvData.education?.length === 1 ? uiText("ai:aiCvPanel.educationEntry") : uiText("ai:aiCvPanel.educationEntries")}</span>
                                <span>·</span>
                                <span>{activeCvData.skills?.length ?? 0} {activeCvData.skills?.length === 1 ? uiText("ai:aiCvPanel.skill") : uiText("ai:aiCvPanel.skills")}</span>
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
                            <p className={classes.hint}>{uiText("ai:aiCvPanel.noCvTemplatesAreAvailableYet")}</p>
                        )}
                        {error && <div className={classes.error}>{error}</div>}
                    </>
                ) : (
                    <p className={classes.hint}>{uiText("editor:changeTemplateModal.thisDocumentHasNoDataForRefilling")}</p>
                )}
            </div>
        </DialogShell>
    );
}
