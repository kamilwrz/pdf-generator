/**
 * “Moje dokumenty” dialog: list, open, download, delete saved PDFs.
 * Opening a doc hydrates canvas elements and restores fixedToPage/locked extras.
 *
 * Downloads are per-row and click-triggered: a shared hover-prefetch slot used
 * to race against the Topbar toast and deliver the wrong file (e.g. an older
 * “CV CHIPSY” blob while the user meant the open document).
 */
import classes from "./ModalPdfs.module.css";

import { useEffect, useState, use, useMemo } from "react";
import { BsFileEarmarkPdf } from "react-icons/bs";
import { IoMdDownload } from "react-icons/io";
import { MdDelete } from "react-icons/md";
import { CiClock1 } from "react-icons/ci";
import { GrView } from "react-icons/gr";
import { FiSearch } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { fetchOwnedPdfDownload, triggerBlobDownload } from "../../../utils/download";
import { normalizeSterlingFamilyPersistence } from "../../../utils/sterlingAppearance";
import { normalizeProfilePhotoVisibilityPersistence } from "../../../utils/profilePhotoVisibility";
import { hydratePersistedCanvasElement } from "../../../utils/persistedCanvasElement";
import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";

import Error from "../../common/Error/Error";
import DialogShell from "../../common/DialogShell/DialogShell";


//DIALOG FOR SHOWING SAVED PDF'S

