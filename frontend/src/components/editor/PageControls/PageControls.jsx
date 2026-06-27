import classes from "./PageControls.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";

const Chevron = ({ dir }) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
);

export default function PageControls() {
    const { currentPage, pageCount, addPage, removePage, goToPage } = use(PdfContext);

    return (
        <div className={classes.wrapper}>
            <div className={classes.bar}>
                <button
                    type="button"
                    className={classes.navBtn}
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                >
                    <Chevron dir="left" />
                </button>

                <span className={classes.label}>
                    Page <b>{currentPage}</b> <span className={classes.sep}>/</span> {pageCount}
                </span>

                <button
                    type="button"
                    className={classes.navBtn}
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= pageCount}
                    aria-label="Next page"
                >
                    <Chevron dir="right" />
                </button>

                <span className={classes.divider} />

                <button type="button" className={classes.addBtn} onClick={addPage}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add page
                </button>

                <button
                    type="button"
                    className={classes.removeBtn}
                    onClick={removePage}
                    disabled={pageCount <= 1}
                    aria-label="Remove current page"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /></svg>
                </button>
            </div>
        </div>
    );
}
