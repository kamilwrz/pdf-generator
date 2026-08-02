/**
 * Left tool rail: add primitives, open docs/gallery/upload, logout.
 * Children slot hosts docked panels (upload/gallery) when open.
 */
import classes from "./Sidebar.module.css";
import SidebarControls from "../../common/SidebarControls/SidebarControls";
import { FaRegImages } from "react-icons/fa";
import { TfiLayoutLineSolid } from "react-icons/tfi";
import { BiCircle, BiRectangle } from "react-icons/bi";
import { CiText } from "react-icons/ci";
import { BsTextParagraph } from "react-icons/bs";
import { LuImagePlus } from "react-icons/lu";
import { AiOutlineLogout } from "react-icons/ai";
import { FaRegFolderOpen } from "react-icons/fa";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";


export default function Sidebar({ children }) {

    const {
        addText,
        addLine,
        addRectangle,
        addCircle,
        addEllipse,
        addTextarea,
        showDropzone,
        showGallery,
        setIsModalPdfs,
        logout,
        PDFs,
        entitlements,
        showPlanModal,
    } = use(PdfContext);

    function showModalWithPDFs() {
        setIsModalPdfs(bool => !bool);
    }

    return <aside className={classes.sidebar}>

        <div className={classes.logoContainer}>
            <div className={classes.logoMark}>
                <img src="/cv-studio-mark.svg" alt="CV Studio" />
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <div className={classes.toolsList}>
                <SidebarControls icon={<LuImagePlus />} labelText="Galeria" sidebarEvent={showGallery} />
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
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <div className={classes.toolsList}>
                <SidebarControls icon={<FaRegImages />} labelText="Prześlij obrazy" sidebarEvent={showDropzone} />
                <SidebarControls icon={<FaRegFolderOpen />} labelText="Moje dokumenty" sidebarEvent={showModalWithPDFs} documents={PDFs.length} />
            </div>
        </div>

        <footer className={classes.sidebarFooter}>
            {entitlements?.plan_name ? (
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
            {entitlements?.limits?.monthly_ai_credits ? (
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
            <button className={classes.logout} onClick={logout} aria-label="Wyloguj się" title="Wyloguj się">
                <AiOutlineLogout />
            </button>
        </footer>

        {children}

    </aside>
}
