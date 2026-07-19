import classes from "./Topbar.module.css";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { LuLayoutTemplate } from "react-icons/lu";
import { RiRobot2Line, RiDownload2Line } from "react-icons/ri";
import { FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { TiPen } from "react-icons/ti";

export default function Topbar({ titleRef }) {
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

            <div className={classes.center}>
                <div className={classes.projectField}>
                    <span className={classes.projectIcon} aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                    </span>
                    <input
                        type="text"
                        name="title"
                        id="title"
                        ref={titleRef}
                        placeholder="Untitled project"
                        aria-label="Current project name"
                    />
                    <button
                        type="button"
                        className={classes.rename}
                        aria-label="Rename project"
                        onClick={() => titleRef?.current?.focus()}
                    >
                        <TiPen />
                    </button>
                </div>
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
