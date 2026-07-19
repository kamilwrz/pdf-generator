import classes from "./Topbar.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { PAGE_PRESETS } from "../../../hooks/useA4Elements";
import { LuLayoutTemplate } from "react-icons/lu";
import { RiRobot2Line, RiDownload2Line } from "react-icons/ri";
import { FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { MdOutlineSlideshow } from "react-icons/md";
import { RiArticleLine, RiArrowGoBackLine, RiArrowGoForwardLine } from "react-icons/ri";
import { TiPen } from "react-icons/ti";

export default function Topbar({ titleRef }) {
    const {
        showTemplates,
        showAiPanel,
        showDeckPanel,
        showArticlePanel,
        createPdf,
        updatePdf,
        clearA4,
        isPdfLoading,
        activePdfId,
        pageSize,
        setPagePreset,
        undo,
        redo,
        canUndo,
        canRedo,
    } = use(PdfContext);

    return (
        <header className={classes.topbar}>
            <div className={classes.group}>
                <button type="button" className={classes.feature} onClick={showTemplates}>
                    <LuLayoutTemplate />
                    <span className={classes.label}>Szablony</span>
                </button>
                <button type="button" className={classes.feature} onClick={showAiPanel}>
                    <RiRobot2Line />
                    <span className={classes.label}>Wypełnij z mojego CV</span>
                </button>
                <button type="button" className={classes.feature} onClick={showDeckPanel}>
                    <MdOutlineSlideshow />
                    <span className={classes.label}>Prezentacja AI</span>
                </button>
                <button type="button" className={classes.feature} onClick={showArticlePanel}>
                    <RiArticleLine />
                    <span className={classes.label}>Artykuł AI</span>
                </button>

                <span className={classes.divider} aria-hidden="true" />

                <button type="button" className={classes.iconBtn} onClick={undo} disabled={!canUndo} aria-label="Cofnij" title="Cofnij (Ctrl+Z)">
                    <RiArrowGoBackLine />
                </button>
                <button type="button" className={classes.iconBtn} onClick={redo} disabled={!canRedo} aria-label="Ponów" title="Ponów (Ctrl+Shift+Z)">
                    <RiArrowGoForwardLine />
                </button>
            </div>

            <div className={classes.center}>
                <div className={classes.projectField}>
                    <span className={classes.projectIcon} aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                    </span>
                    <input
                        type="text"
                        name="title"
                        id="title"
                        ref={titleRef}
                        placeholder="Projekt bez tytułu"
                        aria-label="Nazwa bieżącego projektu"
                    />
                    <button
                        type="button"
                        className={classes.rename}
                        aria-label="Zmień nazwę projektu"
                        onClick={() => titleRef?.current?.focus()}
                    >
                        <TiPen />
                    </button>
                </div>
                <select
                    className={classes.sizeSelect}
                    aria-label="Rozmiar strony"
                    value={pageSize?.preset ?? "a4-portrait"}
                    onChange={(e) => setPagePreset(e.target.value)}
                >
                    {Object.entries(PAGE_PRESETS).map(([id, p]) => (
                        <option key={id} value={id}>{p.label}</option>
                    ))}
                    {pageSize?.preset === "custom" && (
                        <option value="custom">{`${pageSize.width}×${pageSize.height}`}</option>
                    )}
                </select>
            </div>

            <div className={classes.group}>
                <button type="button" className={classes.ghost} onClick={clearA4}>
                    <FiTrash2 />
                    <span className={classes.label}>Wyczyść</span>
                </button>
                <button
                    type="button"
                    className={classes.secondary}
                    onClick={updatePdf}
                    disabled={isPdfLoading || activePdfId == null}
                    title={activePdfId == null ? "Najpierw utwórz PDF" : "Aktualizuj zapisany PDF"}
                >
                    <FiRefreshCw />
                    <span className={classes.label}>Aktualizuj</span>
                </button>
                <button type="button" className={classes.primary} onClick={createPdf} disabled={isPdfLoading}>
                    <RiDownload2Line />
                    <span className={classes.label}>Utwórz PDF</span>
                </button>
            </div>
        </header>
    );
}
