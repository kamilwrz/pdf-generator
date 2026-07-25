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
                <img src="/kompoza-logo.png" alt="" />
            </div>
            <div className={classes.logoWrapperText}>
                <h1>Kompoza</h1>
                <p>Studio dokumentów</p>
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <label className={classes.toolsLabel}>Dodaj do płótna</label>
            <div className={classes.toolsList}>
                <SidebarControls icon={<LuImagePlus />} labelText="Galeria" sidebarEvent={showGallery} />
                <SidebarControls icon={<CiText />} labelText="Dodaj tekst" sidebarEvent={addText} />
                <SidebarControls icon={<BsTextParagraph />} labelText="Dodaj pole tekstowe" sidebarEvent={addTextarea} />
                <SidebarControls icon={<TfiLayoutLineSolid />} labelText="Dodaj linię" sidebarEvent={addLine} />
                <SidebarControls icon={<BiRectangle />} labelText="Dodaj prostokąt" sidebarEvent={addRectangle} />
                <SidebarControls icon={<TbTopologyStar3 />} labelText="Dodaj łącznik" sidebarEvent={addConnector} />
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <label className={classes.toolsLabel}>Pliki</label>
            <div className={classes.toolsList}>
                <SidebarControls icon={<FaRegImages />} labelText="Prześlij obrazy" sidebarEvent={showDropzone} />
                <SidebarControls icon={<FaRegFolderOpen />} labelText="Moje dokumenty" sidebarEvent={showModalWithPDFs} documents={PDFs.length} />
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
