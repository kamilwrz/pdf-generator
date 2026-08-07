/**
 * “Moje dokumenty” dialog: list, open, download, delete saved PDFs.
 * Opening a doc hydrates canvas elements and restores fixedToPage/locked extras.
 */
import classes from "./ModalPdfs.module.css";

import { createPortal } from "react-dom";
import { useEffect, useState, use, useRef, useMemo } from "react";
import { BsFileEarmarkPdf } from "react-icons/bs";
import { IoMdDownload } from "react-icons/io";
import { MdDelete } from "react-icons/md";
import { CiClock1 } from "react-icons/ci";
import { GrView } from "react-icons/gr";
import { FiSearch, FiAlertTriangle } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { sanitizeTextContent } from "../../../utils/sanitizeTextContent";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";

import Error from "../../common/Error/Error";
import DialogShell from "../../common/DialogShell/DialogShell";


//DIALOG FOR SHOWING SAVED PDF'S

export default function ModalPdfs({ title }) {

    const timeout = useRef();

    const [error, setError] = useState(false);
    const [isOpening, setIsOpening] = useState(false);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState("new");
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const {
        isModalPdfs,
        setIsModalPdfs,
        setA4_Elements,
        handlePdfId,
        activePdfId,
        flushAutosave,
        discardActiveDocument,
        setA4_Elements_deleted,
        setPDFs,
        PDFs,
        setPdfsLoaded,
        setPDFdownloadData,
        PDFdownloadData,
        pushToast,
        refreshEntitlements,
        setPageCount,
        setCurrentPage,
        resetHistory,
        setActiveCvData,
        hydrateDocumentMode,
    } = use(PdfContext);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    // Routed through DialogShell's Escape/backdrop-click handler too — while
    // the delete confirm is open this cancels only the confirm, so Escape
    // never closes "Moje dokumenty" out from under an in-flight confirmation.
    function closeDialog() {
        if (confirmDeleteId != null) {
            setConfirmDeleteId(null);
            return;
        }
        setIsModalPdfs(false);
        setError(false);
        setQuery("");
    }

    async function showPDF(id) {
        if (isOpening) return;
        setIsOpening(true);
        try {
            // Persist the document currently open before replacing its canvas.
            // Crucially, the new id is assigned only after its elements arrive.
            await flushAutosave();
            const data = await api.httpRequest(
                ENDPOINTS.PDF.SHOW,
                "POST",
                JSON.stringify(id),
                "Nie udało się wczytać wybranego PDF!",
            );
            const pdfCanvas = PDFs.find(element => element.id === id);
            const elementsData = data.map((element) => {
                const fixedToPage = element.extra_properties.fixedToPage ?? false;
                const repeatOnContinuation = element.extra_properties.repeatOnContinuation ?? true;
                const locked = element.extra_properties.locked ?? fixedToPage;
                if (element.category === "textarea") {
                    return {
                        ...element,
                        content: sanitizeTextContent(element.content),
                        zIndex: element.extra_properties.zIndex,
                        lineHeight: element.extra_properties.lineHeight,
                        letterSpacing: element.extra_properties.letterSpacing,
                        bold: element.extra_properties.bold,
                        italic: element.extra_properties.italic,
                        underline: element.extra_properties.underline,
                        // Inline decoration overlay; null keeps the plain fast path.
                        runs: element.extra_properties.runs ?? null,
                        align: element.extra_properties.align,
                        bulletList: element.extra_properties.bulletList ?? false,
                        autoHeight: element.extra_properties.autoHeight ?? false,
                        flowRole: element.extra_properties.flowRole,
                        flowGroup: element.extra_properties.flowGroup,
                        isDecorativeChromeText: element.extra_properties.isDecorativeChromeText ?? false,
                        preserveInitialLayout: element.extra_properties.preserveInitialLayout ?? false,
                        fixedToPage,
                        repeatOnContinuation,
                        locked,
                        width: parseFloat(element.width),
                        height: parseFloat(element.height),
                        isEditing: false,
                    };
                }
                if (element.category !== "text") {
                    return {
                        ...element,
                        zIndex: element.extra_properties.zIndex,
                        borderWidth: element.extra_properties.borderWidth,
                        filled: element.extra_properties.filled ?? false,
                        // Preserve explicit false for geometrically centred Iconic contact icons.
                        alignWithText: element.extra_properties.alignWithText,
                        flowRole: element.extra_properties.flowRole,
                        flowGroup: element.extra_properties.flowGroup,
                        fixedToPage,
                        repeatOnContinuation,
                        locked,
                        source_id: element.extra_properties.source_id,
                        target_id: element.extra_properties.target_id,
                        arrow: element.extra_properties.arrow,
                        width: parseFloat(element.width),
                        height: parseFloat(element.height),
                    };
                }
                return {
                    ...element,
                    content: sanitizeTextContent(element.content),
                    zIndex: element.extra_properties.zIndex,
                    bold: element.extra_properties.bold,
                    italic: element.extra_properties.italic,
                    underline: element.extra_properties.underline,
                    // Inline decoration overlay; null keeps the plain fast path.
                    runs: element.extra_properties.runs ?? null,
                    flowRole: element.extra_properties.flowRole,
                    flowGroup: element.extra_properties.flowGroup,
                    isDecorativeChromeText: element.extra_properties.isDecorativeChromeText ?? false,
                    fixedToPage,
                    repeatOnContinuation,
                    locked,
                };
            });

            // Restore the saved page count, title and content as one state
            // transition, then make this loaded PDF autosave-active.
            // Page geometry is always A4 portrait.
            title.current.value = pdfCanvas?.title.split(".pdf")[0];
            resetHistory();
            setPageCount(pdfCanvas?.pages || 1);
            setCurrentPage(1);
            setA4_Elements_deleted([]);
            const liveElements = elementsData.filter(element => element.category !== "title");
            setA4_Elements(liveElements);
            hydrateDocumentMode?.(liveElements, pdfCanvas || {});
            handlePdfId(id);
            // A reopened saved document has no persisted cv_data to reuse —
            // clear any structured data left over from a previous fill so the
            // Topbar "Zmień szablon" gallery doesn't offer to reapply an
            // unrelated CV's content onto this document.
            setActiveCvData(null);
            setIsModalPdfs(false);
        } catch (error) {
            setError(error);
        } finally {
            setIsOpening(false);
        }
    }

    function askDelete(id) {
        setConfirmDeleteId(id);
    }

    async function confirmDelete() {
        const id = confirmDeleteId;
        const target = PDFs.find((element) => element.id === id);
        setConfirmDeleteId(null);
        try {
            const data = await api.httpRequest(
                ENDPOINTS.PDF.DELETE,
                "DELETE",
                JSON.stringify(id),
                "Nie udało się usunąć PDF!",
            );
            if (activePdfId === id) discardActiveDocument();
            setPDFs((prevState) => prevState.filter((element) => element.id !== data.pdf_id));
            pushToast?.({
                title: "Dokument usunięty",
                msg: target ? `„${target.title.split(".")[0]}” został trwale usunięty.` : undefined,
                variant: "success",
            });
        } catch (error) {
            setError(error);
        }
    }

    useEffect(() => {
        // Must fetch on mount regardless of isModalPdfs (not just when the
        // dialog is open) — pdfsLoaded/PDFs.length here is what the
        // template-first onboarding auto-open effect in PdfCanvas.jsx waits
        // on. Gating this fetch on isModalPdfs (as a first pass at this
        // rewrite did) silently broke that onboarding flow: pdfsLoaded would
        // never become true until the user manually opened "Moje dokumenty".
        // Only the loading-skeleton UI is scoped to the dialog being open.
        if (isModalPdfs) setLoading(true);
        api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Nie udało się pobrać listy PDF!").
            then((data) => {
                setPDFs(data);
                setPdfsLoaded(true);
                }).
            catch((error) => {
                // The backend signals "no PDFs yet" as a 404 rather than an
                // empty 200 array — that's the real empty state, not a fetch
                // failure, so it renders the empty-state UI below instead of
                // the error banner.
                if (error?.status === 404) setPDFs([]);
                else setError(error);
                setPdfsLoaded(true);
            }).
            finally(() => setLoading(false));


    }, [isModalPdfs, PDFdownloadData])


  async function downloadPdf(id){
    try {
      const response = await api.httpRequest(ENDPOINTS.PDF.DOWNLOAD, "POST", id, "Błąd pobierania");
      const blob = (await fetch(response.url)).blob()
      const urlBlob = URL.createObjectURL(await blob);
      setPDFdownloadData({blob: urlBlob, title: response.title})
      refreshEntitlements?.();
      timeout.current = setTimeout(() => {
        //  URL.revokeObjectURL(urlBlob);
      },6000)
    } catch (error) {
      pushToast?.({
        title: error?.code?.startsWith?.("plan_") ? "Limit planu" : "Pobieranie nie powiodło się",
        msg: error?.message || "Błąd pobierania",
        variant: "error",
      });
    }
  }

  clearTimeout(timeout.current);

    const visiblePDFs = useMemo(() => {
        const q = query.trim().toLowerCase();
        let list = PDFs.filter((pdf) => pdf.title.toLowerCase().includes(q));
        if (sort === "az") list = [...list].sort((a, b) => a.title.localeCompare(b.title, "pl"));
        else list = [...list].sort((a, b) => sort === "new"
            ? new Date(b.created_at) - new Date(a.created_at)
            : new Date(a.created_at) - new Date(b.created_at));
        return list;
    }, [PDFs, query, sort]);

    const confirmTarget = PDFs.find((pdf) => pdf.id === confirmDeleteId);
    const showEmpty = isModalPdfs && !loading && !error && visiblePDFs.length === 0;

    return (
        <DialogShell
            open={isModalPdfs}
            onClose={closeDialog}
            width={1280}
            radius={2}
            title="Moje dokumenty"
            subtitle="Otwieraj, pobieraj i usuwaj zapisane projekty."
            footer={<>
                <span className={classes.countLabel}>
                    {query ? `${visiblePDFs.length} z ${PDFs.length} dokumentów` : `${PDFs.length} zapisanych dokumentów`}
                </span>
                <button type="button" className={classes.closeFooterBtn} onClick={closeDialog}>Zamknij</button>
            </>}
        >
            <div className={classes.toolbar}>
                <div className={classes.searchField}>
                    <FiSearch />
                    <input
                        type="text"
                        placeholder="Szukaj wśród dokumentów"
                        aria-label="Szukaj dokumentów"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <select aria-label="Sortowanie" className={classes.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="new">Najnowsze</option>
                    <option value="old">Najstarsze</option>
                    <option value="az">Nazwa A–Z</option>
                </select>
            </div>

            <div className={classes.modalBody}>
                {error && (
                    <div className={classes.errorSpan}>
                        <Error title="Brak zapisanych PDF!" message={error?.message || error} />
                    </div>
                )}

                {!error && loading && [0, 1, 2, 3, 4].map((i) => (
                    <div className={classes.skeletonRow} key={i}>
                        <div className={classes.skeletonThumb} />
                        <div className={classes.skeletonLines}>
                            <span className={classes.skeletonBar} />
                            <span className={classes.skeletonBarThin} />
                        </div>
                    </div>
                ))}

                {!error && !loading && visiblePDFs.map((PDF) => {
                    const date = PDF.created_at.split(".")[0].split("T").join(" : ");
                    return <div className={classes.pdfItem} key={PDF.id}>

                        <div className={classes.wrapperIconTitleDate}>
                            <div className={classes.wrapperPDFIcon}><BsFileEarmarkPdf className={classes.pdfIcon} /></div>
                            <div className={classes.wrapperTitelDate}>
                                <h2 className={classes.title}>{PDF.title.split(".")[0]}</h2>
                                <div className={classes.date}><CiClock1 /><label>{date}</label></div>
                            </div>
                        </div>

                        <div className={classes.modalControls}>
                            <button className={classes.downloadPdfBtn} onMouseEnter={() => downloadPdf(PDF.id)}><a href={PDFdownloadData.blob} download={PDFdownloadData.title}>
                            Pobierz <IoMdDownload /></a></button>
                            <button className={classes.showPdfBtn} onClick={() => showPDF(PDF.id)} disabled={isOpening} title="Otwórz na płótnie" aria-label="Otwórz na płótnie"><GrView /></button>
                            <button className={classes.deletePdfBtn} onClick={() => askDelete(PDF.id)} title="Usuń dokument" aria-label="Usuń dokument"><MdDelete /></button>
                        </div>

                    </div>;
                })}

                {showEmpty && (
                    <div className={classes.emptyState}>
                        <div className={classes.emptyIcon}><BsFileEarmarkPdf /></div>
                        <div className={classes.emptyTitle}>{query ? "Brak wyników" : "Nie masz jeszcze dokumentów"}</div>
                        <div className={classes.emptyHint}>
                            {query
                                ? `Żaden dokument nie pasuje do frazy „${query}”. Spróbuj innej nazwy.`
                                : "Zapisz projekt przyciskiem „Utwórz PDF”, aby pojawił się na tej liście."}
                        </div>
                    </div>
                )}
            </div>

            {confirmDeleteId != null && createPortal(
                <div className={classes.confirmBackdrop} onClick={() => setConfirmDeleteId(null)}>
                    <div className={classes.confirmDialog} onClick={(e) => e.stopPropagation()}>
                        <div className={classes.confirmHeader}>
                            <div className={classes.confirmIcon}><FiAlertTriangle /></div>
                            <div>
                                <h2>Usunąć dokument?</h2>
                                <p>
                                    {confirmTarget
                                        ? `„${confirmTarget.title.split(".")[0]}” zniknie z Twoich dokumentów wraz z zapisanym plikiem PDF. Tej operacji nie można cofnąć.`
                                        : ""}
                                </p>
                            </div>
                        </div>
                        <div className={classes.confirmFooter}>
                            <button type="button" className={classes.confirmCancel} onClick={() => setConfirmDeleteId(null)}>Anuluj</button>
                            <button type="button" className={classes.confirmDelete} onClick={confirmDelete}>Usuń trwale</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </DialogShell>
    );
}
