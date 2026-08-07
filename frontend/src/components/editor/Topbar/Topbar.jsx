/**
 * Editor chrome: title, save/download, import/wizard/AI entry, undo/redo, zoom.
 * Action buttons are icon-only with tooltips (title + aria-label).
 * Download/save go through PdfContext create/update (entitlement-gated upstream).
 * Template browsing is not a topbar entry — style is chosen in the wizard /
 * import funnel, then optionally via "Zmień szablon" after data exists.
 */
import classes from "./Topbar.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { LuLockOpen } from "react-icons/lu";
import { RiFileTextLine, RiDownload2Line, RiShuffleLine } from "react-icons/ri";
import { FiEdit3, FiSave, FiTrash2, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { RiArrowGoBackLine, RiArrowGoForwardLine } from "react-icons/ri";
import { TiPen } from "react-icons/ti";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";

export default function Topbar({ titleRef }) {
    const {
        showAiPanel,
        showBioCvModal,
        showChangeTemplateModal,
        showUnlockFreeform,
        activeCvData,
        editorMode,
        createPdf,
        updatePdf,
        clearA4,
        isPdfLoading,
        activePdfId,
        zoom,
        zoomIn,
        zoomOut,
        isTwoPageView,
        undo,
        redo,
        canUndo,
        canRedo,
    } = use(PdfContext);

    const isTemplate = editorMode === EDITOR_MODE_TEMPLATE;

    return (
        <header className={classes.topbar}>
            <div className={classes.group}>
                <button
                    type="button"
                    className={classes.feature}
                    onClick={showAiPanel}
                    aria-label="Importuj CV"
                    title="Importuj CV"
                >
                    <RiFileTextLine />
                </button>
                <button
                    type="button"
                    className={classes.feature}
                    onClick={showBioCvModal}
                    aria-label="Utwórz CV krok po kroku"
                    title="Utwórz CV krok po kroku"
                >
                    <FiEdit3 />
                </button>
                <button
                    type="button"
                    className={classes.feature}
                    onClick={showChangeTemplateModal}
                    disabled={!activeCvData}
                    aria-label="Zmień szablon"
                    title={activeCvData
                        ? "Zmień szablon"
                        : "Najpierw wypełnij CV z PDF albo kreatorem krok po kroku"}
                >
                    <RiShuffleLine />
                </button>
                {isTemplate ? (
                    <button
                        type="button"
                        className={classes.feature}
                        onClick={showUnlockFreeform}
                        aria-label="Odblokuj edycję"
                        title="Odblokuj edycję — utwórz kopię ze swobodnym pozycjonowaniem"
                    >
                        <LuLockOpen />
                    </button>
                ) : null}
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
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
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
                        title="Zmień nazwę projektu"
                        onClick={() => titleRef?.current?.focus()}
                    >
                        <TiPen />
                    </button>
                </div>
                <div className={classes.zoomCluster}>
                    <button
                        type="button"
                        className={classes.zoomBtn}
                        onClick={zoomOut}
                        disabled={isTwoPageView || zoom <= 0.25}
                        aria-label="Pomniejsz"
                        title="Pomniejsz"
                    >
                        <FiZoomOut />
                    </button>
                    <span className={classes.zoomValue}>{isTwoPageView ? "100%" : `${Math.round(zoom * 100)}%`}</span>
                    <button
                        type="button"
                        className={classes.zoomBtn}
                        onClick={zoomIn}
                        disabled={isTwoPageView || zoom >= 3}
                        aria-label="Powiększ"
                        title="Powiększ"
                    >
                        <FiZoomIn />
                    </button>
                </div>
            </div>

            <div className={classes.group}>
                <button
                    type="button"
                    className={classes.ghost}
                    onClick={clearA4}
                    aria-label="Wyczyść"
                    title="Wyczyść"
                >
                    <FiTrash2 />
                </button>
                <button
                    type="button"
                    className={classes.secondary}
                    onClick={updatePdf}
                    disabled={isPdfLoading || activePdfId == null}
                    aria-label="Pobierz PDF"
                    title={activePdfId == null ? "Najpierw utwórz PDF" : "Pobierz PDF"}
                >
                    <RiDownload2Line />
                </button>
                <button
                    type="button"
                    className={classes.primary}
                    onClick={createPdf}
                    disabled={isPdfLoading}
                    aria-label="Zapisz PDF"
                    title="Zapisz PDF"
                >
                    <FiSave />
                </button>
            </div>
        </header>
    );
}
