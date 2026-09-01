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
import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { nanoid } from "nanoid";
import classes from "./AiCvPanel.module.css";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
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
import { useDocumentLifecycle } from "../../../store/document-lifecycle-context";

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
    const { captureDocumentScope, isDocumentScopeCurrent } = useDocumentLifecycle();
    const { isAiPanel, showAiPanel, showBioCvModal } = useUiSurfaces();
    const { loadAiElements, flowSpacing } = useCanvasContext();
    const { entitlements, refreshEntitlements } = useSession();

    const fileRef = useRef(null);
    const importIdempotencyKeyRef = useRef(null);
    const historyLoadingRef = useRef(false);
    const [fileName, setFileName] = useState(null);
    const [fileData, setFileData] = useState(null);
    const [cvData, setCvData] = useState(null);
    const [wizardStep, setWizardStep] = useState(1);
    const [isExtracting, setIsExtracting] = useState(false);
    const [fillingId, setFillingId] = useState(null);
    const [error, setError] = useState(null);
    const [importId, setImportId] = useState(null);
    const [imports, setImports] = useState([]);
    const [importsNextCursor, setImportsNextCursor] = useState(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [openingImportId, setOpeningImportId] = useState(null);
    const [confirmDeleteImportId, setConfirmDeleteImportId] = useState(null);
    const [deletingImportId, setDeletingImportId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const cvTemplates = useMemo(() => selectCvTemplates(TEMPLATES), []);
    const remainingImports = entitlements?.remaining?.cv_imports;
    const isFreePlan = entitlements?.plan_slug === "free";
    // The backend remains authoritative. Before entitlements finish loading,
    // allow the signed-in user to continue instead of falsely presenting an
    // exhausted quota; a real plan rejection is rendered inline below.
    const importFeatureEnabled = entitlements?.extract_cv ?? true;
    const canExtract = importFeatureEnabled
        && (remainingImports == null || remainingImports > 0);
    const importLimitReached = Boolean(entitlements)
        && importFeatureEnabled
        && remainingImports != null
        && remainingImports <= 0;
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
        importIdempotencyKeyRef.current = null;
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

    const fetchHistoryPage = useCallback(async (cursor = null, append = false) => {
        if (historyLoadingRef.current) return;
        historyLoadingRef.current = true;
        setIsLoadingHistory(true);
        try {
            const endpoint = cursor
                ? `${ENDPOINTS.AI.IMPORTS}?cursor=${encodeURIComponent(cursor)}`
                : ENDPOINTS.AI.IMPORTS;
            const response = await api.httpRequest(endpoint, "GET", undefined, "Nie udało się pobrać historii importów");
            const pageItems = response.items || response.imports || [];
            setImports((current) => {
                if (!append) return pageItems;
                const existingIds = new Set(current.map((item) => item.id));
                return [...current, ...pageItems.filter((item) => !existingIds.has(item.id))];
            });
            setImportsNextCursor(response.next_cursor || null);
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się pobrać historii importów."));
        } finally {
            historyLoadingRef.current = false;
            setIsLoadingHistory(false);
        }
    }, [api]);

    const loadHistory = useCallback(
        () => fetchHistoryPage(null, false),
        [fetchHistoryPage],
    );

    const loadMoreHistory = useCallback(
        () => importsNextCursor && fetchHistoryPage(importsNextCursor, true),
        [fetchHistoryPage, importsNextCursor],
    );

    useEffect(() => {
        if (isAiPanel && showHistory) loadHistory();
    }, [isAiPanel, showHistory, loadHistory]);

    useEffect(() => {
        if (!showHistory) setConfirmDeleteImportId(null);
    }, [showHistory]);

    const acceptFile = useCallback((f) => {
        if (!f) return;
        if (f.type !== "application/pdf" && !f.name?.toLowerCase().endsWith(".pdf")) {
            setError("Wybierz plik PDF.");
            return;
        }
        setFileName(f.name);
        setFileData(f);
        setCvData(null);
        setWizardStep(1);
        setError(null);
        importIdempotencyKeyRef.current = globalThis.crypto?.randomUUID?.() || nanoid();
    }, []);

    function handleFilePick(e) {
        acceptFile(e.target.files?.[0]);
    }

    const handleExtract = useCallback(async () => {
        if (!fileData) return;
        if (!canExtract) {
            setError(
                isFreePlan && importLimitReached
                    ? "Plan Darmowy obejmuje 1 udany import CV miesięcznie. Limit został wykorzystany — w Pro możesz importować bez limitu."
                    : "Import CV z PDF jest dostępny w planie Pro.",
            );
            return;
        }
        setIsExtracting(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", fileData);
            const idempotencyKey = importIdempotencyKeyRef.current
                || globalThis.crypto?.randomUUID?.()
                || nanoid();
            importIdempotencyKeyRef.current = idempotencyKey;
            const res = await api.httpRequest(
                ENDPOINTS.AI.EXTRACT_CV,
                "POST",
                form,
                "Ekstrakcja CV nie powiodła się",
                {
                    ...CV_IMPORT_REQUEST_OPTIONS,
                    headers: { "Idempotency-Key": idempotencyKey },
                },
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
                // A confirmed provider/application failure is a new logical
                // attempt. Pending/active conflicts keep the current key so a
                // later retry can replay the original persisted snapshot.
                if (!["ai_request_in_progress", "ai_operation_active"].includes(err?.code)) {
                    importIdempotencyKeyRef.current = null;
                }
                setError(planErrorMessage(err, "Nie udało się wyodrębnić danych z CV."));
            }
        } finally {
            setIsExtracting(false);
        }
    }, [api, canExtract, fileData, importLimitReached, isFreePlan, refreshEntitlements]);

    const handleFill = useCallback(async (template) => {
        if (!cvData) return;
        if (!isTemplateAllowed(template, entitlements)) {
            setError("Ten szablon jest dostępny w planie Pro.");
            return;
        }
        setFillingId(template.id);
        setError(null);
        const requestScope = captureDocumentScope();
        try {
            const res = await fillTemplate(cvData, template.id, {
                api,
                errorMessage: "Generowanie szablonu nie powiodło się",
                spacing: flowSpacing,
            });
            if (!isDocumentScopeCurrent(requestScope, { requireSameRevision: true })) {
                setError("Dokument zmienił się w trakcie generowania. Wybierz szablon ponownie.");
                return;
            }
            const replaced = await loadAiElements(
                res.elements,
                `CV ${template.name}`,
                template.id,
                { cvData, sourceImportId: importId },
            );
            if (!replaced) return;
            resetImportFlow();
            showAiPanel();
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się wygenerować szablonu."));
        } finally {
            setFillingId(null);
        }
    }, [api, captureDocumentScope, cvData, entitlements, flowSpacing, importId, isDocumentScopeCurrent, loadAiElements, resetImportFlow, showAiPanel]);

    const selectHistoricalImport = useCallback(async (snapshot) => {
        if (snapshot.status !== "succeeded" || openingImportId != null) return;
        setOpeningImportId(snapshot.id);
        setError(null);
        try {
            // List rows deliberately omit extracted PII. Fetch the owned detail
            // only after an explicit selection, then keep the full profile in
            // this short-lived wizard state rather than the history collection.
            const detail = await api.httpRequest(
                ENDPOINTS.AI.IMPORT(snapshot.id),
                "GET",
                undefined,
                "Nie udało się pobrać danych importu",
            );
            if (detail.status !== "succeeded" || !detail.cv_data) {
                throw new Error("Ten import nie zawiera jeszcze gotowych danych CV.");
            }
            setCvData(detail.cv_data);
            setImportId(snapshot.id);
            setShowHistory(false);
            setWizardStep(2);
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się pobrać danych importu."));
        } finally {
            setOpeningImportId(null);
        }
    }, [api, openingImportId]);

    const deleteHistoricalImport = useCallback(async (snapshotId) => {
        if (deletingImportId != null) return;
        setDeletingImportId(snapshotId);
        setError(null);
        try {
            await api.httpRequest(ENDPOINTS.AI.IMPORT(snapshotId), "DELETE", undefined, "Nie udało się usunąć importu");
            setImports((current) => current.filter((item) => item.id !== snapshotId));
            setConfirmDeleteImportId(null);
        } catch (err) {
            setError(planErrorMessage(err, "Nie udało się usunąć danych importu."));
        } finally {
            setDeletingImportId(null);
        }
    }, [api, deletingImportId]);

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
            subtitle={showHistory ? "Wybierz wcześniej odczytane dane albo usuń je ze swojej historii." : "Prześlij PDF — odczytamy dane i wypełnimy nimi wybrany szablon."}
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
                                title={importLimitReached
                                    ? "Plan Darmowy: wykorzystano 1 import CV w tym miesiącu"
                                    : !canExtract
                                        ? "Import CV jest dostępny w planie Pro"
                                        : undefined}
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
                                <button type="button" className={classes.guidedLink} onClick={loadHistory} disabled={isLoadingHistory}>Odśwież status</button>
                                <button type="button" className={classes.guidedLink} onClick={() => setShowHistory(false)}>Nowy import</button>
                            </div>
                        </div>
                        <div
                            className={classes.historyList}
                            role="region"
                            aria-label="Lista importów CV"
                            tabIndex={0}
                        >
                            {imports.length ? (
                                <>
                                    {imports.map((snapshot) => (
                                        <article className={classes.historyItem} key={snapshot.id}>
                                    <div>
                                        <strong title={snapshot.filename || undefined}>
                                            {snapshot.filename || "Import CV"}
                                        </strong>
                                        <span>{snapshot.created_at ? new Date(snapshot.created_at).toLocaleString("pl-PL") : ""} · {cvImportStatusLabel(snapshot.status)}</span>
                                        <small>
                                            {snapshot.size_bytes != null ? `${Math.ceil(snapshot.size_bytes / 1024)} KB` : "Rozmiar nieznany"}
                                            {` · ${snapshot.document_count || 0} utworzonych CV`}
                                        </small>
                                    </div>
                                    <div className={classes.historyActions}>
                                        {confirmDeleteImportId === snapshot.id ? (
                                            <div
                                                className={classes.deleteConfirmation}
                                                role="group"
                                                aria-label={`Potwierdź usunięcie danych z pliku ${snapshot.filename || "CV"}`}
                                            >
                                                <button
                                                    type="button"
                                                    className={classes.cancelDeleteImport}
                                                    onClick={() => setConfirmDeleteImportId(null)}
                                                    disabled={deletingImportId != null}
                                                >
                                                    Anuluj
                                                </button>
                                                <button
                                                    type="button"
                                                    className={classes.confirmDeleteImport}
                                                    onClick={() => deleteHistoricalImport(snapshot.id)}
                                                    disabled={deletingImportId != null}
                                                    aria-busy={deletingImportId === snapshot.id}
                                                >
                                                    {deletingImportId === snapshot.id ? "Usuwanie…" : "Usuń trwale"}
                                                </button>
                                            </div>
                                        ) : snapshot.status === "succeeded" && (
                                            <button
                                                type="button"
                                                className={classes.reExtract}
                                                onClick={() => selectHistoricalImport(snapshot)}
                                                disabled={openingImportId != null}
                                                aria-busy={openingImportId === snapshot.id}
                                            >
                                                {openingImportId === snapshot.id ? "Pobieranie…" : "Utwórz CV"}
                                            </button>
                                        )}
                                        {snapshot.status !== "processing" && confirmDeleteImportId !== snapshot.id && (
                                            <button
                                                type="button"
                                                className={classes.deleteImport}
                                                onClick={() => {
                                                    setConfirmDeleteImportId(snapshot.id);
                                                    setError(null);
                                                }}
                                            >
                                                Usuń dane
                                            </button>
                                        )}
                                    </div>
                                        </article>
                                    ))}
                                    {importsNextCursor && (
                                        <button
                                            type="button"
                                            className={classes.guidedLink}
                                            onClick={loadMoreHistory}
                                            disabled={isLoadingHistory}
                                        >
                                            {isLoadingHistory ? "Pobieranie…" : "Pokaż starsze importy"}
                                        </button>
                                    )}
                                </>
                            ) : <p className={classes.hint}>{isLoadingHistory ? "Pobieranie historii…" : "Nie masz jeszcze zapisanych importów."}</p>}
                        </div>
                    </div>
                ) : !onStep2 ? (
                    <div className={classes.stepPane}>
                        <div className={classes.sectionLabel}>Krok 1 · Prześlij swoje CV</div>
                        <button type="button" className={classes.guidedLink} onClick={() => setShowHistory(true)}>Zobacz historię importów</button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".pdf"
                            style={{ display: "none" }}
                            onChange={handleFilePick}
                        />
                        <button
                            type="button"
                            className={`${classes.dropzone} ${fileName ? classes.dropzoneDone : ""}`}
                            onClick={() => fileRef.current?.click()}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault();
                                acceptFile(event.dataTransfer.files?.[0]);
                            }}
                            aria-label={fileName ? `Wybrano ${fileName}. Wybierz inny plik PDF` : "Wybierz plik PDF do importu"}
                        >
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
                        </button>
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
                        {importLimitReached && (
                            <p className={classes.hint}>
                                Plan Darmowy obejmuje 1 udany import CV miesięcznie. Limit został wykorzystany,
                                ale kreator krok po kroku nadal działa bez ograniczeń czasowych.
                            </p>
                        )}
                        {canExtract && isFreePlan && remainingImports != null && (
                            <p className={classes.hint}>
                                Plan Darmowy — dostępne importy CV w tym miesiącu: {remainingImports}.
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
