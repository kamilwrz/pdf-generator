import classes from "./Sidebar.module.css";
import SidebarControls from "../../common/SidebarControls/SidebarControls";
import { FaRegImages } from "react-icons/fa";
import { TfiLayoutLineSolid } from "react-icons/tfi";
import { BiRectangle } from "react-icons/bi";
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
        addConnector,
        addTextarea,
        showDropzone,
        showGallery,
        setIsModalPdfs,
        logout,
        PDFs,
    } = use(PdfContext);

    function showModalWithPDFs() {
        setIsModalPdfs(bool => !bool);
    }

    return <aside className={classes.sidebar}>

        <div className={classes.logoContainer}>
            <div className={classes.logoMark}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
            </div>
            <div className={classes.logoWrapperText}>
                <h1>PDF Canvas</h1>
                <p>Edytor · v2.0</p>
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <label className={classes.toolsLabel}>Dodaj do płótna</label>
            <div className={classes.toolsList}>
                <SidebarControls icon={<LuImagePlus style={{ color: "#8A6FC4" }} />} iconBg="#EDE8F7" labelText="Galeria" sidebarEvent={showGallery} />
                <SidebarControls icon={<CiText style={{ color: "#5FA777" }} />} iconBg="#E6F1E7" labelText="Dodaj tekst" sidebarEvent={addText} />
                <SidebarControls icon={<BsTextParagraph style={{ color: "#5B8AA6" }} />} iconBg="#E3EEF4" labelText="Dodaj pole tekstowe" sidebarEvent={addTextarea} />
                <SidebarControls icon={<TfiLayoutLineSolid style={{ color: "#5B7CB8" }} />} iconBg="#E6EDF8" labelText="Dodaj linię" sidebarEvent={addLine} />
                <SidebarControls icon={<BiRectangle style={{ color: "#3E6DB5" }} />} iconBg="#E7F0FB" labelText="Dodaj prostokąt" sidebarEvent={addRectangle} />
                <SidebarControls icon={<TbTopologyStar3 style={{ color: "#2C8C9E" }} />} iconBg="#DFF0F3" labelText="Dodaj łącznik" sidebarEvent={addConnector} />
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <label className={classes.toolsLabel}>Pliki</label>
            <div className={classes.toolsList}>
                <SidebarControls icon={<FaRegImages style={{ color: "#2C8C9E" }} />} iconBg="#DFF0F3" labelText="Prześlij obrazy" sidebarEvent={showDropzone} />
                <SidebarControls icon={<FaRegFolderOpen style={{ color: "#57616F" }} />} iconBg="#fff" labelText="Moje dokumenty" sidebarEvent={showModalWithPDFs} documents={PDFs.length} />
            </div>
        </div>

        <footer className={classes.sidebarFooter}>
            <div className={classes.profileRow}>
                <span className={classes.avatar} />
                <div className={classes.profileMeta}>
                    <div className={classes.profileName}>Twoje konto</div>
                    <div className={classes.profilePlan}>Plan darmowy</div>
                </div>
                <button className={classes.logout} onClick={logout} aria-label="Wyloguj się">
                    <AiOutlineLogout />
                </button>
            </div>
        </footer>

        {children}

    </aside>
}
