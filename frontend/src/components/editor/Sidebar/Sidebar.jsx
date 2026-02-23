import classes from "./Sidebar.module.css";
import SidebarControls from "../../common/SidebarControls/SidebarControls";
import { FaRegImages } from "react-icons/fa";
import { TfiLayoutLineSolid } from "react-icons/tfi";
import { CiText } from "react-icons/ci";
import { LuImagePlus } from "react-icons/lu";
import { AiOutlineLogout } from "react-icons/ai";
import { BsFileEarmarkPdf } from "react-icons/bs";
import logo from "../../../../public/images/logo1-no_text.png";
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
        isPdfLoading
    } = use(PdfContext);


    function showModalWithPDFs() {
        setIsVisibleModal(bool => !bool);
    }


    return <aside className={classes.sidebar}>

        <img src={logo} alt="Logo PDF Canvas" className={classes.logo} />
        <div className={classes.headingWrapper}>
            <h1><span>pdf</span> canvas</h1>
        </div>

        <div className={classes.controlTitle}>
            <label htmlFor="title">pdf title:</label>
            <input type="text" name="title" id="title" ref={ref} placeholder="Please enter PDF title..." />
        </div>

        <SidebarControls icon={<FaRegImages />} labelText="upload images" sidebarEvent={showDropzone} />
        <SidebarControls icon={<LuImagePlus />} labelText="gallery" sidebarEvent={showGallery} />
        <SidebarControls icon={<CiText />} labelText="add text" sidebarEvent={addText} />
        <SidebarControls icon={<TfiLayoutLineSolid />} labelText="add line" sidebarEvent={addLine} />
        <SidebarControls icon={<BsFileEarmarkPdf />} labelText="show pdf's" sidebarEvent={showModalWithPDFs} />

        <section className={classes.pdfButtons}>
            <div className={classes.pdfButtonsIcon}><BsFileEarmarkPdf /></div>
            <div>
                <button onClick={createPdf} disabled={isPdfLoading}>CREATE</button>
                <button onClick={updatePdf} disabled={isPdfLoading}>UPDATE</button>
                <button onClick={clearA4}>CLEAR</button>
            </div>
        </section>

        <div className={classes.logoutWrapper}>
            <label>Logout</label>
            <button className={classes.logout} onClick={logout}>
                <AiOutlineLogout />
            </button>
        </div>


        {children}

    </aside>
})