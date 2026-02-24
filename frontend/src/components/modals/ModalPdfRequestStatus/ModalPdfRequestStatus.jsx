import { useRef, useEffect, use, useState } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import classes from "./ModalPdfRequestStatus.module.css";
import { createPortal } from "react-dom";
import { IoMdClose } from "react-icons/io";
import { FiDownload } from "react-icons/fi";
import { MdDone } from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";



function ModalPdfRequestStatus({ message, open }) {

    const { showModalRequest } = use(PdfContext)

    console.log(message)

    return createPortal(<AnimatePresence>{open && <motion.div 
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 30 }}
        exit={{ opacity: 0, y: -30 }}
        transition={{ type: "spring", duration: 2, ease: [0, 0.71, 0.2, 1.01] }}
        className={classes.modalPdfRequestStatus}
        >

        {/**SHOW ERROR MESSAGE */}
        {message?.message && <p>{message?.message}</p>}
        {/**SHOW SUCCESS MESSAGE / PDF CREATED */}
        {message?.success && message?.link && <><p>{message?.success}</p> <button className={classes.btnDownloadPDF}><a href={message?.link}><FiDownload /></a></button> </>}
        {/**SHOW SUCCESS MESSAGE / PDF UPDATE */}
        {message?.success && !message?.link && <p>{message?.success}</p>}

        <button onClick={showModalRequest}><IoMdClose /></button>

    </motion.div>}</AnimatePresence>, document.getElementById("modal-request-status"))

};


export default ModalPdfRequestStatus;