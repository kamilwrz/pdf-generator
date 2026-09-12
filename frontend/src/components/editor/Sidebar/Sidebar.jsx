import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Left tool rail: mode-aware tools, docs/gallery/upload, and logout.
 * Product-demo mode deliberately exposes only the template layout control;
 * ordinary guest and authenticated editors retain their existing tools.
 * Children slot hosts docked flyouts (SectionsPanel) that open beside the
 * rail via absolute positioning (`left: 100%`). Element properties use the
 * floating `Editor` panel above the selection — not a slide-out here.
 */
import classes from "./Sidebar.module.css";
import SidebarControls from "../../common/SidebarControls/SidebarControls";
import { TfiLayoutLineSolid } from "react-icons/tfi";
import { BiCircle, BiRectangle } from "react-icons/bi";
import { CiText } from "react-icons/ci";
import { BsTextParagraph } from "react-icons/bs";
import { LuImagePlus, LuListTree, LuLockOpen } from "react-icons/lu";
import { AiOutlineLogout } from "react-icons/ai";
import { LuFileSearch, LuFolderOpen } from "react-icons/lu";
import { useCanvasContext } from "../../../store/canvas-context";
import { useSession } from "../../../store/session-context";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import { Link } from "react-router-dom";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";


export default function Sidebar({ children }) {
  useTranslation();

    const {
        addText,
        addLine,
        addRectangle,
        addCircle,
        addEllipse,
        addPolygon,
        addPath,
        addTextarea,
        editorMode,
        fitTooLong,
        isDemoContent,
    } = useCanvasContext();
    const {
        showGallery,
        isGallery,
        showSections,
        isSectionsPanel,
        showUnlockFreeform,
        isUnlockFreeformModal,
        setIsModalPdfs,
        isModalPdfs,
        showPlanModal,
    } = useUiSurfaces();
    const {
        logout,
        isGuest,
        PDFs,
        entitlements,
    } = useSession();

    // Demo content is intentionally locked to the template tool rail even if a
    // transient editor-mode update occurs while the starter is being replaced.
    const isTemplate = editorMode === EDITOR_MODE_TEMPLATE || isDemoContent;
    const photoLabel = isTemplate ? uiText("editor:sidebar.profilePhoto") : uiText("editor:sidebar.photos");

    function showModalWithPDFs() {
        setIsModalPdfs(bool => !bool);
    }

    return <aside className={classes.sidebar} data-anchor="editor-sidebar">

        <div className={classes.logoContainer}>
            <Link
                to="/"
                className={classes.logoMark}
                aria-label={uiText("public:siteLayout.cvStudioHomepage")}
                title={uiText("editor:sidebar.homepage")}
            >
                <img src="/cv-studio-mark.svg" alt="" />
            </Link>
        </div>

        <div className={classes.toolsContainer}>
            <div className={classes.toolsList}>
                {!isDemoContent ? (
                    <SidebarControls
                        icon={<LuImagePlus />}
                        labelText={photoLabel}
                        tooltipText={isTemplate ? uiText("editor:sidebar.addOrChangeProfilePhoto") : uiText("editor:sidebar.addPhoto")}
                        sidebarEvent={showGallery}
                        active={isGallery}
                    />
                ) : null}
                {isTemplate ? (
                    <>
                        <SidebarControls
                            icon={<LuListTree />}
                            labelText={uiText("editor:sectionsPanel.customiseCv")}
                            sidebarEvent={showSections}
                            controlId="sections"
                            badge={fitTooLong}
                            active={isSectionsPanel}
                        />
                        {!isDemoContent ? (
                            <SidebarControls
                                icon={<LuLockOpen />}
                                labelText={uiText("editor:sidebar.editAsACopy")}
                                tooltipText={uiText("editor:sidebar.createAFreeformEditingCopy")}
                                sidebarEvent={showUnlockFreeform}
                                active={isUnlockFreeformModal}
                            />
                        ) : null}
                    </>
                ) : (
                    <>
                        <SidebarControls icon={<CiText />} labelText={uiText("editor:sidebar.addText")} sidebarEvent={addText} />
                        <SidebarControls icon={<BsTextParagraph />} labelText={uiText("editor:sidebar.addTextField")} sidebarEvent={addTextarea} />
                        <SidebarControls icon={<TfiLayoutLineSolid />} labelText={uiText("editor:sidebar.addLine")} sidebarEvent={addLine} />
                        <SidebarControls icon={<BiRectangle />} labelText={uiText("editor:sidebar.addRectangle")} sidebarEvent={addRectangle} />
                        <SidebarControls icon={<BiCircle />} labelText={uiText("editor:sidebar.addCircle")} sidebarEvent={addCircle} />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>}
                            labelText={uiText("editor:sidebar.addEllipse")}
                            sidebarEvent={addEllipse}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,3 21,20 3,20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                            labelText={uiText("editor:sidebar.addTriangle")}
                            sidebarEvent={() => addPolygon("triangle")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,2 22,12 12,22 2,12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                            labelText={uiText("editor:sidebar.addDiamond")}
                            sidebarEvent={() => addPolygon("diamond")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,3 17,3 22,12 17,21 7,21 2,12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                            labelText={uiText("editor:sidebar.addHexagon")}
                            sidebarEvent={() => addPolygon("hexagon")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 14 C6 4, 10 20, 14 14 S22 4, 22 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                            labelText={uiText("editor:sidebar.addWaveBZier")}
                            sidebarEvent={() => addPath("wave")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 18 C8 4, 16 4, 22 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                            labelText={uiText("editor:sidebar.addArcBZier")}
                            sidebarEvent={() => addPath("arc")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 16 C6 4, 10 20, 14 10 S20 6, 22 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                            labelText={uiText("editor:sidebar.addDecorationBZier")}
                            sidebarEvent={() => addPath("flourish")}
                        />
                    </>
                )}
            </div>
        </div>

        <div className={classes.toolsContainer} data-anchor="sidebar-documents-divider">
            <div className={classes.toolsList}>
                {!isDemoContent ? (
                    <SidebarControls icon={<LuFolderOpen />} labelText={uiText("public:siteLayout.myDocuments")} to="/app/documents" />
                ) : null}
                {!isDemoContent && !isGuest ? (
                    <SidebarControls
                        icon={<LuFileSearch />}
                        labelText={uiText("editor:sidebar.quickOpenDocument")}
                        sidebarEvent={showModalWithPDFs}
                        documents={PDFs.length}
                        active={isModalPdfs}
                    />
                ) : null}
            </div>
        </div>

        <footer className={classes.sidebarFooter}>
            {!isGuest && !isDemoContent && <SidebarControls icon={<LuListTree />} labelText={uiText("interview:interviewFlow.accountAndPlan")} to="/app/account" />}
            {!isDemoContent && entitlements?.plan_name ? (
                <div className={classes.planBadgeWrap}>
                <button
                    type="button"
                    className={classes.planBadge}
                    onClick={() => showPlanModal?.()}
                    title={[
                        uiText("editor:sidebar.changePlan"),
                        entitlements.plan_name,
                        entitlements.remaining?.exports != null
                            ? `Pobrania PDF: ${entitlements.usage?.exports_count ?? 0}/${entitlements.limits?.max_exports_per_month ?? "∞"}`
                            : null,
                        entitlements.remaining?.projects != null
                            ? `Projekty CV: ${entitlements.usage?.projects ?? 0}/${entitlements.limits?.max_projects ?? "∞"}`
                            : null,
                        entitlements.remaining?.cv_imports != null
                            ? `Importy CV: ${entitlements.usage?.cv_imports_count ?? 0}/${entitlements.limits?.max_cv_imports_per_month ?? "∞"}`
                            : null,
                        entitlements.limits?.monthly_ai_credits > 0
                            ? uiText("editor:sidebar.aiCredits", { value0: (entitlements.usage?.ai_credits_used ?? 0), value1: (entitlements.limits.monthly_ai_credits) })
                            : null,
                    ].filter(Boolean).join(" · ")}
                >
                    {entitlements.plan_name}
                </button>
                </div>
            ) : null}
            {!isDemoContent && entitlements?.limits?.monthly_ai_credits ? (
                <div
                    className={classes.creditsBadge}
                    title={uiText("editor:sidebar.aiCreditsOfUsed", { value0: (entitlements.usage?.ai_credits_used ?? 0), value1: (entitlements.limits.monthly_ai_credits) })}
                >
                    <span className={classes.creditsBadgeValue}>
                        {entitlements.remaining?.ai_credits ?? Math.max(0, entitlements.limits.monthly_ai_credits - (entitlements.usage?.ai_credits_used ?? 0))}
                    </span>
                    <span className={classes.creditsBadgeLabel}>AI</span>
                </div>
            ) : null}
            {isGuest || isDemoContent ? null : (
                <button className={classes.logout} onClick={logout} aria-label={uiText("editor:sidebar.signOut")} title={uiText("editor:sidebar.signOut")}>
                    <AiOutlineLogout />
                </button>
            )}
        </footer>

        {children}

    </aside>
}
