/**
 * User image library panel. Selecting an item inserts it onto the canvas via context.
 *
 * Thumbnails load through the authenticated `/images/{id}/content` route (blob
 * URLs) because user uploads are no longer publicly mounted at `/uploads`.
 */
import classes from "./Gallery.module.css";

import { useState, useEffect } from "react";

import GalleryItem from "../GalleryItem/GalleryItem";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import { fetchAuthenticatedImageObjectUrl } from "../../../services/authenticatedImage";

import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import PanelShell from "../../common/PanelShell/PanelShell";


export default function Gallery() {

    const { isGallery, showGallery, isDropzone } = useUiSurfaces();

    const [images, setImages] = useState([]);
    const [previewUrls, setPreviewUrls] = useState({});
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
        if (!isGallery) return undefined;

        // Guests have no image library yet — the fetch below would 401
        // (Authorization: Bearer null) because there is no account to own
        // any uploaded images. Skip the request and report the same
        // "loaded, empty" terminal state a real fetch failure would produce,
        // but with a friendly explanation instead of the raw auth error.
        // Mirrors the guest guard already applied to ModalPdfs.jsx's
        // "Moje dokumenty" fetch and BioCvModal.jsx's wizard draft calls.
        if (!localStorage.getItem("token")) {
            setImages([]);
            setPreviewUrls({});
            setError({ message: "Załóż konto, aby zapisywać i przeglądać własne obrazy w galerii." });
            return undefined;
        }

        let cancelled = false;
        const objectUrls = [];
        const api = new ApiClient({ "Authorization": `Bearer ${localStorage.getItem("token")}` })
        api.httpRequest(ENDPOINTS.IMG.FETCH, "GET", null, "Pobieranie obrazów nie powiodło się!").
            then(async (rows) => {
                if (cancelled) return;
                setImages(rows);
                setError(null);
                const next = {};
                await Promise.all(rows.map(async (image) => {
                    try {
                        const url = await fetchAuthenticatedImageObjectUrl(image.id);
                        objectUrls.push(url);
                        next[image.id] = url;
                    } catch {
                        // Leave missing previews empty; insert still works via img_id.
                    }
                }));
                if (!cancelled) setPreviewUrls(next);
            }).
            catch((err) => {
                if (!cancelled) setError(err);
            });

        return () => {
            cancelled = true;
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [isGallery, isDropzone])

    const IMAGES = images.map((image) => (
        <GalleryItem
            url={previewUrls[image.id] || ""}
            key={image.id}
            img_id={image.id}
            imageUsed={handleImageUsedInPDF}
        />
    ));

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
