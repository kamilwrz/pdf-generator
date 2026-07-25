import classes from "./ModalPdfs.module.css";

import { createPortal } from "react-dom";

import { useEffect, useState, use, useRef } from "react";
import { BsFileEarmarkPdf } from "react-icons/bs";
import { IoMdDownload } from "react-icons/io";
import { MdDelete } from "react-icons/md";
import { CiClock1 } from "react-icons/ci";
import { GrView } from "react-icons/gr";
import { RiCloseLargeFill } from "react-icons/ri";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { presetFromDims } from "../../../hooks/useA4Elements";
import { motion, AnimatePresence } from "framer-motion";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

import Error from "../../common/Error/Error";
import CloseButton from "../../common/CloseButton/CloseButton";
import { data } from "react-router-dom";


//MODAL FOR SHWOING SAVED PDF'S

export default function ModalPdfs({ title }) {

    const timeout = useRef();

    const [error, setError] = useState(false);
    const [isOpening, setIsOpening] = useState(false);

    const {
        isModalPdfs,
        setIsModalPdfs,
        setA4_Elements,
        handlePdfId,
        activePdfId,
        flushAutosave,
        discardActiveDocument,
        setA4_Elements_deleted,
        setPDFs,
        PDFs,
        setPDFdownloadData,
        PDFdownloadData,
        setPageCount,
        setCurrentPage,
        setPageSize,
        resetHistory
    } = use(PdfContext);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    function handleIsVisible() {
        setIsModalPdfs(bool => !bool);
        setError(false);
    }

    async function showPDF(id) {
        if (isOpening) return;
        setIsOpening(true);
        try {
            // Persist the document currently open before replacing its canvas.
            // Crucially, the new id is assigned only after its elements arrive.
            await flushAutosave();
            const data = await api.httpRequest(
                ENDPOINTS.PDF.SHOW,
                "POST",
                JSON.stringify(id),
                "Nie udało się wczytać wybranego PDF!",
            );
            const pdfCanvas = PDFs.find(element => element.id === id);
            const elementsData = data.map((element) => {
                if (element.category === "textarea") {
                    return {
                        ...element,
                        zIndex: element.extra_properties.zIndex,
                        lineHeight: element.extra_properties.lineHeight,
                        letterSpacing: element.extra_properties.letterSpacing,
                        bold: element.extra_properties.bold,
                        italic: element.extra_properties.italic,
                        underline: element.extra_properties.underline,
                        align: element.extra_properties.align,
                        bulletList: element.extra_properties.bulletList ?? false,
                        autoHeight: element.extra_properties.autoHeight ?? false,
                        fixedToPage: element.extra_properties.fixedToPage ?? false,
                        width: parseFloat(element.width),
                        height: parseFloat(element.height),
                        isEditing: false,
                    };
                }
                if (element.category !== "text") {
                    return {
                        ...element,
                        zIndex: element.extra_properties.zIndex,
                        borderWidth: element.extra_properties.borderWidth,
                        filled: element.extra_properties.filled ?? false,
                        source_id: element.extra_properties.source_id,
                        target_id: element.extra_properties.target_id,
                        arrow: element.extra_properties.arrow,
                        width: parseFloat(element.width),
                        height: parseFloat(element.height),
                    };
                }
                return {
                    ...element,
                    zIndex: element.extra_properties.zIndex,
                    bold: element.extra_properties.bold,
                    italic: element.extra_properties.italic,
                    underline: element.extra_properties.underline,
                };
            });

            // Restore the saved page count, geometry, title and content as one
            // state transition, then make this loaded PDF autosave-active.
            const pw = parseFloat(pdfCanvas?.page_width) || 595;
            const ph = parseFloat(pdfCanvas?.page_height) || 842;
            title.current.value = pdfCanvas?.title.split(".pdf")[0];
            resetHistory();
            setPageCount(pdfCanvas?.pages || 1);
            setCurrentPage(1);
            setPageSize({ preset: presetFromDims(pw, ph), width: pw, height: ph });
            setA4_Elements_deleted([]);
            setA4_Elements(elementsData.filter(element => element.category !== "title"));
            handlePdfId(id);
            setIsModalPdfs(false);
        } catch (error) {
            setError(error);
        } finally {
            setIsOpening(false);
        }
    }

    async function deltePDF(id) {
        try {
            const data = await api.httpRequest(
                ENDPOINTS.PDF.DELETE,
                "DELETE",
                JSON.stringify(id),
                "Nie udało się usunąć PDF!",
            );
            if (activePdfId === id) discardActiveDocument();
            setPDFs((prevState) => prevState.filter((element) => element.id !== data.pdf_id));
        } catch (error) {
            setError(error);
        }
    }

    useEffect(() => {
        api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Nie udało się pobrać listy PDF!").
            then((data) => {
                setPDFs(data);
                }).
            catch((error) => { setError(error) })


    }, [isModalPdfs, PDFdownloadData])


  async function downloadPdf(id){
    const response = await api.httpRequest(ENDPOINTS.PDF.DOWNLOAD, "POST", id, "Błąd pobierania");

    const blob = (await fetch(response.url)).blob()
    const urlBlob = URL.createObjectURL(await blob);

    setPDFdownloadData({blob: urlBlob, title: response.title})

    timeout.current = setTimeout(() => {
      //  URL.revokeObjectURL(urlBlob);
        
    },6000)  
  }

  clearTimeout(timeout.current);

   console.log(PDFdownloadData)
   

    return createPortal(
        <AnimatePresence>
            {isModalPdfs && <motion.ul initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: "spring", duration: 1, ease: [0, 0.71, 0.2, 1.01] }} className={classes.modalPdfs} >
                <div className={classes.modalHeader}>
                    <div>
                        <h2>Moje dokumenty</h2>
                        <p>Otwieraj, pobieraj i usuwaj zapisane projekty.</p>
                    </div>
                    <CloseButton clickHandler={handleIsVisible} top={10} right={12} />
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
                                Pobierz <IoMdDownload /></a></button>
                                <button className={classes.deletePdfBtn} onClick={() => deltePDF(PDF.id)}><MdDelete /></button>
                                <button className={classes.showPdfBtn} onClick={() => showPDF(PDF.id)} disabled={isOpening}><GrView /></button>
                            </div>

                        </li>;
                    }) : <Error title="Brak zapisanych PDF!" message={error?.message || error} />}
                </div>
                <div className={classes.modalFooter}></div>
            </motion.ul>}
        </AnimatePresence>
        , document.getElementById("modal-pdfs"));
}