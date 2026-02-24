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
import { forwardRef, use, useState } from "react";


export default forwardRef(function Sidebar({ children }, ref) {

    const {
        addText,
        addLine,
        showDropzone,
        createPdf,
        showGallery,
        updatePdf,
        setIsVisibleModal,
        clearA4,
        logout,
        isPdfLoading,
        PDFs,
    } = use(PdfContext);


    function showModalWithPDFs() {
        setIsVisibleModal(bool => !bool);
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
        <hr />
        <div className={classes.myDocumentsContainer}>
            <SidebarControls icon={<FaRegFolderOpen style={{ color: "rgb(64 64 64)" }} />} labelText="My Documents " sidebarEvent={showModalWithPDFs} documents={PDFs.length} />
        </div>


        <hr />
        <footer className={classes.sidebarFooter}>
            <button onClick={createPdf} disabled={isPdfLoading}> <MdPublishedWithChanges style={{marginRight:"20px"}} />Create PDF</button>
            <div>
                <button onClick={updatePdf} disabled={isPdfLoading}>UPDATE</button>
                <button onClick={clearA4}>CLEAR</button>
                <button><RiDownload2Line /></button>
            </div>
            <div className={classes.logoutWrapper}>
                <button id="logout" onClick={logout}>
                    <AiOutlineLogout />
                </button>
                <label>Logout</label>

            </div>
        </footer>

        {children}

    </aside>
})