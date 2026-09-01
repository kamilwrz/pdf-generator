/**
 * One gallery thumbnail: insert onto canvas or delete (when not in use).
 *
 * Inserts via `{ img_id, naturalWidth, naturalHeight }` so the canvas stores a
 * stable `/images/{id}/content` src instead of a short-lived blob preview URL.
 * In template mode, a click immediately fits the image into the profile-photo
 * slot (full cover) and closes the gallery when `onApplied` is provided.
 */
import classes from "./GalleryItem.module.css";
import { useRef } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import { AiFillDelete } from "react-icons/ai";

import { ApiClient, ENDPOINTS } from "../../../services/api";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { applyProfilePhoto, findProfilePhotoSlot } from "../../../utils/profilePhoto";

export default function GalleryItem({ url, img_id, imageUsed, onApplied }) {
    const imageRef = useRef(null);
    const {
        addImage,
        A4_Elements,
        setA4_Elements,
        editorMode,
    } = useCanvasContext();

    function handleDeleteImage(event) {
        event.stopPropagation();
        const api = new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` });
        api.httpRequest(ENDPOINTS.IMG.DELETE, "DELETE", JSON.stringify(img_id), "Nie udało się usunąć obrazu")
            .then((data) => { imageUsed(data); })
            .catch((error) => console.log(error));
    }

    function handleInsert() {
        const img = imageRef.current;
        const naturalWidth = img.naturalWidth || 100;
        const naturalHeight = img.naturalHeight || 100;
        // Persist the backend-owned route, not the deployment origin or the
        // development `/api` proxy prefix. This keeps saved documents portable
        // and lets the server enforce the exact image-source allowlist.
        const src = ENDPOINTS.IMG.CONTENT(img_id);

        if (editorMode === EDITOR_MODE_TEMPLATE) {
            if (!findProfilePhotoSlot(A4_Elements)) return;
            setA4_Elements((prev) => applyProfilePhoto(prev, { src, img_id }));
            onApplied?.();
            return;
        }

        addImage({
            img_id,
            naturalWidth,
            naturalHeight,
        });
        onApplied?.();
    }

    return (
        <div className={classes.imageWrapper}>
            {url ? (
                <button
                    type="button"
                    className={classes.insertButton}
                    onClick={handleInsert}
                    aria-label="Dodaj zdjęcie profilowe do CV"
                >
                    <img
                        ref={imageRef}
                        src={url}
                        id={img_id}
                        className={classes.image}
                        alt=""
                    />
                </button>
            ) : (
                <button type="button" className={classes.insertButton} onClick={() => addImage({ img_id })}>
                    Dodaj
                </button>
            )}
            <button type="button" className={classes.deleteButton} onClick={handleDeleteImage} aria-label="Usuń zdjęcie profilowe">
                <AiFillDelete />
            </button>
        </div>
    );
}
