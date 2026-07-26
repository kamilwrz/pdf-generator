import classes from "./Gallery.module.css";

import { useState, useEffect, use } from "react";

import GalleryItem from "../GalleryItem/GalleryItem";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

import { PdfContext } from "../../../store/pdfgenerator-context";
import PanelShell from "../../common/PanelShell/PanelShell";


export default function Gallery() {

    const { isGallery, showGallery, isDropzone } = use(PdfContext)

    const [images, setImages] = useState([]);
    const [error, setError] = useState()


    function handleImageUsedInPDF(message) {
        if (message?.deleted_image != null) {
            setImages(prevState => prevState.filter(img => img.id !== message.deleted_image));
            setError(null);
        } else if (message?.message) {
            setError(message);
        }
    }

    useEffect(() => {
        if (isGallery) {

            const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` })
            api.httpRequest(ENDPOINTS.IMG.FETCH, "GET", null, "Pobieranie obrazów nie powiodło się!").
                then((images) => {
                    setImages(images);
                    setError(null)
                }).
                catch((error) => setError(error));
        }

    }, [isGallery, isDropzone])

    const IMAGES = images.map((image) => {

        const imageUrl = image.file_path.startsWith("http")
            ? image.file_path
            : `${API_BASE_URL}/${image.file_path}`;

        return <GalleryItem url={imageUrl} key={image.id} img_id={image.id} imageUsed={handleImageUsedInPDF} />;
    })

    return (
        <PanelShell
            open={isGallery}
            onClose={showGallery}
            className={classes.gallery}
            motionProps={{
                initial: { opacity: 0, x: 24 },
                animate: { opacity: 1, x: 0 },
                exit: { opacity: 0, x: 24 },
                transition: { type: "spring", damping: 26, stiffness: 320 },
            }}
            title="Twoja galeria"
            subtitle="Kliknij obraz, aby umieścić go na płótnie"
        >
            {!error && <div className={classes.grid}>{IMAGES}</div>}
            {error ? <p className={classes.error}>{error.message}</p> : undefined}
        </PanelShell>
    );
}
