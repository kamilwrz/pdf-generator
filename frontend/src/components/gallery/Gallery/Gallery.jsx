import classes from "./Gallery.module.css";

import { useState, useEffect } from "react";

import GalleryItem from "../GalleryItem/GalleryItem";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";


export default function Gallery() {

    const {isGallery, isDropzone} = use(PdfContext)

    const [shouldRender, setShouldRender] = useState(false);
    const [images, setImages] = useState([]);
    const [error, setError] = useState()


    function handleImageUsedInPDF(message){
        console.log(message);
        if(message.message){
            setError(message);
        }else{
            setImages(prevState => prevState.filter(img => img.id !== message.deleted_image))
        }
    }

    useEffect(() => {
        if (isGallery) {
            setShouldRender(true);

            const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})

            api.httpRequest(ENDPOINTS.IMG.FETCH, "GET", null, "Fetching images failed!").
            then((images) => {setImages(images); setError(null); console.log(images)}).
            catch((error) => setError(error));

        }
        
    }, [isGallery, isDropzone, images.length])


    if (!shouldRender) {
        return null
    }
    else {
        const IMAGES = images.map((image) => {
            return <GalleryItem url={`${API_BASE_URL}/${image.file_path}`} img_id={image.id} imageUsed={handleImageUsedInPDF}/>;
         })

        return <aside className={`${classes.gallery} ${isGallery ? classes.galleryShow : classes.galleryHide}`}>
            {!error && IMAGES}
            {error ? <p className={classes.error}>{error.message}</p> : undefined}
        </aside>
    }
}

    