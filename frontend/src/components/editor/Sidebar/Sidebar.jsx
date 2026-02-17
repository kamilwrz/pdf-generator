import classes from "./Sidebar.module.css";
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
        logout
     } = use(PdfContext)

    function setPdfTitle(e) {
        handleSetTitle(e.target.value);
    }

    function showModal() {
        setIsVisibleModal(bool => !bool);
    }


    return <aside className={classes.sidebar}>

        <div className={classes.logoWrapper}>
            <img src={logo} alt="Logo PDF GENERATOR" />
            <h1>pdf generator</h1>
        </div>

        <div className={classes.controlTitle}>
            <label htmlFor="title">Title</label>
            <input type="text" name="title" id="title" value={title} onChange={setPdfTitle} required/>
        </div>

        <div className={classes.control}>
            <label>upload images</label>
            <FaRegImages className={classes.icons} onClick={showDropzone} />
        </div>

        <div className={classes.control}>
            <label>gallery</label>
            <LuImagePlus className={classes.icons} onClick={showGallery} />
        </div>

        <div className={classes.control}>
            <label>add text</label>
            <CiText className={classes.icons} onClick={addText} />
        </div>

        <div className={classes.control}>
            <label>add line</label>
            <TfiLayoutLineSolid className={classes.icons} onClick={addLine} />
        </div>

        <div className={classes.control}>
            <label>show pdf's</label>
            <BsFileEarmarkPdf className={classes.icons} onClick={showModal} />
        </div>


        <div className={classes.menuLine}></div>

        <section className={classes.pdfButtons}>
            <div>
                <button onClick={createPdf}>CREATE</button>
                <button onClick={updatePdf}>UPDATE</button>
                <button onClick={clearA4}>CLEAR</button>
            </div>
        </section>

        <button className={classes.logout} onClick={logout}>
        <AiOutlineLogout />
        </button>

        {children}
    </aside>
}