/**
 * One gallery thumbnail: insert onto canvas or delete (when not in use).
 *
 * Inserts via `{ img_id, naturalWidth, naturalHeight }` so the canvas stores a
 * stable `/images/{id}/content` src instead of a short-lived blob preview URL.
 * In template mode, a click immediately fits the image into the profile-photo
 * slot when one exists (no confirmation dialog, no freeform prompt).
 */
import classes from "./GalleryItem.module.css";
import { useCanvasContext } from "../../../store/canvas-context";
import { AiFillDelete } from "react-icons/ai";

import API_BASE_URL, { ApiClient, ENDPOINTS } from "../../../services/api";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { applyProfilePhoto, findProfilePhotoSlot } from "../../../utils/profilePhoto";

export default function GalleryItem({url, img_id, imageUsed}){

    const {
        addImage,
        A4_Elements,
        setA4_Elements,
        editorMode,
    } = useCanvasContext();

    function handleDeleteImage(){
        const api = new ApiClient({"Authorization" : `Bearer ${localStorage.getItem("token")}`})
        api.httpRequest(ENDPOINTS.IMG.DELETE, "DELETE", JSON.stringify(img_id), "Nie udało się usunąć obrazu").
        then((data) =>{imageUsed(data)}).catch((error) => console.log(error));
    }

    function handleInsert(event) {
        const img = event.currentTarget;
        const naturalWidth = img.naturalWidth || 100;
        const naturalHeight = img.naturalHeight || 100;
        const src = `${API_BASE_URL}${ENDPOINTS.IMG.CONTENT(img_id)}`;

        if (editorMode === EDITOR_MODE_TEMPLATE) {
            // Place into the template photo slot immediately — no prompt.
            if (!findProfilePhotoSlot(A4_Elements)) return;
            setA4_Elements((prev) => applyProfilePhoto(prev, { src, img_id }));
            return;
        }

        addImage({
            img_id,
            naturalWidth,
            naturalHeight,
        });
    }

    return <div className={classes.imageWrapper}>
        {url ? (
            <img
                src={url}
                id={img_id}
                className={classes.image}
                onClick={handleInsert}
                alt="Zdjęcie profilowe"
            />
        ) : (
            <button type="button" className={classes.image} onClick={() => addImage({ img_id })}>
                Dodaj
            </button>
        )}
        <button type="button" onClick={handleDeleteImage} aria-label="Usuń zdjęcie profilowe">
            <AiFillDelete />
        </button>
    </div>
}
