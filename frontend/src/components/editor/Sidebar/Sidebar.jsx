import classes from "./Sidebar.module.css";
import SidebarControls from "../../common/SidebarControls/SidebarControls";
import { FaRegImages } from "react-icons/fa";
import { TfiLayoutLineSolid } from "react-icons/tfi";
import { CiText } from "react-icons/ci";
import { TiPen } from "react-icons/ti";
import { LuImagePlus } from "react-icons/lu";
import { AiOutlineLogout } from "react-icons/ai";
import { RiDownload2Line } from "react-icons/ri";
import { FaRegFolderOpen } from "react-icons/fa";
import { MdPublishedWithChanges } from "react-icons/md";
import logo from "/images/logo.png";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { forwardRef, use } from "react";
import { download } from "../../../utils/download";
import { ENDPOINTS } from "../../../services/api";


export default forwardRef(function Sidebar({ children }, ref) {

    const {
        addText,
        addLine,
        showDropzone,
        createPdf,
        showGallery,
        updatePdf,
        setIsModalPdfs,
        clearA4,
        logout,
        isPdfLoading,
        PDFs,
    } = use(PdfContext);

    const pdfCreated = PDFs.find(element => element.title === ref.current?.value + ".pdf");
    const pathToCreatedPdf = pdfCreated?.file_path;
    let disabled;
    if(pathToCreatedPdf){
        disabled=false
    } else{
        disabled=true 
    }

    


    function showModalWithPDFs() {
        setIsModalPdfs(bool => !bool);
    }

    return <aside className={classes.sidebar}>

        <div className={classes.logoContainer}>
            <img src={logo} alt="Logo PDF Canvas" className={classes.logo} />
            <div className={classes.logoWrapperText}>
                <h1>PDF Canvas</h1>
                <p>Editor v.1.0b</p>
            </div>
        </div>

        <div className={classes.titleContainer}>
            <label htmlFor="title">current project</label>
            <div>
                <input type="text" name="title" id="title" ref={ref} />
                <button><TiPen /></button>
            </div>
        </div>

        <div className={classes.toolsContainer}>
            <label className={classes.toolsLabel}> TOOLS</label>
            <SidebarControls icon={<FaRegImages style={{ color: "rgb(2 132 199)" }} />} labelText="upload images" sidebarEvent={showDropzone} backgroundColor="rgb(125 211 252)" />
            <SidebarControls icon={<LuImagePlus style={{ color: "rgb(147 51 234)" }} />} labelText="gallery" sidebarEvent={showGallery} />
            <SidebarControls icon={<CiText style={{ color: "rgb(22 163 74)" }} />} labelText="add text" sidebarEvent={addText} />
            <SidebarControls icon={<TfiLayoutLineSolid style={{ color: "rgb(217 119 6)" }} />} labelText="add line" sidebarEvent={addLine} />

        </div>
      
        <div className={classes.myDocumentsContainer}>
            <SidebarControls icon={<FaRegFolderOpen style={{ color: "rgb(64 64 64)" }} />} labelText="My Documents " sidebarEvent={showModalWithPDFs} documents={PDFs.length} />
        </div>

        <footer className={classes.sidebarFooter}>
            <button onClick={createPdf} disabled={isPdfLoading}> <MdPublishedWithChanges style={{marginRight:"20px", paddingTop: "5px"}} />Create PDF</button>
            <div>
                <button className={classes.btn} onClick={updatePdf} disabled={isPdfLoading}>UPDATE</button>
                <button className={classes.btn} onClick={clearA4}>CLEAR</button>
                <button className={classes.btn} disabled={disabled}><a onClick={download(ENDPOINTS.PDF.DOWNLOAD, 74)}><RiDownload2Line/></a></button>
            </div>
            <div className={classes.logoutWrapper}>
                <button className={classes.logout} onClick={logout}>
                    <AiOutlineLogout />
                </button>
                <label>Logout</label>

            </div>
        </footer>

        {children}

    </aside>
})