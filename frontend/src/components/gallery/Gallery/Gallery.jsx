import classes from "./Gallery.module.css";
import { motion } from "framer-motion";

import { useState, useEffect } from "react";

import GalleryItem from "../GalleryItem/GalleryItem";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";


export default function Gallery() {

    const { isGallery, isDropzone } = use(PdfContext)

    const [images, setImages] = useState([]);
    const [error, setError] = useState()


    function handleImageUsedInPDF(message) {
        console.log(message);
        if (message.message) {
            setError(message);
        } else {
            setImages(prevState => prevState.filter(img => img.id !== message.deleted_image))
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
        return <GalleryItem url={`${API_BASE_URL}/${image.file_path}`} key={image.id} img_id={image.id} imageUsed={handleImageUsedInPDF} />;
    })

    return <motion.aside className={classes.gallery}
        initial={{ opacity: 0, x: 640}}
        animate={{ opacity: 1, x: 40 }}
        exit={{ opacity: 0, x: 640}}
        transition={{ type: "spring", duration: 4 }}>
        {!error && IMAGES}
        {error ? <p className={classes.error}>{error.message}</p> : undefined}
    </motion.aside>
}


