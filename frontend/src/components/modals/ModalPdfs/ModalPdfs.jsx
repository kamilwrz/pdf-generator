import classes from "./ModalPdfs.module.css";

import { createPortal } from "react-dom";

import { useEffect, useState, use } from "react";
import { BsFileEarmarkPdf } from "react-icons/bs";
import { IoMdDownload } from "react-icons/io";
import { MdDelete } from "react-icons/md";
import { GrView } from "react-icons/gr";
import { RiCloseLargeFill } from "react-icons/ri";
import { PdfContext } from "../../../store/pdfgenerator-context";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

import Error from "../../common/Error/Error";

export default function ModalPdfs() {

    const [PDFs, setPDFs] = useState([]);
    const [error, setError] = useState(false);

    const { isVisibleModal, setIsVisibleModal, setA4_Elements, handlePdfId, handleSetTitle, clearA4modalDelete } = use(PdfContext);

    const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

    function handleIsVisible() {
        setIsVisibleModal(bool => !bool);
        setError(false);
    }

    async function showPDF(id) {
        handlePdfId(id);

        const pdfCanvas = PDFs.find(element => element.id === id);
        handleSetTitle(pdfCanvas?.title.split(".pdf")[0]);

        api.httpRequest(ENDPOINTS.PDF.SHOW, "POST", JSON.stringify(id), "Failed to show choosen PDF!").
            then((data) => {
                const elementsData = data.map((element) => {
                    return { ...element, "zIndex": element.extra_properties.zIndex }
                });
                setA4_Elements(elementsData.filter(element => element.category !== "title"));
                setIsVisibleModal(false);
            }).catch((error) => {
                setError(error);
            })
    }

    async function deltePDF(id) {
        clearA4modalDelete(id);
        handleSetTitle("");
        api.httpRequest(ENDPOINTS.PDF.DELETE, "DELETE", JSON.stringify(id), "Failed to delete the PDF!").
            then((data) => {
                console.log(data);
                setPDFs(prevState => {
                    return prevState.filter(element => element.id !== data.id);
                })
            }).catch((error) => { setError(error) })
    }

    const classNameOverlay = `${classes.overlayModal} ${isVisibleModal ? classes.modalVisible : classes.modalClose}`

    useEffect(() => {
        if (isVisibleModal) {
            api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Failed to fetch PDF's").
                then((data) => { setPDFs(data) }).
                catch((error) => { setError(error) });
        }
    }, [isVisibleModal])

    return createPortal(<div className={classNameOverlay}>

        <span onClick={handleIsVisible} className={classes.closeModal}><RiCloseLargeFill /></span>

        <ul className={classes.modalPdfs}>
            <h2>Your PDF's</h2>
            {!error ? PDFs.map((PDF) => {
                console.log(PDF.file_path);
                const date = PDF.created_at.split(".")[0].split("T").join(" : ");
                return <li className={classes.pdfItem} key={PDF.id}>
                    <BsFileEarmarkPdf className={classes.pdfIcon} />
                    <h2>{PDF.title.split(".")[0]}</h2>
                    <div className={classes.modalControls}>
                        <button><a href={`${API_BASE_URL}/${PDF.file_path}`}><IoMdDownload /></a></button>
                        <button onClick={() => deltePDF(PDF.id)}><MdDelete /></button>
                        <button onClick={() => showPDF(PDF.id)}><GrView /></button>
                    </div>
                    <p>{date}</p>
                </li>;
            }) : <Error title="An error occured!" message={error?.message || error} />}

        </ul>
    </div>
        , document.getElementById("modal-pdfs"));
}