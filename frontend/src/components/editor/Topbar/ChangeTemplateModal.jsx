/**
 * "Zmień szablon" dialog — restyles the CV currently on the canvas.
 *
 * Reuses the exact cv_data captured by AiCvPanel/BioCvModal on their last
 * successful fill (`PdfContext.activeCvData`) and the same TemplateCarousel
 * gallery, so picking a template here calls the identical `/ai/fill_template`
 * endpoint. The key difference from those two flows: this one applies the
 * result via `replaceActiveElements` (the raw canvas replace) instead of
 * `loadAiElements`, so it keeps the current document's `pdfId` and title —
 * restyling the existing project in place rather than starting a new one.
 */
import { useCallback, useMemo, useState, use } from "react";
import classes from "./ChangeTemplateModal.module.css";
import DialogShell from "../../common/DialogShell/DialogShell";
import TemplateCarousel from "../../ai/AiCvPanel/TemplateCarousel";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient } from "../../../services/api";
import { fillTemplate } from "../../../services/fillTemplate";
import { TEMPLATES } from "../../../templates";
import { selectCvTemplates } from "../../../utils/cvTemplateSelection";
import { isTemplateAllowed, planErrorMessage } from "../../../utils/entitlements";

export default function ChangeTemplateModal() {
    const {
        isChangeTemplateModal,
        showChangeTemplateModal,
        activeCvData,
        entitlements,
        replaceActiveElements,
        pushToast,
    } = use(PdfContext);

    const [fillingId, setFillingId] = useState(null);
    const [error, setError] = useState(null);
    const cvTemplates = useMemo(() => selectCvTemplates(TEMPLATES), []);

    const api = useMemo(
        () => new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` }),
        [],
    );

    const handleChangeTemplate = useCallback(async (template) => {
        if (!activeCvData) return;
        if (!isTemplateAllowed(template, entitlements)) {
            setError("Ten szablon jest dostępny w planie Standard.");
            return;
        }
        setFillingId(template.id);
        setError(null);
        try {
            const res = await fillTemplate(activeCvData, template.id, {
                api,
                errorMessage: "Zmiana szablonu nie powiodła się",
            });
            // No title argument: `replaceActiveElements` only overwrites the
            // title input when one is passed, so the project keeps whatever
            // name the user already gave it.
            replaceActiveElements(res.elements, undefined, template.id);
            pushToast?.({
                title: "Szablon zmieniony",
                msg: `CV wygląda teraz jak szablon ${template.name}.`,
                variant: "success",
            });
            showChangeTemplateModal();
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się zmienić szablonu."));
        } finally {
            setFillingId(null);
        }
    }, [activeCvData, api, entitlements, pushToast, replaceActiveElements, showChangeTemplateModal]);

    return (
        <DialogShell
            open={Boolean(isChangeTemplateModal)}
            onClose={showChangeTemplateModal}
            width={1400}
            radius={2}
            title="Zmień szablon"
            subtitle="Dane Twojego CV zostają takie same — zmienia się tylko wygląd."
        >
            <div className={classes.wrap}>
                {activeCvData ? (
                    <>
                        <div className={classes.identity}>
                            <div className={classes.identityName}>{activeCvData.name || "Twoje CV"}</div>
                            {activeCvData.title && <div className={classes.identityMeta}>{activeCvData.title}</div>}
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
