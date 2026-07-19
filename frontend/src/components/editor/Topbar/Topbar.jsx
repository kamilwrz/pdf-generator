import classes from "./Topbar.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { LuLayoutTemplate } from "react-icons/lu";
import { RiRobot2Line, RiDownload2Line } from "react-icons/ri";
import { FiRefreshCw, FiTrash2 } from "react-icons/fi";

export default function Topbar() {
    const {
        showTemplates,
        showAiPanel,
        createPdf,
        updatePdf,
        clearA4,
        isPdfLoading,
    } = use(PdfContext);

    return (
        <header className={classes.topbar}>
            <div className={classes.group}>
                <button type="button" className={classes.feature} onClick={showTemplates}>
                    <LuLayoutTemplate />
                    <span className={classes.label}>CV Templates</span>
                </button>
                <button type="button" className={classes.feature} onClick={showAiPanel}>
                    <RiRobot2Line />
                    <span className={classes.label}>Fill from my CV</span>
                </button>
            </div>

            <div className={classes.group}>
                <button type="button" className={classes.ghost} onClick={clearA4}>
                    <FiTrash2 />
                    <span className={classes.label}>Clear</span>
                </button>
                <button type="button" className={classes.secondary} onClick={updatePdf} disabled={isPdfLoading}>
                    <FiRefreshCw />
                    <span className={classes.label}>Update</span>
                </button>
                <button type="button" className={classes.primary} onClick={createPdf} disabled={isPdfLoading}>
                    <RiDownload2Line />
                    <span className={classes.label}>Create PDF</span>
                </button>
            </div>
        </header>
    );
}
