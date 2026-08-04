/**
 * One gallery thumbnail: insert onto canvas or delete (when not in use).
 *
 * Inserts via `{ img_id, naturalWidth, naturalHeight }` so the canvas stores a
 * stable `/images/{id}/content` src instead of a short-lived blob preview URL.
 * In template mode, offers replacing the profile-photo slot when one exists.
 */
import classes from "./GalleryItem.module.css";
import { useCanvasContext } from "../../../store/canvas-context";
import { AiFillDelete } from "react-icons/ai";

import API_BASE_URL, { ApiClient, ENDPOINTS } from "../../../services/api";
import { EDITOR_MODE_TEMPLATE } from "../../../utils/editorMode";
import { findProfilePhotoSlot } from "../../../utils/sectionStructure";

export default function GalleryItem({url, img_id, imageUsed}){

    const {
        addImage,
        A4_Elements,
        editElementValues,
        editorMode,
        showUnlockFreeform,
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

        if (editorMode === EDITOR_MODE_TEMPLATE) {
            const slot = findProfilePhotoSlot(A4_Elements);
            const choice = window.prompt(
                [
                    "Gdzie umieścić obraz?",
                    slot ? "1 — Upuść jako zdjęcie profilowe" : null,
                    "2 — Przejdź do trybu swobodnego (dodaj dowolnie)",
                    "Anuluj — nic nie rób",
                ].filter(Boolean).join("\n"),
                slot ? "1" : "2",
            );
            if (choice == null) return;
            if (choice.trim() === "1" && slot) {
                editElementValues(
                    {
                        src: `${API_BASE_URL}${ENDPOINTS.IMG.CONTENT(img_id)}`,
                        img_id,
                    },
                    slot.element_id,
                );
                return;
            }
            if (choice.trim() === "2") {
                showUnlockFreeform?.();
                return;
            }
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
            <img src={url} id={img_id} className={classes.image} onClick={handleInsert} alt="" />
        ) : (
            <button type="button" className={classes.image} onClick={() => addImage({ img_id })}>
                Dodaj
            </button>
        )}
        <button onClick={handleDeleteImage}><AiFillDelete /></button>
    </div>
}
