import classes from "./Sidebar.module.css";
import SidebarControls from "../../common/SidebarControls/SidebarControls";
import { FaRegImages } from "react-icons/fa";
import { TfiLayoutLineSolid } from "react-icons/tfi";
import { CiText } from "react-icons/ci";
import { LuImagePlus } from "react-icons/lu";
import { AiOutlineLogout } from "react-icons/ai";
import { BsFileEarmarkPdf } from "react-icons/bs";
import logo from "../../../../public/images/logo.png";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";


export default function Sidebar({ children }) {

    const {
        addText,
        addLine,
        showDropzone,
        createPdf,
        showGallery,
        updatePdf,
        setIsVisibleModal,
        handleSetTitle,
        title,
        clearA4,
        logout,
        isPdfLoading
    } = use(PdfContext)

    function setPdfTitle(e) {
        handleSetTitle(e.target.value);
    }

    function showModalWithPDSs() {
        setIsVisibleModal(bool => !bool);
    }


    return <aside className={classes.sidebar}>
        <div className={classes.logoWrapper}>
            <img src={logo} alt="Logo PDF Canvas" />
            <h1><span>pdf</span> canvas</h1>
        </div>

        <div className={classes.controlTitle}>
            <label htmlFor="title">pdf title:</label>
            <input type="text" name="title" id="title" value={title} onChange={setPdfTitle}/>
        </div>

        <SidebarControls icon={<FaRegImages/>} labelText="upload images" sidebarEvent={showDropzone}/>
        <SidebarControls icon={<LuImagePlus/>} labelText="gallery" sidebarEvent={showGallery}/>
        <SidebarControls icon={<CiText/>} labelText="add text" sidebarEvent={addText}/>
        <SidebarControls icon={<TfiLayoutLineSolid/>} labelText="add line" sidebarEvent={addLine}/>
        <SidebarControls icon={<BsFileEarmarkPdf/>} labelText="show pdf's" sidebarEvent={showModalWithPDSs}/>
        
        <section className={classes.pdfButtons}>
            <div><BsFileEarmarkPdf/></div>
            <div>
                <button onClick={createPdf} disabled={isPdfLoading}>CREATE</button>
                <button onClick={updatePdf} disabled={isPdfLoading}>UPDATE</button>
                <button onClick={clearA4}>CLEAR</button>
            </div>
        </section>

        <button className={classes.logout} onClick={logout}>
            <AiOutlineLogout />
        </button>

        {children}
    </aside>
}