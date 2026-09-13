import { templatePreviewPath } from '../../../i18n/templatePreviews.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Editor chrome for both the full editor and the reduced product-demo mode.
 * Demo mode keeps history, zoom, pagination, and one account-gated CV import
 * entry point; persistence and destructive document actions are omitted.
 * Ambiguous document actions keep short visible labels, while conventional
 * history, zoom, and pagination controls remain icon-only with tooltips.
 * Save (`createPdf`) is the only path that writes to "Moje dokumenty" (create on
 * first save, update thereafter). Download (`downloadPdf`) is independent: it
 * renders the current canvas on demand without saving. Both are
 * entitlement-gated upstream.
 *
 * History follows creation in the left group. The middle rail reserves equal
 * space around centered templates; pagination, zoom and spread sit on its right.
 * Its width never follows live canvas zoom. Creation stays at the far left;
 * naming, saving, and downloading stay at the far right.
 */
import classes from "./Topbar.module.css";
import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import { RiFileTextLine, RiDownload2Line, RiShuffleLine, RiFileReduceLine, RiArrowGoBackLine, RiArrowGoForwardLine, RiArrowLeftSLine, RiArrowRightSLine } from "react-icons/ri";
import { FiPlus, FiSave, FiTrash2, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { TiPen } from "react-icons/ti";
import { TEMPLATES } from "../../../templates";
import { adjacentAllowedTemplate } from "../../../utils/cvTemplateSelection";
import { useApplyCvTemplate } from "../../../hooks/useApplyCvTemplate";
import PageControls, { TwoPageViewToggle } from "../PageControls/PageControls";

export default function Topbar({ titleRef, title, onTitleChange }) {
  useTranslation();
    const topbarRef = useRef(null);

    useEffect(() => {
        const topbar = topbarRef.current;
        const canvas = topbar?.parentElement.querySelector(".canvas-area");
        if (!canvas) return;
        // The canvas reserves a platform-dependent scrollbar gutter. Mirror
        // that inset in the header so both content areas share the same axis.
        // ResizeObserver also covers viewport zoom and scrollbar changes.
        const shell = topbar.closest(".main-container");
        const syncGutter = () => {
            topbar.style.setProperty(
                "--canvas-scrollbar-gutter",
                `${canvas.offsetWidth - canvas.clientWidth}px`,
            );
            // Sidebar flyouts use this shared height to clear wrapped rows.
            shell?.style.setProperty("--topbar-h", `${topbar.offsetHeight}px`);
        };
        syncGutter();
        const observer = new ResizeObserver(syncGutter);
        observer.observe(canvas);
        observer.observe(topbar);
        return () => {
            observer.disconnect();
            shell?.style.removeProperty("--topbar-h");
        };
    }, []);

    const { showAiPanel, showNewCvSetup, showChangeTemplateModal } = useUiSurfaces();
    const {
        isDemoContent,
        activeCvData,
        activeTemplateId,
        createPdf,
        downloadPdf,
        clearA4,
        isPdfLoading,
        pageSize,
        zoom,
        zoomIn,
        zoomOut,
        isTwoPageView,
        undo,
        redo,
        canUndo,
        canRedo,
        onePageFit,
        onFitToOnePage,
    } = useCanvasContext();
    const { entitlements, isGuest } = useSession();
    const { applyTemplate, fillingId } = useApplyCvTemplate();

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
        ? uiText("editor:newCvSetupModal.changeTemplate")
        : uiText("editor:topbar.createANewCvOrImportA");

    return (
        <header ref={topbarRef} className={classes.topbar}
            style={{ "--topbar-page-width": `${pageSize.width}px` }}
            data-anchor="editor-topbar">
            {/* Creation stays separate from editing history and document-view controls. */}
            <div className={`${classes.group} ${classes.documentGroup}`}>
                {isDemoContent ? (
                    <div className={classes.demoIdentity} aria-label="CV Studio Demo">
                        <span>CV STUDIO</span>
                        <strong>DEMO</strong>
                    </div>
                ) : null}
                {!isDemoContent && <div className={classes.workflowCluster} role="group" aria-label={uiText("editor:topbar.creatingCv")}>
                    <button
                        type="button"
                        className={`${classes.feature} ${classes.labeled}`}
                        onClick={showAiPanel}
                        aria-label={uiText("editor:topbar.importPdf")}
                        title={isGuest ? uiText("editor:topbar.importPdfAccountRequired") : uiText("editor:topbar.importPdf")}
                    >
                        <RiFileTextLine />
                        <span className={`${classes.actionLabel} ${classes.toolLabel}`}>{uiText("editor:topbar.importPdf")}</span>
                    </button>
                    <button
                        type="button"
                        className={`${classes.feature} ${classes.labeled}`}
                        onClick={showNewCvSetup}
                        aria-label={uiText("editor:topbar.newCv")}
                        title={uiText("editor:newCvSetupModal.createANewCv")}
                    >
                        <FiPlus />
                        <span className={`${classes.actionLabel} ${classes.toolLabel}`}>{uiText("editor:topbar.newCv")}</span>
                    </button>
                </div>}
                <span className={classes.divider} aria-hidden="true" />
                <div className={classes.cluster} role="group" aria-label={uiText("editor:topbar.changeHistory")}>
                    <button type="button" className={classes.iconBtn} onClick={undo} disabled={!canUndo} aria-label={uiText("editor:topbar.undo")} title={uiText("editor:topbar.undoCtrlZ")}>
                        <RiArrowGoBackLine />
                    </button>
                    <button type="button" className={classes.iconBtn} onClick={redo} disabled={!canRedo} aria-label={uiText("editor:topbar.redo")} title={uiText("editor:topbar.redoCtrlShiftZ")}>
                        <RiArrowGoForwardLine />
                    </button>
                </div>
                {onePageFit ? (
                    <button
                        type="button"
                        className={classes.fitOne}
                        onClick={onFitToOnePage}
                        aria-label={uiText("editor:topbar.fitCvOnPage")}
                        title={uiText("editor:topbar.fitCvOnPage2")}
                    >
                        <RiFileReduceLine aria-hidden="true" />
                        <span aria-hidden="true">1</span>
                    </button>
                ) : null}
            </div>

            <div className={classes.canvasGroup} data-anchor="topbar-canvas-controls">
                <span className={classes.railSpacer} aria-hidden="true" />
                {!isDemoContent ? <div className={classes.templateCluster} role="group" aria-label={uiText("editor:newCvSetupModal.cvTemplate")}>
                    {/* Adjacent template previews appear on hover and keyboard focus;
                    native titles also name the action when a preview is unavailable. */}
                    <div className={classes.templateNavAnchor}>
                        <button
                            type="button"
                            className={classes.iconBtn}
                            onClick={() => prevTemplate && applyTemplate(prevTemplate)}
                            disabled={!canRestyle || !prevTemplate}
                            aria-label={prevTemplate ? `Poprzedni szablon: ${prevTemplate.name}` : uiText("editor:topbar.previousTemplate")}
                            title={prevTemplate ? `Poprzedni szablon: ${prevTemplate.name}` : templatesHint}
                        >
                            <RiArrowLeftSLine />
                        </button>
                        {prevTemplate && (
                            <div className={`${classes.templatePreview} ${classes.templatePreviewLeft}`} role="presentation">
                                <img src={templatePreviewPath(prevTemplate.id)} alt="" loading="lazy" />
                                <span className={classes.templatePreviewLabel}>{prevTemplate.name}</span>
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className={`${classes.feature} ${classes.labeled}`}
                        onClick={showChangeTemplateModal}
                        disabled={!activeCvData}
                        aria-label={uiText("editor:newCvSetupModal.changeTemplate")}
                        title={templatesHint}
                    >
                        <RiShuffleLine />
                        <span className={`${classes.actionLabel} ${classes.toolLabel}`}>{uiText("editor:newCvSetupModal.changeTemplate")}</span>
                    </button>
                    <div className={classes.templateNavAnchor}>
                        <button
                            type="button"
                            className={classes.iconBtn}
                            onClick={() => nextTemplate && applyTemplate(nextTemplate)}
                            disabled={!canRestyle || !nextTemplate}
                            aria-label={nextTemplate ? uiText("editor:topbar.nextTemplate", { value0: (nextTemplate.name) }) : uiText("editor:topbar.nextTemplate2")}
                            title={nextTemplate ? uiText("editor:topbar.nextTemplate", { value0: (nextTemplate.name) }) : templatesHint}
                        >
                            <RiArrowRightSLine />
                        </button>
                        {nextTemplate && (
                            <div className={`${classes.templatePreview} ${classes.templatePreviewRight}`} role="presentation">
                                <img src={templatePreviewPath(nextTemplate.id)} alt="" loading="lazy" />
                                <span className={classes.templatePreviewLabel}>{nextTemplate.name}</span>
                            </div>
                        )}
                    </div>
                </div> : <span aria-hidden="true" />}

                <div className={classes.viewGroup} role="group" aria-label={uiText("editor:topbar.documentView")}>
                    <PageControls />
                    <span className={classes.divider} aria-hidden="true" />
                    <div className={classes.cluster}>
                        {/* Stable view-controls anchor for editor chrome consumers. */}
                        <div className={classes.zoomCluster} data-anchor="topbar-zoom">
                            <button
                                type="button"
                                className={classes.zoomBtn}
                                onClick={zoomOut}
                                disabled={isTwoPageView || zoom <= 0.25}
                                aria-label={uiText("editor:topbar.zoomOut")}
                                title={uiText("editor:topbar.zoomOut")}
                            >
                                <FiZoomOut />
                            </button>
                            <span className={classes.zoomValue}>{isTwoPageView ? "100%" : `${Math.round(zoom * 100)}%`}</span>
                            <button
                                type="button"
                                className={classes.zoomBtn}
                                onClick={zoomIn}
                                disabled={isTwoPageView || zoom >= 3}
                                aria-label={uiText("editor:topbar.zoomIn")}
                                title={uiText("editor:topbar.zoomIn")}
                            >
                                <FiZoomIn />
                            </button>
                        </div>
                        <TwoPageViewToggle />
                    </div>
                </div>
            </div>

            {/* Name and save belong between the destructive and download actions. */}
            <div className={`${classes.group} ${classes.outputGroup}`}>
                {isDemoContent ? (
                    <>
                        <span className={classes.divider} aria-hidden="true" />
                        <Link
                            className={classes.demoAction}
                            to="/register?start=import"
                            aria-label={uiText("editor:topbar.uploadYourCvAfterCreatingAnAccount")}
                        >{uiText("editor:startChooser.uploadCv")}</Link>
                    </>
                ) : null}
                {!isDemoContent && <div className={classes.outputActions} role="group" aria-label={uiText("editor:topbar.documentActions")}>
                    <button
                        type="button"
                        className={classes.ghost}
                        onClick={clearA4}
                        aria-label={uiText("editor:topbar.clearCvContent")}
                        title={uiText("editor:topbar.clearCvContent")}
                    >
                        <FiTrash2 />
                    </button>
                    <div className={classes.projectField}>
                        <input
                            type="text"
                            name="title"
                            id="title"
                            ref={titleRef}
                            value={title}
                            onChange={(event) => onTitleChange(event.target.value)}
                            placeholder={uiText("editor:topbar.untitledDocument")}
                            aria-label={uiText("editor:topbar.currentDocumentName")}
                        />
                        <button
                            type="button"
                            className={classes.rename}
                            aria-label={uiText("editor:topbar.renameDocument")}
                            title={uiText("editor:topbar.renameDocument")}
                            onClick={() => titleRef?.current?.focus()}
                        >
                            <TiPen />
                        </button>
                    </div>
                    <button
                        type="button"
                        className={`${classes.primary} ${classes.labeled}`}
                        onClick={createPdf}
                        disabled={isPdfLoading}
                        aria-label={uiText("editor:pdfOperationProgressModal.saveDocument")}
                        title={uiText("editor:topbar.saveDocumentToMyDocuments")}
                        aria-busy={isPdfLoading}
                    >
                        <FiSave />
                        <span className={`${classes.actionLabel} ${classes.outputLabel}`}>{uiText("editor:topbar.save")}</span>
                    </button>
                    <button
                        type="button"
                        className={`${classes.secondary} ${classes.labeled}`}
                        onClick={downloadPdf}
                        disabled={isPdfLoading}
                        aria-label={uiText("editor:pdfOperationProgressModal.downloadPdf")}
                        title={uiText("editor:pdfOperationProgressModal.downloadPdf")}
                        aria-busy={isPdfLoading}
                    >
                        <RiDownload2Line />
                        <span className={`${classes.actionLabel} ${classes.outputLabel}`}>{uiText("editor:pdfOperationProgressModal.downloadPdf")}</span>
                    </button>
                </div>}
            </div>
        </header>
    );
}
