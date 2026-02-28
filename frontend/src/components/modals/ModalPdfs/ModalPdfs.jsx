import classes from "./ModalPdfs.module.css";

import { createPortal } from "react-dom";

import { useEffect, useState, use } from "react";
import { BsFileEarmarkPdf } from "react-icons/bs";
import { IoMdDownload } from "react-icons/io";
import { MdDelete } from "react-icons/md";
import { CiClock1 } from "react-icons/ci";
import { GrView } from "react-icons/gr";
import { RiCloseLargeFill } from "react-icons/ri";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { motion, AnimatePresence } from "framer-motion";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

import Error from "../../common/Error/Error";
import CloseButton from "../../common/CloseButton/CloseButton";
import { data } from "react-router-dom";


//MODAL FOR SHWOING SAVED PDF'S

export default function ModalPdfs({ title }) {


    const [error, setError] = useState(false);

    const {
        isModalPdfs,
        setIsModalPdfs,
        setA4_Elements,
        handlePdfId,
        clearA4,
        setA4_Elements_deleted,
        setPDFs,
        PDFs,
        setPDFdownloadData,
        PDFdownloadData
    } = use(PdfContext);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    function handleIsVisible() {
        setIsModalPdfs(bool => !bool);
        setError(false);
    }

    async function showPDF(id) {
        handlePdfId(id);

        const pdfCanvas = PDFs.find(element => element.id === id);
        title.current.value = pdfCanvas?.title.split(".pdf")[0];

        api.httpRequest(ENDPOINTS.PDF.SHOW, "POST", JSON.stringify(id), "Failed to show choosen PDF!").
            then((data) => {
                const elementsData = data.map((element) => {
                    if (element.category !== "text") {
                        return { ...element, "zIndex": element.extra_properties.zIndex, width: parseFloat(element.width), height: parseFloat(element.height) }
                    } else {
                        return { ...element, "zIndex": element.extra_properties.zIndex }
                    }

                });
                setA4_Elements(elementsData.filter(element => element.category !== "title"));
                setIsModalPdfs(false);
            }).catch((error) => {
                setError(error);
            }).finally(() => {
                setA4_Elements_deleted([]);
            })
    }

    async function deltePDF(id) {
        //BUG CLEARS ELEMENT's NOT INCLUDED IN THE PDF, WRITE SEPERATE FUNCTION WITH PDF_ID AS PROPS/ PARAM
        clearA4();

        api.httpRequest(ENDPOINTS.PDF.DELETE, "DELETE", JSON.stringify(id), "Failed to delete the PDF!").
            then((data) => {
                console.log(data);
                setPDFs(prevState => {
                    return prevState.filter(element => element.id !== data.pdf_id);
                })
            }).catch((error) => { setError(error) })
    }

    useEffect(() => {
        api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Failed to fetch PDF's").
            then((data) => {
                setPDFs(data);
                }).
            catch((error) => { setError(error) })


    }, [isModalPdfs])


  async function downloadPdf(id){
    const response = await api.httpRequest(ENDPOINTS.PDF.DOWNLOAD, "POST", id, "Error");
    const blob = (await fetch(response.file_path)).blob()
    const urlBlob = URL.createObjectURL(await blob);
    const fileName = await response.title;

    setPDFdownloadData({blob: urlBlob, title: fileName})

    setTimeout(() => {
        URL.revokeObjectURL(urlBlob);
    },3000)
    
  }


   console.log(PDFdownloadData)
   

    return createPortal(
        <AnimatePresence>
            {isModalPdfs && <motion.ul initial={{ opacity: 0, y: -30, x: 400 }}
                animate={{ opacity: 1, y: 30 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ type: "spring", duration: 2, ease: [0, 0.71, 0.2, 1.01] }} className={classes.modalPdfs} >
                <div className={classes.modalHeader}>
                    <div>
                        <h2>Your PDF's</h2>
                        <p>Manage, download or delete your saved PDF projects.</p>
                    </div>
                    <CloseButton clickHandler={handleIsVisible} top={20} right={20} />
                </div>
                <div className={classes.modalBody}>

                    {!error ? PDFs.map((PDF, id) => {
                       
                        const date = PDF.created_at.split(".")[0].split("T").join(" : ");
                        const downloadUrl = PDF.file_path.startsWith("http")
                            ? PDF.file_path
                            : `${API_BASE_URL}/${PDF.file_path}`;
                        return <li className={classes.pdfItem} key={PDF.id}>

                            <div className={classes.wrapperIconTitleDate}>
                                <div className={classes.wrapperPDFIcon}><BsFileEarmarkPdf className={classes.pdfIcon} /></div>
                                <div className={classes.wrapperTitelDate}>
                                    <h2 className={classes.title}>{PDF.title.split(".")[0]}</h2>
                                    <div className={classes.date}><CiClock1 /><label>{date}</label></div>
                                </div>
                            </div>

                            <div className={classes.modalControls}>
                                <button className={classes.downloadPdfBtn} onMouseEnter={() => downloadPdf(PDF.id)}><a href={PDFdownloadData.blob} download={PDFdownloadData.title}>
                                Download <IoMdDownload /></a></button>
                                <button className={classes.deletePdfBtn} onClick={() => deltePDF(PDF.id)}><MdDelete /></button>
                                <button className={classes.showPdfBtn} onClick={() => showPDF(PDF.id)}><GrView /></button>
                            </div>

                        </li>;
                    }) : <Error title="No PDF's uploaded!" message={error?.message || error} />}
                </div>
                <div className={classes.modalFooter}></div>
            </motion.ul>}
        </AnimatePresence>
        , document.getElementById("modal-pdfs"));
}