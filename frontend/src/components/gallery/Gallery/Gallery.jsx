import classes from "./Gallery.module.css";
import { motion, AnimatePresence } from "framer-motion";

import { useState, useEffect } from "react";

import GalleryItem from "../GalleryItem/GalleryItem";
import CloseButton from "../../common/CloseButton/CloseButton";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";


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
            api.httpRequest(ENDPOINTS.IMG.FETCH, "GET", null, "Fetching images failed!").
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

    return <AnimatePresence>{isGallery && <motion.aside className={classes.gallery}
        initial={{ opacity: 0, x: 400 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 400 }}
        transition={{ type: "spring", duration: 2 }}>
        <div className={classes.galleryHeader}>
            <div className={classes.headerText}>
                <h2>Your gallery</h2>
                <p>Click an image to place it</p>
            </div>
            <CloseButton top={22} right={24} clickHandler={showGallery} />
        </div>

        {!error && <div className={classes.grid}>{IMAGES}</div>}
        {error ? <p className={classes.error}>{error.message}</p> : undefined}
    </motion.aside>}</AnimatePresence >
}


