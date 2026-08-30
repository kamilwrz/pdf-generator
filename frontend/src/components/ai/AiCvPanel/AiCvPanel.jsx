/**
 * “Import CV PDF → pick template” dialog.
 * Extract is entitlement-gated; fill uses deterministic backend layout.
 *
 * Two exclusive wizard steps fill the dialog body:
 *   1) upload / extract
 *   2) template gallery
 * Footer arrows switch steps; they sit between the step label and Anuluj.
 * The history header and dialog footer stay fixed while only the snapshot list
 * scrolls, so every saved import remains reachable in a short viewport.
 */
import { useRef, useState, useCallback, use, useMemo, useEffect } from "react";
import classes from "./AiCvPanel.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { fillTemplate } from "../../../services/fillTemplate";
import { TEMPLATES } from "../../../templates";
import { selectCvTemplates } from "../../../utils/cvTemplateSelection";
import {
    CV_IMPORT_REQUEST_OPTIONS,
    CV_IMPORT_TIMEOUT_MESSAGE,
    cvImportStatusLabel,
} from "../../../utils/cvImportRequest";
import { isTemplateAllowed, planErrorMessage } from "../../../utils/entitlements";
import DialogShell from "../../common/DialogShell/DialogShell";
import TemplateCarousel from "./TemplateCarousel";

const UploadIcon = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--chrome-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 13v8"/><path d="m8 17 4-4 4 4"/>
        <path d="M20 16.5A4.5 4.5 0 0 0 17 8h-1.3A7 7 0 1 0 5 15"/>
    </svg>
);

const SparkIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/>
    </svg>
);

const ChevronLeft = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
);

const ChevronRight = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6 6-6" /></svg>
);

