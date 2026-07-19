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
                <p>Editor · v2.0</p>
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <label className={classes.toolsLabel}>Add to canvas</label>
            <div className={classes.toolsList}>
                <SidebarControls icon={<FaRegImages style={{ color: "#2C8C9E" }} />} iconBg="#DFF0F3" labelText="Upload images" sidebarEvent={showDropzone} />
                <SidebarControls icon={<LuImagePlus style={{ color: "#8A6FC4" }} />} iconBg="#EDE8F7" labelText="Gallery" sidebarEvent={showGallery} />
                <SidebarControls icon={<CiText style={{ color: "#5FA777" }} />} iconBg="#E6F1E7" labelText="Add text" sidebarEvent={addText} />
                <SidebarControls icon={<BsTextParagraph style={{ color: "#5B8AA6" }} />} iconBg="#E3EEF4" labelText="Add text box" sidebarEvent={addTextarea} />
                <SidebarControls icon={<TfiLayoutLineSolid style={{ color: "#5B7CB8" }} />} iconBg="#E6EDF8" labelText="Add line" sidebarEvent={addLine} />
                <SidebarControls icon={<BiRectangle style={{ color: "#3E6DB5" }} />} iconBg="#E7F0FB" labelText="Add rectangle" sidebarEvent={addRectangle} />
                <SidebarControls icon={<TbTopologyStar3 style={{ color: "#2C8C9E" }} />} iconBg="#DFF0F3" labelText="Add connector" sidebarEvent={addConnector} />
            </div>
        </div>

        <div className={classes.myDocumentsContainer}>
            <SidebarControls icon={<FaRegFolderOpen style={{ color: "#57616F" }} />} iconBg="#fff" labelText="My documents" sidebarEvent={showModalWithPDFs} documents={PDFs.length} />
        </div>

        <footer className={classes.sidebarFooter}>
            <div className={classes.profileRow}>
                <span className={classes.avatar} />
                <div className={classes.profileMeta}>
                    <div className={classes.profileName}>Your account</div>
                    <div className={classes.profilePlan}>Free plan</div>
                </div>
                <button className={classes.logout} onClick={logout} aria-label="Log out">
                    <AiOutlineLogout />
                </button>
            </div>
        </footer>

        {children}

    </aside>
}
