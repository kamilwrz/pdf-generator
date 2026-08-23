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
import { FaRegFolderOpen } from "react-icons/fa";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";
import { Link } from "react-router-dom";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";


export default function Sidebar({ children }) {

    const {
        addText,
        addLine,
        addRectangle,
        addCircle,
        addEllipse,
        addPolygon,
        addPath,
        addTextarea,
        showGallery,
        showSections,
        showUnlockFreeform,
        editorMode,
        setIsModalPdfs,
        logout,
        isGuest,
        PDFs,
        entitlements,
        showPlanModal,
        fitTooLong,
        isDemoContent,
    } = use(PdfContext);

    // Demo content is intentionally locked to the template tool rail even if a
    // transient editor-mode update occurs while the starter is being replaced.
    const isTemplate = editorMode === EDITOR_MODE_TEMPLATE || isDemoContent;

    function showModalWithPDFs() {
        setIsModalPdfs(bool => !bool);
    }

    return <aside className={classes.sidebar}>

        <div className={classes.logoContainer}>
            <Link
                to="/"
                className={classes.logoMark}
                aria-label="CV Studio — strona główna"
                title="Strona główna"
            >
                <img src="/cv-studio-mark.svg" alt="" />
            </Link>
        </div>

        <div className={classes.toolsContainer}>
            <div className={classes.toolsList}>
                {!isDemoContent ? (
                    <SidebarControls icon={<LuImagePlus />} labelText="Zdjęcia" sidebarEvent={showGallery} />
                ) : null}
                {isTemplate ? (
                    <>
                        <SidebarControls
                            icon={<LuListTree />}
                            labelText="Układ CV"
                            sidebarEvent={showSections}
                            badge={fitTooLong}
                        />
                        {!isDemoContent ? (
                            <SidebarControls
                                icon={<LuLockOpen />}
                                labelText="Odblokuj edycję (kopia freeform)"
                                sidebarEvent={showUnlockFreeform}
                            />
                        ) : null}
                    </>
                ) : (
                    <>
                        <SidebarControls icon={<CiText />} labelText="Dodaj tekst" sidebarEvent={addText} />
                        <SidebarControls icon={<BsTextParagraph />} labelText="Dodaj pole tekstowe" sidebarEvent={addTextarea} />
                        <SidebarControls icon={<TfiLayoutLineSolid />} labelText="Dodaj linię" sidebarEvent={addLine} />
                        <SidebarControls icon={<BiRectangle />} labelText="Dodaj prostokąt" sidebarEvent={addRectangle} />
                        <SidebarControls icon={<BiCircle />} labelText="Dodaj koło" sidebarEvent={addCircle} />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>}
                            labelText="Dodaj elipsę"
                            sidebarEvent={addEllipse}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,3 21,20 3,20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                            labelText="Dodaj trójkąt"
                            sidebarEvent={() => addPolygon("triangle")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,2 22,12 12,22 2,12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                            labelText="Dodaj romb"
                            sidebarEvent={() => addPolygon("diamond")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,3 17,3 22,12 17,21 7,21 2,12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                            labelText="Dodaj sześciokąt"
                            sidebarEvent={() => addPolygon("hexagon")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 14 C6 4, 10 20, 14 14 S22 4, 22 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                            labelText="Dodaj falę (Bézier)"
                            sidebarEvent={() => addPath("wave")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 18 C8 4, 16 4, 22 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                            labelText="Dodaj łuk (Bézier)"
                            sidebarEvent={() => addPath("arc")}
                        />
                        <SidebarControls
                            icon={<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 16 C6 4, 10 20, 14 10 S20 6, 22 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                            labelText="Dodaj ozdobnik (Bézier)"
                            sidebarEvent={() => addPath("flourish")}
                        />
                    </>
                )}
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <div className={classes.toolsList}>
                {!isDemoContent ? (
                    <SidebarControls icon={<FaRegFolderOpen />} labelText="Moje dokumenty" sidebarEvent={showModalWithPDFs} documents={PDFs.length} />
                ) : null}
            </div>
        </div>

        <footer className={classes.sidebarFooter}>
            {!isDemoContent && entitlements?.plan_name ? (
                <div className={classes.planBadgeWrap}>
                <button
                    type="button"
                    className={classes.planBadge}
                    onClick={() => showPlanModal?.()}
                    title={[
                        "Zmień plan",
                        entitlements.plan_name,
                        entitlements.remaining?.exports != null
                            ? `Eksporty: ${entitlements.usage?.exports_count ?? 0}/${entitlements.limits?.max_exports_per_month ?? "∞"}`
                            : null,
                        entitlements.limits?.monthly_ai_credits != null
                            ? `Kredyty AI: ${entitlements.usage?.ai_credits_used ?? 0}/${entitlements.limits.monthly_ai_credits}`
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
                    title={`Kredyty AI: wykorzystano ${entitlements.usage?.ai_credits_used ?? 0} z ${entitlements.limits.monthly_ai_credits}`}
                >
                    <span className={classes.creditsBadgeValue}>
                        {entitlements.remaining?.ai_credits ?? Math.max(0, entitlements.limits.monthly_ai_credits - (entitlements.usage?.ai_credits_used ?? 0))}
                    </span>
                    <span className={classes.creditsBadgeLabel}>AI</span>
                </div>
            ) : null}
            {isGuest || isDemoContent ? null : (
                <button className={classes.logout} onClick={logout} aria-label="Wyloguj się" title="Wyloguj się">
                    <AiOutlineLogout />
                </button>
            )}
        </footer>

        {children}

    </aside>
}