export default function AiCvPanel() {
    const {
        isAiPanel,
        showAiPanel,
        showBioCvModal,
        loadAiElements,
        entitlements,
        refreshEntitlements,
        setActiveCvData,
        setActiveImportId,
        flowSpacing,
    } = use(PdfContext);

    const fileRef = useRef(null);
    const [fileName, setFileName] = useState(null);
    const [fileData, setFileData] = useState(null);
    const [cvData, setCvData] = useState(null);
    const [wizardStep, setWizardStep] = useState(1);
    const [isExtracting, setIsExtracting] = useState(false);
    const [fillingId, setFillingId] = useState(null);
    const [error, setError] = useState(null);
    const [importId, setImportId] = useState(null);
    const [imports, setImports] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const cvTemplates = useMemo(() => selectCvTemplates(TEMPLATES), []);
    const remainingImports = entitlements?.remaining?.cv_imports;
    const canExtract = Boolean(entitlements?.extract_cv)
        && (remainingImports == null || remainingImports > 0);
    const extracted = Boolean(cvData?.name);
    const onStep2 = extracted && wizardStep === 2;

    // Import is a repeatable entry point, not the template switcher. Once a
    // template has been chosen (or the dialog is closed), discard the
    // extracted session so opening "Importuj CV" always starts at the PDF
    // dropzone. Template changes are handled exclusively by the editor's
    // separate "Szablony" control.
    const resetImportFlow = useCallback(() => {
        setFileName(null);
        setFileData(null);
        setCvData(null);
        setImportId(null);
        setWizardStep(1);
        setError(null);
    }, []);

    const handleClose = useCallback(() => {
        resetImportFlow();
        showAiPanel();
    }, [resetImportFlow, showAiPanel]);

    useEffect(() => {
        if (!extracted && wizardStep !== 1) {
            setWizardStep(1);
        }
    }, [extracted, wizardStep]);

    const api = useMemo(
        () => new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` }),
        [],
    );

    const loadHistory = useCallback(async () => {
        try {
            const response = await api.httpRequest(ENDPOINTS.AI.IMPORTS, "GET", undefined, "Nie udało się pobrać historii importów");
            setImports(response.imports || []);
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się pobrać historii importów."));
        }
    }, [api]);

    useEffect(() => {
        if (isAiPanel && showHistory) loadHistory();
    }, [isAiPanel, showHistory, loadHistory]);

    function handleFilePick(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        setFileData(f);
        setCvData(null);
        setWizardStep(1);
        setError(null);
    }

    const handleExtract = useCallback(async () => {
        if (!fileData) return;
        if (!canExtract) {
            setError(
                entitlements?.plan_slug === "free"
                    ? "Wykorzystano miesięczny limit importów CV. Odblokuj Pro, aby importować bez limitu."
                    : "Ekstrakcja CV z PDF jest dostępna w planie Pro.",
            );
            return;
        }
        setIsExtracting(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", fileData);
            const res = await api.httpRequest(
                ENDPOINTS.AI.EXTRACT_CV,
                "POST",
                form,
                "Ekstrakcja CV nie powiodła się",
                CV_IMPORT_REQUEST_OPTIONS,
            );
            if (res.usage) {
                console.log("[CV import AI usage]", {
                    action: "extract_cv",
                    provider: res.usage.provider,
                    model: res.usage.model,
                    extraction_mode: res.usage.extraction_mode,
                    prompt_tokens: res.usage.prompt_tokens,
                    completion_tokens: res.usage.completion_tokens,
                    total_tokens: res.usage.total_tokens,
                    cost_usd: res.usage.cost_usd,
                    cost_pln_estimate: res.usage.cost_pln_estimate,
                    credits_charged: res.usage.credits_charged,
                    rates_usd_per_1m: res.usage.rates_usd_per_1m,
                });
            }
            setCvData(res.cv_data);
            setImportId(res.import?.id ?? null);
            setWizardStep(2);
            refreshEntitlements?.();
        } catch (err) {
            if (err?.name === "AbortError") {
                // A browser timeout does not cancel an inference already
                // running at Cloudflare. Open history so the user can recover
                // that snapshot instead of starting a billable duplicate.
                setShowHistory(true);
                setError(CV_IMPORT_TIMEOUT_MESSAGE);
            } else {
                setError(planErrorMessage(err, "Nie udało się wyodrębnić danych z CV."));
            }
        } finally {
            setIsExtracting(false);
        }
    }, [api, canExtract, entitlements?.plan_slug, fileData, refreshEntitlements]);

    const handleFill = useCallback(async (template) => {
        if (!cvData) return;
        if (!isTemplateAllowed(template, entitlements)) {
            setError("Ten szablon jest dostępny w planie Pro.");
            return;
        }
        setFillingId(template.id);
        setError(null);
        try {
            const res = await fillTemplate(cvData, template.id, {
                api,
                errorMessage: "Generowanie szablonu nie powiodło się",
                spacing: flowSpacing,
            });
            await loadAiElements(res.elements, `CV ${template.name}`, template.id);
            setActiveCvData(cvData);
            setActiveImportId?.(importId);
            resetImportFlow();
            showAiPanel();
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się wygenerować szablonu."));
        } finally {
            setFillingId(null);
        }
    }, [api, cvData, entitlements, flowSpacing, importId, loadAiElements, resetImportFlow, setActiveCvData, setActiveImportId, showAiPanel]);

    const selectHistoricalImport = useCallback((snapshot) => {
        if (snapshot.status !== "succeeded" || !snapshot.cv_data) return;
        setCvData(snapshot.cv_data);
        setImportId(snapshot.id);
        setShowHistory(false);
        setWizardStep(2);
        setError(null);
    }, []);

    const deleteHistoricalImport = useCallback(async (snapshotId) => {
        try {
            await api.httpRequest(ENDPOINTS.AI.IMPORT(snapshotId), "DELETE", undefined, "Nie udało się usunąć importu");
            setImports((current) => current.filter((item) => item.id !== snapshotId));
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się usunąć danych importu."));
        }
    }, [api]);

    function goPrevStep() {
        setWizardStep(1);
        setError(null);
    }

    function goNextStep() {
        if (!extracted) return;
        setWizardStep(2);
        setError(null);
    }

    return (
        <DialogShell
            open={isAiPanel}
            onClose={handleClose}
            width={onStep2 ? 1400 : 960}
            bodyClassName={classes.dialogBody}
            title="Importuj CV"
            subtitle={showHistory ? "Wybierz wcześniej wyodrębnione dane albo usuń je ze swojej historii." : "Prześlij PDF — AI wypełni dowolny szablon Twoimi danymi."}
            footer={(
                <div className={classes.footerBar}>
                    <span className={classes.stepLabel}>
                        Krok {onStep2 ? "2" : "1"}
                        {" "}
                        z 2
                    </span>
                    <div className={classes.stepNav} role="group" aria-label="Nawigacja kroków">
                        <button
                            type="button"
                            className={classes.stepNavBtn}
                            onClick={goPrevStep}
                            disabled={!onStep2}
                            aria-label="Poprzedni krok"
                        >
                            <ChevronLeft />
                        </button>
                        <button
                            type="button"
                            className={classes.stepNavBtn}
                            onClick={goNextStep}
                            disabled={!extracted || onStep2}
                            aria-label="Następny krok"
                            title={!extracted ? "Najpierw wyodrębnij dane z CV" : undefined}
                        >
                            <ChevronRight />
                        </button>
                    </div>
                    <div className={classes.footerActions}>
                        <button type="button" className={classes.cancelBtn} onClick={showAiPanel}>Anuluj</button>
                        {!onStep2 && (
                            <button
                                type="button"
                                className={classes.extractBtn}
                                onClick={handleExtract}
                                disabled={!fileName || isExtracting || !canExtract}
                                title={!canExtract ? "Miesięczny limit importów został wykorzystany" : undefined}
                            >
                                {isExtracting ? (
                                    <><span className={classes.spinner} />Wyodrębnianie CV…</>
                                ) : (
                                    <><SparkIcon />{canExtract ? "Wyodrębnij dane CV" : "Limit importów wykorzystany"}</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            )}
        >
            <div className={`${classes.wrap} ${onStep2 ? classes.wrapStep2 : ""}`}>
                {!onStep2 && showHistory ? (
                    <div className={`${classes.stepPane} ${classes.historyPane}`}>
                        <div className={classes.historyHeader}>
                            <div className={classes.sectionLabel}>Historia importów</div>
                            <div className={classes.historyHeaderActions}>
                                <button type="button" className={classes.guidedLink} onClick={loadHistory}>Odśwież status</button>
                                <button type="button" className={classes.guidedLink} onClick={() => setShowHistory(false)}>Nowy import</button>
                            </div>
                        </div>
                        <div
                            className={classes.historyList}
                            role="region"
                            aria-label="Lista importów CV"
                            tabIndex={0}
                        >
                            {imports.length ? imports.map((snapshot) => (
                                <article className={classes.historyItem} key={snapshot.id}>
                                    <div>
                                        <strong>{snapshot.filename}</strong>
                                        <span>{snapshot.created_at ? new Date(snapshot.created_at).toLocaleString("pl-PL") : ""} · {cvImportStatusLabel(snapshot.status)}</span>
                                        {snapshot.summary?.name && <small>{snapshot.summary.name} · {snapshot.summary.experience_count} stanowisk · {snapshot.documents?.length || 0} utworzonych CV</small>}
                                    </div>
                                    <div className={classes.historyActions}>
                                        {snapshot.status === "succeeded" && <button type="button" className={classes.reExtract} onClick={() => selectHistoricalImport(snapshot)}>Utwórz CV</button>}
                                        {snapshot.status !== "processing" && <button type="button" className={classes.deleteImport} onClick={() => deleteHistoricalImport(snapshot.id)}>Usuń dane</button>}
                                    </div>
                                </article>
                            )) : <p className={classes.hint}>Nie masz jeszcze zapisanych importów.</p>}
                        </div>
                    </div>
                ) : !onStep2 ? (
                    <div className={classes.stepPane}>
                        <div className={classes.sectionLabel}>Krok 1 · Prześlij swoje CV</div>
                        <button type="button" className={classes.guidedLink} onClick={() => setShowHistory(true)}>Zobacz historię importów</button>
                        <div
                            className={`${classes.dropzone} ${fileName ? classes.dropzoneDone : ""}`}
                            onClick={() => fileRef.current?.click()}
                        >
                            <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFilePick} />
                            {fileName ? (
                                <>
                                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
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
                                <button
                                    type="button"
                                    className={classes.reExtract}
                                    onClick={() => { setCvData(null); setWizardStep(1); }}
                                >
                                    Wyodrębnij ponownie
                                </button>
                            </div>
                        )}
                        <button type="button" className={classes.guidedLink} onClick={showBioCvModal}>
                            Nie masz gotowego PDF? Utwórz CV krok po kroku
                        </button>
                        {!canExtract && (
                            <p className={classes.hint}>
                                Wykorzystano miesięczny limit importów. Kreator krok po kroku nadal działa w planie Darmowy.
                            </p>
                        )}
                        {canExtract && remainingImports != null && (
                            <p className={classes.hint}>
                                Pozostało importów w tym miesiącu: {remainingImports}.
                            </p>
                        )}
                        {extracted && (
                            <p className={classes.hint}>
                                Dane są gotowe — strzałka w prawo w stopce przenosi do wyboru szablonu.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className={classes.step2Pane}>
                        <div className={classes.step2Header}>
                            <div>
                                <div className={classes.sectionLabel}>Krok 2 · Wybierz szablon do wypełnienia</div>
                                <div className={classes.summaryLine}>
                                    <strong>{cvData.name}</strong>
                                    <span>
                                        {cvData.experience?.length ?? 0}
                                        {" stanowisk · "}
                                        {cvData.education?.length ?? 0}
                                        {" edukacja · "}
                                        {cvData.skills?.length ?? 0}
                                        {" umiejętności"}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className={classes.reExtract}
                                onClick={() => { setCvData(null); setWizardStep(1); }}
                            >
                                Wyodrębnij ponownie
                            </button>
                        </div>
                        {cvTemplates.length > 0 ? (
                            <div className={classes.carouselFill}>
                                <TemplateCarousel
                                    templates={cvTemplates}
                                    entitlements={entitlements}
                                    fillingId={fillingId}
                                    onSelect={handleFill}
                                    fillHeight
                                />
                            </div>
                        ) : (
                            <p className={classes.hint}>Nie ma jeszcze dostępnych szablonów CV.</p>
                        )}
                        <p className={classes.hint}>
                            Możesz wypełnić wiele szablonów bez ponownego przesyłania pliku.
                            Każdy otworzy się na płótnie do natychmiastowej edycji.
                        </p>
                    </div>
                )}

                {error && <div className={classes.error}>{error}</div>}
            </div>
        </DialogShell>
    );
}
