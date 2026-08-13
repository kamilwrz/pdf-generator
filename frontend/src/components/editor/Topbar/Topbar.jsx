/**
 * Editor chrome: title, save/download, import/wizard/AI entry, undo/redo, zoom.
 * Action buttons are icon-only with tooltips (title + aria-label).
 * Download/save go through PdfContext create/update (entitlement-gated upstream).
 *
 * The templates control sits on the A4 page's left edge (measured from
 * `.page-canvas`) rather than in the left action group. The grid button still
 * opens the change-template modal; flanking arrows restyle in place without
 * opening that dialog.
 */
import classes from "./Topbar.module.css";
import { use, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { LuLockOpen } from "react-icons/lu";
import { RiFileTextLine, RiDownload2Line, RiShuffleLine, RiArrowGoBackLine, RiArrowGoForwardLine, RiArrowLeftSLine, RiArrowRightSLine } from "react-icons/ri";
import { FiEdit3, FiSave, FiTrash2, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { TiPen } from "react-icons/ti";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { TEMPLATES } from "../../../templates";
import { adjacentAllowedTemplate } from "../../../utils/cvTemplateSelection";
import { useApplyCvTemplate } from "../../../hooks/useApplyCvTemplate";
import PageControls from "../PageControls/PageControls";

export default function Topbar({ titleRef }) {
    const {
        showAiPanel,
        showBioCvModal,
        showChangeTemplateModal,
        showUnlockFreeform,
        activeCvData,
        activeTemplateId,
        entitlements,
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
        currentPage,
        undo,
        redo,
        canUndo,
        canRedo,
    } = use(PdfContext);
    const { applyTemplate, fillingId } = useApplyCvTemplate();

    const isTemplate = editorMode === EDITOR_MODE_TEMPLATE;
    const topbarRef = useRef(null);
    const [a4Left, setA4Left] = useState(null);

    useLayoutEffect(() => {
        const topbar = topbarRef.current;
        if (!topbar) return undefined;

        const update = () => {
            const page = document.querySelector(".page-canvas");
            if (!page) {
                setA4Left(null);
                return;
            }
            const pageRect = page.getBoundingClientRect();
            const barRect = topbar.getBoundingClientRect();
            setA4Left(Math.round(pageRect.left - barRect.left));
        };

        update();
        const canvasArea = document.querySelector(".canvas-area");
        const page = document.querySelector(".page-canvas");
        const observer = new ResizeObserver(update);
        observer.observe(topbar);
        if (canvasArea) observer.observe(canvasArea);
        if (page) observer.observe(page);
        canvasArea?.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            observer.disconnect();
            canvasArea?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [zoom, isTwoPageView, currentPage]);

    const prevTemplate = useMemo(
        () => adjacentAllowedTemplate(TEMPLATES, activeTemplateId, -1, entitlements),
        [activeTemplateId, entitlements],
    );
    const nextTemplate = useMemo(
        () => adjacentAllowedTemplate(TEMPLATES, activeTemplateId, 1, entitlements),
        [activeTemplateId, entitlements],
    );

    const canRestyle = Boolean(activeCvData) && !fillingId && !isPdfLoading;
    const templatesHint = activeCvData
        ? "Zmień szablon"
        : "Najpierw wypełnij CV z PDF albo kreatorem krok po kroku";

    return (
        <header className={classes.topbar} ref={topbarRef}>
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

            {a4Left != null ? (
                <div
                    className={classes.templateSwitcher}
                    style={{ left: a4Left }}
                    role="group"
                    aria-label="Szablon CV"
                >
                    <button
                        type="button"
                        className={`${classes.iconBtn} ${classes.templateSwitcherPrev}`}
                        onClick={() => prevTemplate && applyTemplate(prevTemplate)}
                        disabled={!canRestyle || !prevTemplate}
                        aria-label={prevTemplate ? `Poprzedni szablon: ${prevTemplate.name}` : "Poprzedni szablon"}
                        title={prevTemplate ? `Poprzedni szablon: ${prevTemplate.name}` : templatesHint}
                    >
                        <RiArrowLeftSLine />
                    </button>
                    <button
                        type="button"
                        className={classes.feature}
                        onClick={showChangeTemplateModal}
                        disabled={!activeCvData}
                        aria-label="Szablony"
                        title={templatesHint}
                    >
                        <RiShuffleLine />
                    </button>
                    <button
                        type="button"
                        className={classes.iconBtn}
                        onClick={() => nextTemplate && applyTemplate(nextTemplate)}
                        disabled={!canRestyle || !nextTemplate}
                        aria-label={nextTemplate ? `Następny szablon: ${nextTemplate.name}` : "Następny szablon"}
                        title={nextTemplate ? `Następny szablon: ${nextTemplate.name}` : templatesHint}
                    >
                        <RiArrowRightSLine />
                    </button>
                </div>
            ) : null}

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
                <PageControls />
                <span className={classes.divider} aria-hidden="true" />
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