export default function ModalPdfs({ title }) {

    const [error, setError] = useState(false);
    const [isOpening, setIsOpening] = useState(false);
    const [loading, setLoading] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState("new");
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const {
        isModalPdfs,
        setIsModalPdfs,
        setA4_Elements,
        handlePdfId,
        activePdfId,
        confirmDiscardActiveEdits,
        discardActiveDocument,
        setA4_Elements_deleted,
        setPDFs,
        PDFs,
        setPdfsLoaded,
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
        // Opening a saved document replaces the current canvas. With background
        // autosave removed, warn before discarding unsaved edits; abort the open
        // if the user cancels. The new id is assigned only after elements arrive.
        if (!confirmDiscardActiveEdits()) return;
        setIsOpening(true);
        try {
            const data = await api.httpRequest(
                ENDPOINTS.PDF.SHOW,
                "POST",
                JSON.stringify(id),
                "Nie udało się wczytać wybranego PDF!",
            );
            // Newer API responses carry the exact saved metadata alongside
            // elements, avoiding a stale list entry after another save. Keep
            // the array fallback while clients finish upgrading the backend.
            const responseElements = Array.isArray(data) ? data : (data.elements || []);
            const pdfCanvas = Array.isArray(data)
                ? PDFs.find(element => element.id === id)
                : data.document;
            // Rebuild the flat canvas contract for every category. Contact,
            // photo, flow and appearance metadata can live on text anchors or
            // textarea bodies, so category-specific partial unpacking is not
            // sufficient for a saved hide/show round trip.
            const elementsData = responseElements.map(hydratePersistedCanvasElement);

            // Restore the saved page count, title and content as one state
            // transition, then make this loaded PDF autosave-active.
            // Page geometry is always A4 portrait.
            title.current.value = pdfCanvas?.title.split(".pdf")[0];
            resetHistory();
            setPageCount(pdfCanvas?.pages || 1);
            setCurrentPage(1);
            setA4_Elements_deleted([]);
            const templateId = pdfCanvas?.template_id ?? pdfCanvas?.templateId;
            const persistenceNormalized = normalizeSterlingFamilyPersistence(
                elementsData.filter(element => element.category !== "title"),
                templateId,
            );
            // Slate documents saved while the photo was hidden before the
            // contact-heading contract existed receive the missing first-page
            // chrome during hydration. The pure normalizer is idempotent, so
            // current documents retain their stored element identities.
            const liveElements = normalizeProfilePhotoVisibilityPersistence(
                persistenceNormalized,
                templateId,
            );
            setA4_Elements(liveElements);
            hydrateDocumentMode?.(liveElements, pdfCanvas || {});
            handlePdfId(id);
            // `cv_data` belongs to the saved document, not the previous editor
            // session. Restoring it keeps template changes available after a
            // reload and prevents applying another document's profile.
            setActiveCvData(pdfCanvas?.cv_data ?? pdfCanvas?.cvData ?? null);
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

    // Mount fetch: pdfsLoaded/PDFs.length gates template-first onboarding in
    // PdfCanvas, so this must run even when the dialog stays closed. Guests
    // skip the request (it would 401) and report the same empty loaded state.
    useEffect(() => {
        if (!localStorage.getItem("token")) {
            setPDFs([]);
            setPdfsLoaded(true);
            return undefined;
        }
        let cancelled = false;
        api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Nie udało się pobrać listy PDF!").
            then((data) => {
                if (cancelled) return;
                setPDFs(data);
                setPdfsLoaded(true);
            }).
            catch((err) => {
                if (cancelled) return;
                if (err?.status === 404) setPDFs([]);
                else setError(err);
                setPdfsLoaded(true);
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only list bootstrap
    }, []);

    // Refresh when the dialog opens so a freshly saved CV appears, without
    // re-fetching on every download (that used to flash the skeleton whenever
    // the shared download slot updated).
    useEffect(() => {
        if (!isModalPdfs) return undefined;
        if (!localStorage.getItem("token")) return undefined;
        let cancelled = false;
        setLoading(true);
        api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Nie udało się pobrać listy PDF!").
            then((data) => {
                if (cancelled) return;
                setPDFs(data);
                setPdfsLoaded(true);
            }).
            catch((err) => {
                if (cancelled) return;
                if (err?.status === 404) setPDFs([]);
                else setError(err);
                setPdfsLoaded(true);
            }).
            finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh only when dialog opens
    }, [isModalPdfs]);

    /**
     * Download one document by id via the authenticated binary API response.
     * Never writes into a shared download slot that other rows (or the Topbar
     * toast) could race against, and never fetches S3 from the browser.
     */
    async function downloadPdf(id) {
        if (downloadingId != null) return;
        setDownloadingId(id);
        try {
            const prepared = await fetchOwnedPdfDownload(id);
            triggerBlobDownload(prepared.blob, prepared.title);
            refreshEntitlements?.();
        } catch (err) {
            pushToast?.({
                title: err?.code?.startsWith?.("plan_") ? "Limit planu" : "Pobieranie nie powiodło się",
                msg: err?.message || "Błąd pobierania",
                variant: "error",
            });
        } finally {
            setDownloadingId(null);
        }
    }

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
                            <button
                                type="button"
                                className={classes.downloadPdfBtn}
                                onClick={() => downloadPdf(PDF.id)}
                                disabled={downloadingId != null}
                                aria-busy={downloadingId === PDF.id}
                            >
                                {downloadingId === PDF.id ? "Pobieranie…" : "Pobierz"}
                                {" "}
                                <IoMdDownload />
                            </button>
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

            <DialogShell
                open={confirmDeleteId != null}
                onClose={() => setConfirmDeleteId(null)}
                width={440}
                role="alertdialog"
                initialFocusSelector="[data-dialog-initial-focus]"
                title="Usunąć dokument?"
                subtitle={confirmTarget
                    ? `„${confirmTarget.title.split(".")[0]}” zniknie z Twoich dokumentów wraz z zapisanym plikiem PDF. Tej operacji nie można cofnąć.`
                    : ""}
                footer={(
                    <div className={classes.confirmActions}>
                            <button type="button" className={classes.confirmCancel} data-dialog-initial-focus onClick={() => setConfirmDeleteId(null)}>Anuluj</button>
                            <button type="button" className={classes.confirmDelete} onClick={confirmDelete}>Usuń trwale</button>
                    </div>
                )}
            />
        </DialogShell>
    );
}
