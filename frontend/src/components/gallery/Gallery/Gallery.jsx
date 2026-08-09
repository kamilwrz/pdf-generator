/**
 * Profile-photo library panel. Selecting an item inserts it onto the canvas
 * (or fits the template photo slot). Always renders a fixed grid of slots so
 * empty placeholders communicate the five-photo capacity.
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
import { MAX_PROFILE_PHOTOS } from "../../../constants/profilePhotos";

import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import PanelShell from "../../common/PanelShell/PanelShell";

function EmptySlot({ index, onUpload, canUpload }) {
    return (
        <button
            type="button"
            className={classes.emptySlot}
            onClick={canUpload ? onUpload : undefined}
            disabled={!canUpload}
            aria-label={
                canUpload
                    ? `Wolne miejsce ${index} z ${MAX_PROFILE_PHOTOS}. Prześlij zdjęcie profilowe.`
                    : `Wolne miejsce ${index} z ${MAX_PROFILE_PHOTOS}.`
            }
        >
            <span className={classes.emptyIcon} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="3.25" />
                    <path d="M5.5 19.5c1.2-3.2 3.4-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
                </svg>
            </span>
            <span className={classes.emptyLabel}>Wolne miejsce</span>
            {canUpload ? (
                <span className={classes.emptyHint}>Kliknij, aby przesłać</span>
            ) : null}
        </button>
    );
}

export default function Gallery() {
    const { isGallery, showGallery, isDropzone, showDropzone } = useUiSurfaces();

    const [images, setImages] = useState([]);
    const [previewUrls, setPreviewUrls] = useState({});
    const [error, setError] = useState();
    const [loaded, setLoaded] = useState(false);

    function handleImageUsedInPDF(message) {
        if (message?.deleted_image != null) {
            setImages((prevState) => prevState.filter((img) => img.id !== message.deleted_image));
            setPreviewUrls((prev) => {
                const next = { ...prev };
                const removed = next[message.deleted_image];
                if (removed) URL.revokeObjectURL(removed);
                delete next[message.deleted_image];
                return next;
            });
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
        if (!localStorage.getItem("token")) {
            setImages([]);
            setPreviewUrls({});
            setLoaded(true);
            setError({ message: "Załóż konto, aby zapisywać i przeglądać zdjęcia profilowe." });
            return undefined;
        }

        let cancelled = false;
        const objectUrls = [];
        setLoaded(false);
        const api = new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` });
        api.httpRequest(ENDPOINTS.IMG.FETCH, "GET", null, "Pobieranie zdjęć profilowych nie powiodło się!")
            .then(async (rows) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                setImages(list);
                setError(null);
                const next = {};
                await Promise.all(list.map(async (image) => {
                    try {
                        const url = await fetchAuthenticatedImageObjectUrl(image.id);
                        objectUrls.push(url);
                        next[image.id] = url;
                    } catch {
                        // Leave missing previews empty; insert still works via img_id.
                    }
                }));
                if (!cancelled) {
                    setPreviewUrls(next);
                    setLoaded(true);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setImages([]);
                    setPreviewUrls({});
                    setError(err);
                    setLoaded(true);
                }
            });

        return () => {
            cancelled = true;
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [isGallery, isDropzone]);

    // Show every owned photo so accounts that still exceed the new cap (from
    // the previous higher limit) can delete extras. Empty placeholders only
    // pad up to MAX_PROFILE_PHOTOS when the library is under capacity.
    const filled = images;
    const emptyCount = Math.max(0, MAX_PROFILE_PHOTOS - filled.length);
    const overLimit = filled.length > MAX_PROFILE_PHOTOS;
    const canUpload = Boolean(localStorage.getItem("token")) && emptyCount > 0;
    const isGuestError = error?.message?.includes("Załóż konto");

    const slots = [];
    filled.forEach((image) => {
        slots.push(
            <GalleryItem
                url={previewUrls[image.id] || ""}
                key={image.id}
                img_id={image.id}
                imageUsed={handleImageUsedInPDF}
            />,
        );
    });
    for (let i = 0; i < emptyCount; i += 1) {
        slots.push(
            <EmptySlot
                key={`empty-${i}`}
                index={filled.length + i + 1}
                canUpload={canUpload}
                onUpload={showDropzone}
            />,
        );
    }

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
            title="Zdjęcia profilowe"
            subtitle="Do 5 zdjęć do użycia w CV · kliknij, aby wstawić"
        >
            <div className={classes.meta}>
                <span className={classes.metaCount}>
                    {loaded ? filled.length : "…"}
                    {" "}
                    z
                    {" "}
                    {MAX_PROFILE_PHOTOS}
                </span>
                <span className={classes.metaLabel}>miejsc w galerii</span>
            </div>

            {error && !isGuestError ? (
                <p className={classes.error}>{error.message}</p>
            ) : null}

            {isGuestError ? (
                <p className={classes.error}>{error.message}</p>
            ) : (
                <div className={classes.grid} aria-busy={!loaded}>
                    {slots}
                </div>
            )}

            {loaded && (filled.length >= MAX_PROFILE_PHOTOS || overLimit) ? (
                <p className={classes.limitNote}>
                    {overLimit
                        ? `Masz ${filled.length} zdjęć, a limit to ${MAX_PROFILE_PHOTOS}. Usuń nadmiar, aby znów móc przesyłać.`
                        : `Limit ${MAX_PROFILE_PHOTOS} zdjęć jest pełny. Usuń zdjęcie, aby przesłać kolejne.`}
                </p>
            ) : null}
        </PanelShell>
    );
}
