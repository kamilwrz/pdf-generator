/**
 * One gallery thumbnail: insert onto canvas or delete (when not in use).
 *
 * Inserts via `{ img_id, naturalWidth, naturalHeight }` so the canvas stores a
 * stable `/images/{id}/content` src instead of a short-lived blob preview URL.
 */
import classes from "./GalleryItem.module.css";
import { useCanvasContext } from "../../../store/canvas-context";
import { AiFillDelete } from "react-icons/ai";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";

export default function GalleryItem({url, img_id, imageUsed}){

    const { addImage } = useCanvasContext();

    function handleDeleteImage(){
        const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})
        api.httpRequest(ENDPOINTS.IMG.DELETE, "DELETE", JSON.stringify(img_id), "Nie udało się usunąć obrazu").
        then((data) =>{imageUsed(data)}).catch((error) => console.log(error));
    }

    function handleInsert(event) {
        const img = event.currentTarget;
        addImage({
            img_id,
            naturalWidth: img.naturalWidth || 100,
            naturalHeight: img.naturalHeight || 100,
        });
    }

    return <div className={classes.imageWrapper}>
        {url ? (
            <img src={url} id={img_id} className={classes.image} onClick={handleInsert} alt="" />
        ) : (
            <button type="button" className={classes.image} onClick={() => addImage({ img_id })}>
                Dodaj
            </button>
        )}
        <button onClick={handleDeleteImage}><AiFillDelete /></button>
    </div>
}
