/**
 * Multi-page navigation and two-page spread toggle. Rendered inline inside the
 * editor Topbar (right cluster), so it stays compact and icon-only to match the
 * topbar's other action buttons. Reads page state from the canvas context.
 *
 * Reorder/clone/add/delete are structural, page-destroying operations that
 * make sense on a freeform DTP canvas but not on a template-mode CV, where
 * page count and order are owned by the section flow (add/remove a section,
 * not a page). Those four stay hidden outside `editorMode: "freeform"`; page
 * navigation remains available in both modes.
 */
import { use } from "react";
import classes from "./PageControls.module.css";
import { useCanvasContext } from "../../../store/canvas-context";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { EDITOR_MODE_FREEFORM } from "../../../utils/editorMode";

const Chevron = ({ dir }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
);

export default function PageControls() {
    const {
        currentPage, pageCount, addPage, removePage, goToPage, clonePage, movePage,
        isTwoPageView, toggleTwoPageView,
    } = useCanvasContext();
    const { editorMode } = use(PdfContext);
    const isFreeform = editorMode === EDITOR_MODE_FREEFORM;

    return (
        <div className={classes.bar} role="group" aria-label="Strony i paginacja">
            <button
                type="button"
                className={classes.navBtn}
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Poprzednia strona"
                title="Poprzednia strona"
            >
                <Chevron dir="left" />
            </button>

            <span className={classes.label}>
                <b>{currentPage}</b><span className={classes.sep}>/</span>{pageCount}
            </span>

            <button
                type="button"
                className={classes.navBtn}
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= 20}
                aria-label={currentPage >= pageCount ? "Utwórz następną stronę" : "Następna strona"}
                title={currentPage >= pageCount ? "Utwórz następną stronę" : "Następna strona"}
            >
                <Chevron dir="right" />
            </button>

            <span className={classes.divider} />

            <button
                type="button"
                className={`${classes.navBtn} ${isTwoPageView ? classes.spreadActive : ""}`}
                onClick={toggleTwoPageView}
                disabled={pageCount < 2}
                aria-label={isTwoPageView ? "Wyłącz widok dwóch stron" : "Włącz widok dwóch stron"}
                aria-pressed={isTwoPageView}
                title={isTwoPageView ? "Wyłącz widok dwóch stron" : "Włącz widok dwóch stron"}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                    <rect x="3" y="4" width="7" height="16" rx="1.2" />
                    <rect x="14" y="4" width="7" height="16" rx="1.2" />
                </svg>
            </button>

            {isFreeform ? (
                <>
                    {/* Advanced page ops: reorder + clone. Hidden on narrow viewports so
                        the core navigation always fits the topbar. */}
                    <span className={`${classes.divider} ${classes.advanced}`} />
                    <button
                        type="button"
                        className={`${classes.navBtn} ${classes.advanced}`}
                        onClick={() => movePage(-1)}
                        disabled={currentPage <= 1}
                        aria-label="Przenieś stronę wcześniej"
                        title="Przenieś stronę wcześniej"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18-6-6 6-6" /><path d="M5 6v12" /></svg>
                    </button>
                    <button
                        type="button"
                        className={`${classes.navBtn} ${classes.advanced}`}
                        onClick={() => movePage(1)}
                        disabled={currentPage >= pageCount}
                        aria-label="Przenieś stronę później"
                        title="Przenieś stronę później"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m10 18 6-6-6-6" /><path d="M19 6v12" /></svg>
                    </button>
                    <button
                        type="button"
                        className={`${classes.navBtn} ${classes.advanced}`}
                        onClick={clonePage}
                        aria-label="Duplikuj bieżącą stronę"
                        title="Duplikuj stronę (wstawiona po tej)"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                    </button>
                </>
            ) : null}

            {isFreeform ? (
                <>
                    <span className={classes.divider} />

                    <button
                        type="button"
                        className={classes.addBtn}
                        onClick={addPage}
                        aria-label="Dodaj stronę"
                        title="Dodaj stronę"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                    </button>

                    <button
                        type="button"
                        className={classes.removeBtn}
                        onClick={removePage}
                        disabled={pageCount <= 1}
                        aria-label="Usuń bieżącą stronę"
                        title="Usuń bieżącą stronę"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /></svg>
                    </button>
                </>
            ) : null}
        </div>
    );
}
