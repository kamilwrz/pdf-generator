import { useRef, useEffect, use, useState } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import classes from "./ModalPdfRequestStatus.module.css";
import { createPortal } from "react-dom";
import { IoMdClose } from "react-icons/io";
import { FiDownload } from "react-icons/fi";
import { MdDone } from "react-icons/md";



function ModalPdfRequestStatus({ message, open }) {

    const { showModalRequest } = use(PdfContext)
    const [isLoading, setIsLoading] = useState(false);

    const dialogRequestStatus = useRef()

    useEffect(() => {
        if (open) {
            dialogRequestStatus.current.showModal();
        }else{
            setIsLoading(bool => !bool);
        }
    }, [open])

    console.log(message)
    return createPortal(<dialog ref={dialogRequestStatus} className={classes.modalPdfRequestStatus}>
        
        {/**SHOW ERROR MESSAGE */}
        {message?.message && <p>{message?.message}</p>}
        {/**SHOW SUCCESS MESSAGE / PDF CREATED */}
        {message?.success && message?.link  && <><p>{message?.success}</p> <button className={classes.btnDownloadPDF}><a href={message?.link}><FiDownload /></a></button> </>}
        {/**SHOW SUCCESS MESSAGE / PDF UPDATE */}
        {message?.success && !message?.link && <p>{message?.success}</p>}
        <form method="dialog">
            <button onClick={showModalRequest}><IoMdClose /></button>
        </form>
    </dialog>, document.getElementById("modal-request-status"))

};


export default ModalPdfRequestStatus;