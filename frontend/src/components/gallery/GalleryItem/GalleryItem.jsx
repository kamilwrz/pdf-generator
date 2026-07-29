/**
 * One gallery thumbnail: insert onto canvas or delete (when not in use).
 */
import classes from "./GalleryItem.module.css";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { AiFillDelete } from "react-icons/ai";
import { use } from "react";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import API_BASE_URL from "../../../services/api";

export default function GalleryItem({url, img_id, imageUsed}){

    const {addImage}= use(PdfContext);

    function handleDeleteImage(){
        const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})
        api.httpRequest(ENDPOINTS.IMG.DELETE, "DELETE", JSON.stringify(img_id), "Nie udało się usunąć obrazu").
        then((data) =>{imageUsed(data)}).catch((error) => console.log(error));
    }

    return <div className={classes.imageWrapper}>
        <img src={url} id={img_id} className={classes.image} onClick={addImage}/>
        <button onClick={handleDeleteImage}><AiFillDelete /></button>
    </div>
}