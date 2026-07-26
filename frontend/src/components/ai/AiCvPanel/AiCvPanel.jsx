import { useRef, useState, useCallback, use, useMemo } from "react";
import classes from "./AiCvPanel.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { TEMPLATES } from "../../../templates";
import { selectCvTemplates } from "../../../utils/cvTemplateSelection";
import DialogShell from "../../common/DialogShell/DialogShell";

const CV_TEMPLATES = selectCvTemplates(TEMPLATES);

const UploadIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--chrome-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 13v8"/><path d="m8 17 4-4 4 4"/>
        <path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15"/>
    </svg>
);

const SparkIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/>
    </svg>
);

export default function AiCvPanel() {
    const { isAiPanel, showAiPanel, showBioCvModal, loadAiElements } = use(PdfContext);

    const fileRef = useRef(null);
    const [fileName, setFileName] = useState(null);
    const [fileData, setFileData] = useState(null);
    const [cvData, setCvData] = useState(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [fillingId, setFillingId] = useState(null);
    const [error, setError] = useState(null);

    const api = useMemo(
        () => new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` }),
        [],
    );

    function handleFilePick(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        setFileData(f);
        setCvData(null);
        setError(null);
    }

    const handleExtract = useCallback(async () => {
        if (!fileData) return;
        setIsExtracting(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", fileData);
            const res = await api.httpRequest(ENDPOINTS.AI.EXTRACT_CV, "POST", form, "Ekstrakcja CV nie powiodła się");
            setCvData(res.cv_data);
        } catch (err) {
            setError(err.message || "Nie udało się wyodrębnić danych z CV.");
        } finally {
            setIsExtracting(false);
        }
    }, [api, fileData]);

    const handleFill = useCallback(async (template) => {
        if (!cvData) return;
        setFillingId(template.id);
        setError(null);
        try {
            const res = await api.httpRequest(
                ENDPOINTS.AI.FILL_TEMPLATE, "POST",
                JSON.stringify({ cv_data: cvData, template_id: template.id }),
                "Generowanie szablonu nie powiodło się"
            );
            loadAiElements(res.elements, `CV ${template.name}`);
            showAiPanel();
        } catch (err) {
            setError(err.message || "Nie udało się wygenerować szablonu.");
        } finally {
            setFillingId(null);
        }
    }, [api, cvData, loadAiElements, showAiPanel]);

    const extracted = Boolean(cvData?.name);

    return (
        <DialogShell
            open={isAiPanel}
            onClose={showAiPanel}
            width={480}
            title="Wypełnij z mojego CV"
            subtitle="Prześlij PDF — AI wypełni dowolny szablon Twoimi danymi."
            footer={<>
                <span className={classes.stepLabel}>Krok {extracted ? "2" : "1"} z 2</span>
                <div className={classes.footerActions}>
                    <button type="button" className={classes.cancelBtn} onClick={showAiPanel}>Anuluj</button>
                    {!extracted && (
                        <button
                            type="button"
                            className={classes.extractBtn}
                            onClick={handleExtract}
                            disabled={!fileName || isExtracting}
                        >
                            {isExtracting ? (
                                <><span className={classes.spinner} />Wyodrębnianie CV…</>
                            ) : (
                                <><SparkIcon />Wyodrębnij dane CV</>
                            )}
                        </button>
                    )}
                </div>
            </>}
        >
            <div className={classes.section}>
                <div className={classes.sectionLabel}>Krok 1 · Prześlij swoje CV</div>
                <div
                    className={`${classes.dropzone} ${fileName ? classes.dropzoneDone : ""}`}
                    onClick={() => fileRef.current?.click()}
                >
                    <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFilePick} />
                    {fileName ? (
                        <>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                            <span className={classes.dropFileName}>{fileName}</span>
                            <span className={classes.dropChange}>Zmień</span>
                        </>
                    ) : (
                        <>
                            <UploadIcon />
                            <span className={classes.dropText}>Upuść PDF tutaj lub kliknij, aby wybrać plik</span>
                        </>
                    )}
                </div>
                {!extracted && (
                    <button type="button" className={classes.guidedLink} onClick={showBioCvModal}>
                        Nie masz gotowego PDF? Utwórz CV krok po kroku
                    </button>
                )}
            </div>

            {extracted && (
                <div className={classes.preview}>
                    <div className={classes.previewName}>{cvData.name}</div>
                    <div className={classes.previewMeta}>{cvData.title}</div>
                    <div className={classes.previewStats}>
                        <span>{cvData.experience?.length ?? 0} {cvData.experience?.length === 1 ? "stanowisko" : "stanowisk"}</span>
                        <span>·</span>
                        <span>{cvData.education?.length ?? 0} {cvData.education?.length === 1 ? "wpis edukacyjny" : "wpisów edukacyjnych"}</span>
                        <span>·</span>
                        <span>{cvData.skills?.length ?? 0} {cvData.skills?.length === 1 ? "umiejętność" : "umiejętności"}</span>
                    </div>
                    <button type="button" className={classes.reExtract} onClick={() => { setCvData(null); }}>
                        Wyodrębnij ponownie
                    </button>
                </div>
            )}

            <div className={`${classes.section} ${!extracted ? classes.sectionDisabled : ""}`}>
                <div className={classes.sectionLabel}>Krok 2 · Wybierz szablon do wypełnienia</div>
                {extracted ? (
                    CV_TEMPLATES.length > 0 ? <>
                        <div className={classes.templateGrid}>
                            {CV_TEMPLATES.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={classes.templateCard}
                                    onClick={() => handleFill(t)}
                                    disabled={fillingId !== null}
                                >
                                    <span className={classes.dot} style={{ background: t.accent }} />
                                    <span className={classes.tName}>{t.name}</span>
                                    {fillingId === t.id && <span className={classes.spinner} />}
                                </button>
                            ))}
                        </div>
                        <p className={classes.hint}>
                            Możesz wypełnić wiele szablonów bez ponownego przesyłania pliku.
                            Każdy otworzy się na płótnie do natychmiastowej edycji.
                        </p>
                    </> : (
                        <p className={classes.hint}>Nie ma jeszcze dostępnych szablonów CV.</p>
                    )
                ) : (
                    <p className={classes.hint}>Dostępne po wyodrębnieniu danych z pliku.</p>
                )}
            </div>

            {error && <div className={classes.error}>{error}</div>}
        </DialogShell>
    );
}
