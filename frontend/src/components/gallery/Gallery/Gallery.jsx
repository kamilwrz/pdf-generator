/**
 * Profile-photo library panel.
 *
 * Layout: upper 2/3 = four evenly spaced slots; lower 1/3 = upload dropzone.
 * The panel is vertically centered (25% margin top/bottom) and slides in from
 * the right. Uploads append into empty slots as each file finishes. Clicking a
 * filled slot applies the photo to the template canvas slot and closes the panel.
 */
import classes from "./Gallery.module.css";

import { useState, useEffect, useLayoutEffect, useCallback, use } from "react";

import GalleryItem from "../GalleryItem/GalleryItem";
import Dropzone from "../Dropzone/Dropzone";

import { ApiClient } from "../../../services/api";
import { ENDPOINTS } from "../../../services/api";
import { fetchAuthenticatedImageObjectUrl } from "../../../services/authenticatedImage";
import { MAX_PROFILE_PHOTOS } from "../../../constants/profilePhotos";

import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import { PdfContext } from "../../../store/pdfgenerator-context";
import PanelShell from "../../common/PanelShell/PanelShell";

/** Gap between the live A4 page's right edge and the panel's left edge. */
const PAGE_EDGE_GAP_PX = 40;

function EmptySlot({ index }) {
    return (
        <div
            className={classes.emptySlot}
            aria-label={`Wolne miejsce ${index} z ${MAX_PROFILE_PHOTOS}.`}
        >
            <span className={classes.emptyLabel}>Wolne</span>
        </div>
    );
}

export default function Gallery() {
    const { isGallery, showGallery } = useUiSurfaces();
    const { A4ref } = use(PdfContext);

    // Rest position hugs the live A4 page's right edge (viewport px via
    // getBoundingClientRect, same pattern as the export Spinner's anchorRef)
    // instead of docking at the far edge of the editor chrome, so the panel
    // slides out right where the page itself ends, independent of zoom.
    const [panelLeft, setPanelLeft] = useState(null);
    useLayoutEffect(() => {
        if (!isGallery) return undefined;

        const placePanel = () => {
            const page = A4ref?.current ?? document.querySelector(".page-canvas");
            if (!page) return;
            const rect = page.getBoundingClientRect();
            setPanelLeft(rect.right + PAGE_EDGE_GAP_PX);
        };

        placePanel();
        window.addEventListener("resize", placePanel);
        const area = document.querySelector(".canvas-area");
        area?.addEventListener("scroll", placePanel, { passive: true });
        return () => {
            window.removeEventListener("resize", placePanel);
            area?.removeEventListener("scroll", placePanel);
        };
    }, [isGallery, A4ref]);

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

    // Append one uploaded photo into the next empty slot and load its preview.
    const handleUploaded = useCallback(async (row) => {
        if (!row?.id) return;
        setImages((prev) => (
            prev.some((image) => image.id === row.id) ? prev : [...prev, row]
        ));
        try {
            const url = await fetchAuthenticatedImageObjectUrl(row.id);
            setPreviewUrls((prev) => {
                const previous = prev[row.id];
                if (previous) URL.revokeObjectURL(previous);
                return { ...prev, [row.id]: url };
            });
        } catch {
            // Slot still shows; preview may appear after the next open.
        }
    }, []);

    useEffect(() => {
        if (!isGallery) return undefined;

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
    }, [isGallery]);

    const filled = images.slice(0, MAX_PROFILE_PHOTOS);
    const emptyCount = Math.max(0, MAX_PROFILE_PHOTOS - filled.length);
    const overLimit = images.length > MAX_PROFILE_PHOTOS;
    const isGuestError = error?.message?.includes("Załóż konto");

    const slots = [];
    filled.forEach((image) => {
        slots.push(
            <GalleryItem
                url={previewUrls[image.id] || ""}
                key={image.id}
                img_id={image.id}
                imageUsed={handleImageUsedInPDF}
                onApplied={showGallery}
            />,
        );
    });
    for (let i = 0; i < emptyCount; i += 1) {
        slots.push(
            <EmptySlot
                key={`empty-${i}`}
                index={filled.length + i + 1}
            />,
        );
    }

    return (
        <PanelShell
            open={isGallery}
            onClose={showGallery}
            className={classes.gallery}
            style={panelLeft != null ? { left: panelLeft } : undefined}
            motionProps={{
                initial: { opacity: 0, x: 28 },
                animate: { opacity: 1, x: 0 },
                exit: { opacity: 0, x: 28 },
                transition: { type: "spring", damping: 26, stiffness: 320 },
            }}
            title="Zdjęcia profilowe"
            subtitle="4 miejsca · kliknij zdjęcie, aby wstawić w slot CV"
        >
            <div className={classes.layout}>
                <div className={classes.slotsRegion}>
                    <div className={classes.meta}>
                        <span className={classes.metaCount}>
                            {loaded ? filled.length : "…"}
                            {" "}
                            z
                            {" "}
                            {MAX_PROFILE_PHOTOS}
                        </span>
                        <span className={classes.metaLabel}>miejsc</span>
                    </div>

                    {error && isGuestError ? (
                        <p className={classes.error}>{error.message}</p>
                    ) : null}

                    {error && !isGuestError ? (
                        <p className={classes.error}>{error.message}</p>
                    ) : null}

                    {!isGuestError ? (
                        <div className={classes.grid} aria-busy={!loaded}>
                            {slots}
                        </div>
                    ) : null}
                </div>

                {!isGuestError ? (
                    <div className={classes.dropRegion}>
                        <Dropzone
                            variant="embedded"
                            active={isGallery}
                            libraryCount={images.length}
                            onUploaded={handleUploaded}
                        />
                    </div>
                ) : null}

                {loaded && (filled.length >= MAX_PROFILE_PHOTOS || overLimit) ? (
                    <p className={classes.limitNote}>
                        {overLimit
                            ? `Masz ${images.length} zdjęć, a limit to ${MAX_PROFILE_PHOTOS}. Usuń nadmiar, aby znów móc przesyłać.`
                            : `Limit ${MAX_PROFILE_PHOTOS} zdjęć jest pełny. Usuń zdjęcie, aby przesłać kolejne.`}
                    </p>
                ) : null}
            </div>
        </PanelShell>
    );
}
