import { useRef, useEffect, use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import classes from "./ModalPdfRequestStatus.module.css";
import { createPortal } from "react-dom";
import CloseButton from "../../common/CloseButton/CloseButton";
import { FiDownload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { ENDPOINTS } from "../../../services/api";
import { ApiClient } from "../../../services/api";



function ModalPdfRequestStatus({ message, open }) {

    const timeout = useRef();

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    async function downloadPdf(id){
        const response = await api.httpRequest(ENDPOINTS.PDF.DOWNLOAD, "POST", id, "Błąd pobierania");
    
        const blob = (await fetch(response.url)).blob()
        const urlBlob = URL.createObjectURL(await blob);
    
        setPDFdownloadData({blob: urlBlob, title: response.title})
    
         timeout.current = setTimeout(() => {
            URL.revokeObjectURL(urlBlob);
            showModalRequest();
        },6000)
      }

    clearTimeout(timeout.current);

    useEffect(() => {
        downloadPdf(message?.pdf_id);
    }, [open])

    const { showModalRequest, setPDFdownloadData, PDFdownloadData} = use(PdfContext)

    const isError = !!message?.message;

    return createPortal(<AnimatePresence>{open && <motion.div
        className={classes.toast}
        data-state={isError ? "error" : "success"}
        initial={{ opacity: 0, x: 52, scale: .96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 52, scale: .96 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
        <span className={classes.accent} aria-hidden="true" />

        <div className={classes.icon} aria-hidden="true">
            {isError
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
        </div>

        <div className={classes.body}>
            <div className={classes.title}>{isError ? "Coś poszło nie tak" : "Twój PDF jest gotowy"}</div>
            <div className={classes.msg}>{message?.message || message?.success}</div>
            {message?.success && (
                <a className={classes.download} href={PDFdownloadData.blob} download={PDFdownloadData.title}>
                    <FiDownload /> Pobierz PDF
                </a>
            )}
        </div>

        <CloseButton top={10} right={10} height="1.6rem" width="1.6rem" clickHandler={showModalRequest} />

    </motion.div>}</AnimatePresence>, document.getElementById("modal-request-status"))

};


export default ModalPdfRequestStatus;