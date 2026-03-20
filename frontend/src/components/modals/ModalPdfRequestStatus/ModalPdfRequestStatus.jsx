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
        const response = await api.httpRequest(ENDPOINTS.PDF.DOWNLOAD, "POST", id, "Error");
    
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

    return createPortal(<AnimatePresence>{open && <motion.div 
        initial={{ opacity: 0, y: -30, x: 500 }}
        animate={{ opacity: 1, y: 60, x: 500 }}
        exit={{ opacity: 0, y: -30 }}
        transition={{ type: "spring", duration: 2, ease: [0, 0.71, 0.2, 1.01] }}
        className={classes.modalPdfRequestStatus}
        >

        {/**SHOW ERROR MESSAGE */}
        {message?.message && <p>{message?.message}</p>}
        {/**SHOW SUCCESS MESSAGE / PDF CREATED / PDF UPDATE */}
        {message?.success && <><p>{message?.success}</p> <button className={classes.btnDownloadPDF}><a href={PDFdownloadData.blob} download={PDFdownloadData.title}><span>Download</span><FiDownload /></a></button> </>}

        <CloseButton top={-10} left={-10} height="1.5rem" width="1.5rem" clickHandler={showModalRequest}/>

    </motion.div>}</AnimatePresence>, document.getElementById("modal-request-status"))

};


export default ModalPdfRequestStatus;