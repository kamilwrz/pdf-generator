/**
 * Multi-page navigation and two-page spread toggle for the canvas.
 */
import classes from "./PageControls.module.css";
import { useCanvasContext } from "../../../store/canvas-context";

const Chevron = ({ dir }) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
);

export default function PageControls() {
    const {
        currentPage, pageCount, addPage, removePage, goToPage, clonePage, movePage,
        isTwoPageView, toggleTwoPageView,
    } = useCanvasContext();

    return (
        <div className={classes.wrapper}>
            <div className={classes.bar}>
                <button
                    type="button"
                    className={classes.navBtn}
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Poprzednia strona"
                >
                    <Chevron dir="left" />
                </button>

                <span className={classes.label}>
                    Strona <b>{currentPage}</b> <span className={classes.sep}>/</span> {pageCount}
                </span>

                <button
                    type="button"
                    className={classes.navBtn}
                    onClick={() => goToPage(currentPage + 1)}
                    // At the last page, Next creates a fresh continuation with
                    // template chrome (same as Dodaj stronę for one step).
                    disabled={currentPage >= 20}
                    aria-label={currentPage >= pageCount ? "Dodaj następną stronę" : "Następna strona"}
                    title={currentPage >= pageCount ? "Dodaj następną stronę" : "Następna strona"}
                >
                    <Chevron dir="right" />
                </button>

                <span className={classes.divider} />

                <button
                    type="button"
                    className={`${classes.navBtn} ${isTwoPageView ? classes.spreadActive : ""}`}
                    onClick={toggleTwoPageView}
                    disabled={pageCount < 2}
                    aria-label="Pokaż dwie strony obok siebie"
                    aria-pressed={isTwoPageView}
                    title="Widok dwóch stron"
                >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                        <rect x="3" y="4" width="7" height="16" rx="1.2" />
                        <rect x="14" y="4" width="7" height="16" rx="1.2" />
                    </svg>
                </button>

                <span className={classes.divider} />

                {/* reorder: swap the current page with its neighbour */}
                <button
                    type="button"
                    className={classes.navBtn}
                    onClick={() => movePage(-1)}
                    disabled={currentPage <= 1}
                    aria-label="Przenieś stronę wcześniej"
                    title="Przenieś stronę wcześniej"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18-6-6 6-6" /><path d="M5 6v12" /></svg>
                </button>
                <button
                    type="button"
                    className={classes.navBtn}
                    onClick={() => movePage(1)}
                    disabled={currentPage >= pageCount}
                    aria-label="Przenieś stronę później"
                    title="Przenieś stronę później"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m10 18 6-6-6-6" /><path d="M19 6v12" /></svg>
                </button>

                {/* clone: duplicate this page right after itself */}
                <button
                    type="button"
                    className={classes.navBtn}
                    onClick={clonePage}
                    aria-label="Duplikuj bieżącą stronę"
                    title="Duplikuj stronę (wstawiona po tej)"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                </button>

                <span className={classes.divider} />

                <button type="button" className={classes.addBtn} onClick={addPage}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                    Dodaj stronę
                </button>

                <button
                    type="button"
                    className={classes.removeBtn}
                    onClick={removePage}
                    disabled={pageCount <= 1}
                    aria-label="Usuń bieżącą stronę"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /></svg>
                </button>
            </div>
        </div>
    );
}
