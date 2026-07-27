import classes from "./Sidebar.module.css";
import SidebarControls from "../../common/SidebarControls/SidebarControls";
import { FaRegImages } from "react-icons/fa";
import { TfiLayoutLineSolid } from "react-icons/tfi";
import { BiCircle, BiRectangle } from "react-icons/bi";
import { TbTopologyStar3 } from "react-icons/tb";
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
        addConnector,
        addTextarea,
        showDropzone,
        showGallery,
        setIsModalPdfs,
        logout,
        PDFs,
        entitlements,
    } = use(PdfContext);

    function showModalWithPDFs() {
        setIsModalPdfs(bool => !bool);
    }

    return <aside className={classes.sidebar}>

        <div className={classes.logoContainer}>
            <div className={classes.logoMark}>
                <img src="/kompoza-logo.png" alt="" />
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
                <SidebarControls icon={<TbTopologyStar3 />} labelText="Dodaj łącznik" sidebarEvent={addConnector} />
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
                <div
                    className={classes.planBadge}
                    title={
                        entitlements.remaining?.exports != null
                            ? `Eksporty: ${entitlements.usage?.exports_count ?? 0}/${entitlements.limits?.max_exports_per_month ?? "∞"}`
                            : entitlements.plan_name
                    }
                >
                    {entitlements.plan_name}
                </div>
            ) : null}
            <button className={classes.logout} onClick={logout} aria-label="Wyloguj się" title="Wyloguj się">
                <AiOutlineLogout />
            </button>
        </footer>

        {children}

    </aside>
}
