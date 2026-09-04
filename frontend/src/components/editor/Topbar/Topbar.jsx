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
 * The project name and CV workflow controls live in the left action group
 * (rather than centered over the canvas or anchored to the A4 page edge).
 * This leaves the middle of the topbar free so the element-properties panel
 * (`Editor.jsx`, docked left of `[data-anchor="topbar-zoom"]`) never overlaps
 * them. The labelled template button opens the change-template modal;
 * flanking arrows restyle in place without opening that dialog.
 */
import classes from "./Topbar.module.css";
import { useMemo } from "react";
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
import PageControls from "../PageControls/PageControls";

export default function Topbar({ titleRef, title, onTitleChange }) {
    const { showAiPanel, showNewCvSetup, showChangeTemplateModal } = useUiSurfaces();
    const {
        isDemoContent,
        activeCvData,
        activeTemplateId,
        createPdf,
        downloadPdf,
        clearA4,
        isPdfLoading,
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
        ? "Zmień szablon"
        : "Najpierw utwórz nowe CV albo zaimportuj PDF";

    return (
        <header className={classes.topbar} data-anchor="editor-topbar">
            {/* Left: document identity, creation/appearance workflow, then edit
                history. The ordering keeps document-wide actions together and
                reserves icon-only controls for conventions users already know. */}
            <div className={classes.group}>
                {isDemoContent ? (
                    <div className={classes.demoIdentity} aria-label="CV Studio Demo">
                        <span>CV STUDIO</span>
                        <strong>DEMO</strong>
                    </div>
                ) : <div className={classes.projectField}>
                    <span className={classes.projectIcon} aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                    </span>
                    <input
                        type="text"
                        name="title"
                        id="title"
                        ref={titleRef}
                        value={title}
                        onChange={(event) => onTitleChange(event.target.value)}
                        placeholder="Projekt bez tytułu"
                        aria-label="Nazwa bieżącego dokumentu"
                    />
                    <button
                        type="button"
                        className={classes.rename}
                        aria-label="Zmień nazwę dokumentu"
                        title="Zmień nazwę dokumentu"
                        onClick={() => titleRef?.current?.focus()}
                    >
                        <TiPen />
                    </button>
                </div>}
                {!isDemoContent && <span className={classes.divider} aria-hidden="true" />}
                {!isDemoContent && <div className={classes.workflowCluster} role="group" aria-label="Tworzenie i wygląd CV">
                    <button
                        type="button"
                        className={`${classes.feature} ${classes.labeled}`}
                        onClick={showAiPanel}
                        aria-label="Importuj PDF"
                        title={isGuest ? "Importuj PDF — wymagane konto" : "Importuj PDF"}
                    >
                        <RiFileTextLine />
                        <span className={`${classes.actionLabel} ${classes.toolLabel}`}>Importuj PDF</span>
                    </button>
                    <button
                        type="button"
                        className={`${classes.feature} ${classes.labeled}`}
                        onClick={showNewCvSetup}
                        aria-label="Nowe CV"
                        title="Utwórz nowe CV"
                    >
                        <FiPlus />
                        <span className={`${classes.actionLabel} ${classes.toolLabel}`}>Nowe CV</span>
                    </button>
                    <div className={classes.templateCluster} role="group" aria-label="Szablon CV">
                    {/* Hovering/focusing an arrow reveals a small live mockup of the
                        template it would switch to, instead of a plain text tooltip —
                        `title` is only set for the disabled edge case (no adjacent
                        template) so the native tooltip never fights the preview card. */}
                    <div className={classes.templateNavAnchor}>
                        <button
                            type="button"
                            className={classes.iconBtn}
                            onClick={() => prevTemplate && applyTemplate(prevTemplate)}
                            disabled={!canRestyle || !prevTemplate}
                            aria-label={prevTemplate ? `Poprzedni szablon: ${prevTemplate.name}` : "Poprzedni szablon"}
                            title={prevTemplate ? `Poprzedni szablon: ${prevTemplate.name}` : templatesHint}
                        >
                            <RiArrowLeftSLine />
                        </button>
                        {prevTemplate && (
                            <div className={`${classes.templatePreview} ${classes.templatePreviewLeft}`} role="presentation">
                                <img src={`/template-mockups/${prevTemplate.id}.png`} alt="" loading="lazy" />
                                <span className={classes.templatePreviewLabel}>{prevTemplate.name}</span>
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className={`${classes.feature} ${classes.labeled}`}
                        onClick={showChangeTemplateModal}
                        disabled={!activeCvData}
                        aria-label="Zmień szablon"
                        title={templatesHint}
                    >
                        <RiShuffleLine />
                        <span className={`${classes.actionLabel} ${classes.toolLabel}`}>Zmień szablon</span>
                    </button>
                    <div className={classes.templateNavAnchor}>
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
                        {nextTemplate && (
                            <div className={`${classes.templatePreview} ${classes.templatePreviewRight}`} role="presentation">
                                <img src={`/template-mockups/${nextTemplate.id}.png`} alt="" loading="lazy" />
                                <span className={classes.templatePreviewLabel}>{nextTemplate.name}</span>
                            </div>
                        )}
                    </div>
                    </div>
                </div>}
                <span className={classes.divider} aria-hidden="true" />
                <div className={classes.cluster} role="group" aria-label="Historia zmian">
                    <button type="button" className={classes.iconBtn} onClick={undo} disabled={!canUndo} aria-label="Cofnij" title="Cofnij (Ctrl+Z)">
                        <RiArrowGoBackLine />
                    </button>
                    <button type="button" className={classes.iconBtn} onClick={redo} disabled={!canRedo} aria-label="Ponów" title="Ponów (Ctrl+Shift+Z)">
                        <RiArrowGoForwardLine />
                    </button>
                </div>
                {onePageFit ? (
                    <button
                        type="button"
                        className={classes.fitOne}
                        onClick={onFitToOnePage}
                        aria-label="Zmieść CV na 1 stronę"
                        title="Zmieść CV na 1 stronę…"
                    >
                        <RiFileReduceLine aria-hidden="true" />
                        <span aria-hidden="true">1</span>
                    </button>
                ) : null}
            </div>

            {/* Right: view controls (zoom + pages), then document output. */}
            <div className={classes.group}>
                <div className={classes.cluster} role="group" aria-label="Widok dokumentu">
                    {/* Anchor for Editor.jsx's element-properties panel — it docks
                        50px to the left of this cluster, not near the canvas
                        selection. `data-*` (not the CSS-module class) so the
                        selector survives module class hashing across files. */}
                    <div className={classes.zoomCluster} data-anchor="topbar-zoom">
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
                    <PageControls />
                </div>
                {isDemoContent ? (
                    <>
                        <span className={classes.divider} aria-hidden="true" />
                        <Link
                            className={classes.demoAction}
                            to="/register?start=import"
                            aria-label="Wgraj własne CV po utworzeniu konta"
                        >
                            Wgraj CV
                        </Link>
                    </>
                ) : null}
                {!isDemoContent && <><span className={classes.divider} aria-hidden="true" />
                <div className={classes.cluster} role="group" aria-label="Operacje dokumentu">
                    <button
                        type="button"
                        className={classes.ghost}
                        onClick={clearA4}
                        aria-label="Wyczyść zawartość CV"
                        title="Wyczyść zawartość CV"
                    >
                        <FiTrash2 />
                    </button>
                    <span className={classes.actionDivider} aria-hidden="true" />
                    {/* Download is independent of Save: it renders the current
                        canvas on demand, so it stays enabled even before the
                        document has ever been saved to "Moje dokumenty". */}
                    <button
                        type="button"
                        className={`${classes.secondary} ${classes.labeled}`}
                        onClick={downloadPdf}
                        disabled={isPdfLoading}
                        aria-label="Pobierz PDF"
                        title="Pobierz PDF"
                        aria-busy={isPdfLoading}
                    >
                        <RiDownload2Line />
                        <span className={`${classes.actionLabel} ${classes.outputLabel}`}>Pobierz PDF</span>
                    </button>
                    <button
                        type="button"
                        className={`${classes.primary} ${classes.labeled}`}
                        onClick={createPdf}
                        disabled={isPdfLoading}
                        aria-label="Zapisz dokument"
                        title="Zapisz dokument w Moich dokumentach"
                        aria-busy={isPdfLoading}
                    >
                        <FiSave />
                        <span className={`${classes.actionLabel} ${classes.outputLabel}`}>Zapisz</span>
                    </button>
                </div></>}
            </div>
        </header>
    );
}
