/**
 * Editor chrome: title, save/download, templates/AI entry, undo/redo, zoom.
 * Download/save go through PdfContext create/update (entitlement-gated upstream).
 */
import classes from "./Topbar.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { LuLayoutTemplate, LuLockOpen } from "react-icons/lu";
import { RiFileTextLine, RiDownload2Line, RiShuffleLine } from "react-icons/ri";
import { FiEdit3, FiSave, FiTrash2, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { RiArrowGoBackLine, RiArrowGoForwardLine } from "react-icons/ri";
import { TiPen } from "react-icons/ti";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";

export default function Topbar({ titleRef }) {
    const {
        showTemplates,
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
                <button type="button" className={classes.feature} onClick={showTemplates}>
                    <LuLayoutTemplate />
                    <span className={classes.label}>Szablony</span>
                </button>
                <button type="button" className={classes.feature} onClick={showAiPanel}>
                    <RiFileTextLine />
                    <span className={classes.label}>Importuj CV</span>
                </button>
                <button type="button" className={classes.feature} onClick={showBioCvModal}>
                    <FiEdit3 />
                    <span className={classes.label}>Utwórz CV krok po kroku</span>
                </button>
                <button
                    type="button"
                    className={classes.feature}
                    onClick={showChangeTemplateModal}
                    disabled={!activeCvData}
                    title={activeCvData ? undefined : "Najpierw wypełnij CV z PDF albo kreatorem krok po kroku"}
                >
                    <RiShuffleLine />
                    <span className={classes.label}>Zmień szablon</span>
                </button>
                {isTemplate ? (
                    <button
                        type="button"
                        className={classes.feature}
                        onClick={showUnlockFreeform}
                        title="Utwórz kopię ze swobodnym pozycjonowaniem"
                    >
                        <LuLockOpen />
                        <span className={classes.label}>Odblokuj edycję</span>
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
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
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
                <button type="button" className={classes.ghost} onClick={clearA4}>
                    <FiTrash2 />
                    <span className={classes.label}>Wyczyść</span>
                </button>
                <button
                    type="button"
                    className={classes.secondary}
                    onClick={updatePdf}
                    disabled={isPdfLoading || activePdfId == null}
                    title={activePdfId == null ? "Najpierw utwórz PDF" : "Pobierz PDF"}
                >
                    <RiDownload2Line />
                    <span className={classes.label}>Pobierz</span>
                </button>
                <button type="button" className={classes.primary} onClick={createPdf} disabled={isPdfLoading}>
                    <FiSave />
                    <span className={classes.label}>Zapisz PDF</span>
                </button>
            </div>
        </header>
    );
}
