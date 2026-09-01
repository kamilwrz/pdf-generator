/**
 * Canvas image element with resize handles when selected.
 * Template-asset URLs are rewritten to the API origin outside localhost.
 * User library photos (`img_id` / `/images/{id}/content`) load via authenticated
 * fetch + blob URL because <img> cannot send Authorization headers.
 * `fixedToPage` disables pointer events (sidebars/backgrounds).
 * Iconic icons store `top` as the companion text line top; the draw offset
 * centres the glyph on that line (mirrors PDF `align_with_text`).
 */
import classes from "./Image.module.css";
import { memo, useEffect, useRef, useState } from 'react';
import { useCanvasContext } from "../../../store/canvas-context";
import { useUiSurfaces } from "../../../store/ui-surfaces-context";
import Resize from "../../common/Resize/Resize";
import API_BASE_URL from "../../../services/api";
import {
    fetchAuthenticatedImageObjectUrl,
    isAuthenticatedImageSrc,
} from "../../../services/authenticatedImage";
import { iconicDrawTop, isTextAlignedIcon } from "../../../utils/iconAlignment";
import { isProfilePhotoClickTarget } from "../../../utils/profilePhoto";

function resolveTemplateAssetSrc(src) {
    const assetPath = String(src || "").match(/\/template-assets\/[^?#]+(?:[?#].*)?$/)?.[0];
    const isLocalFrontend = typeof window !== "undefined"
        && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    return assetPath && !isLocalFrontend ? `${API_BASE_URL}${assetPath}` : src;
}

function Image({
    src,
    width,
    height,
    left,
    top,
    elementId,
    img_id,
    isSelected,
    isMove,
    zIndex,
    fixedToPage,
    alignWithText,
    borderRadius,
    objectFit,
    photoSlot,
}) {

    const {
        moveElement,
        selectElement,
        A4_Elements,
        selectMoveElement,
        resizeElement,
    } = useCanvasContext();
    const { showGallery } = useUiSurfaces();

    const [isResizeable, setIsResizeable] = useState(false);
    const [authDisplaySrc, setAuthDisplaySrc] = useState(null);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
    const needsAuthFetch = Boolean(img_id) || isAuthenticatedImageSrc(src);
    const displaySrc = needsAuthFetch
        ? (authDisplaySrc || "")
        : resolveTemplateAssetSrc(src);
    const drawTop = isTextAlignedIcon(src, alignWithText)
        ? iconicDrawTop(top, height)
        : top;
    const isPhotoClickTarget = isProfilePhotoClickTarget({ photoSlot });

    const image = useRef();
    const photoGalleryOpenedFromPointerRef = useRef(false);

    useEffect(() => {
        if (!needsAuthFetch) {
            // A template/public source must not retain the object URL from a
            // previously rendered authenticated image in this reused node.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAuthDisplaySrc(null);
            return undefined;
        }
        let revoked = false;
        let objectUrl = null;
        const id = img_id || String(src || "").match(/\/images\/(\d+)\/content/)?.[1];
        if (!id) return undefined;
        fetchAuthenticatedImageObjectUrl(id)
            .then((url) => {
                if (revoked) {
                    URL.revokeObjectURL(url);
                    return;
                }
                objectUrl = url;
                setAuthDisplaySrc(url);
            })
            .catch(() => {
                if (!revoked) setAuthDisplaySrc(null);
            });
        return () => {
            revoked = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [needsAuthFetch, img_id, src]);

    function handleIsResizeable(active) {
        setIsResizeable(Boolean(active));
    }

    // Default stretch matches ReportLab's plain drawImage. Profile slots use
    // `cover` so a gallery upload fills the frame without distorting aspect
    // ratio (center-cropped). `contain` letterboxes full-page backgrounds.
    const resolvedFit = objectFit
        || (photoSlot === "image" || photoSlot === "glyph" ? "cover" : "fill");
    const style = {
        width: width,
        height: height,
        left: left,
        top: drawTop,
        position: "absolute",
        zIndex: zIndex,
        objectFit: resolvedFit,
        // ReportLab receives the same radius and applies an equivalent PDF
        // clipping path, so circular profile slots match canvas and export.
        ...(borderRadius ? { borderRadius: `${borderRadius}px` } : {}),
        // Fixed profile glyphs/photos are deliberately clickable so users can
        // open the gallery directly on every template's visible photo slot.
        ...(fixedToPage && !isPhotoClickTarget ? { pointerEvents: "none" } : {}),
        ...(isPhotoClickTarget ? { cursor: "pointer" } : {}),
    }

    function handlePhotoClick(event) {
        // The pointer handler opens the gallery before selection/resize chrome
        // can consume the interaction. Ignore its synthetic follow-up click;
        // `showGallery` is a toggle, so handling both events would close it.
        if (photoGalleryOpenedFromPointerRef.current) {
            photoGalleryOpenedFromPointerRef.current = false;
            return;
        }
        selectElement(elementId, event.ctrlKey || event.metaKey);
        if (!event.ctrlKey && !event.metaKey) showGallery?.();
    }

    function handlePhotoPointerDown(event) {
        if (event.ctrlKey || event.metaKey) return;
        // Open directly from pointerdown. This makes frameless photo glyphs
        // such as Atrium reliable even when the selection/resize layer becomes
        // active during the same click.
        event.preventDefault();
        event.stopPropagation();
        photoGalleryOpenedFromPointerRef.current = true;
        selectElement(elementId);
        showGallery?.();
    }

    if (fixedToPage) {
        return (
            <img
                ref={image}
                id={elementId}
                draggable={false}
                src={displaySrc}
                style={style}
                alt=""
                onClick={isPhotoClickTarget ? handlePhotoClick : undefined}
                onPointerDown={isPhotoClickTarget ? handlePhotoPointerDown : undefined}
            />
        );
    }

    if (isSelected && selectedCount === 1 && !isMove) {

        const selectedElement = A4_Elements.find(element => element.element_id === elementId);

        return <>

            <Resize
                selectedElement={selectedElement}
                isResizeable={isResizeable}
                handleIsResizable={handleIsResizeable}
                resizeElement={resizeElement}
                category={selectedElement.category}
                elementId={elementId}
                elementRef={image}
                displayTop={drawTop}
            />
            <img
                ref={image}
                id={elementId}
                draggable={false}
                src={displaySrc}
                style={style}
                onDoubleClick={() => selectElement(elementId)}
                onClick={isPhotoClickTarget
                    ? handlePhotoClick
                    : (e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
                onPointerDown={(e) => {
                    if (e.ctrlKey || e.metaKey) return;
                    if (isPhotoClickTarget) {
                        handlePhotoPointerDown(e);
                        return;
                    }
                    e.currentTarget.setPointerCapture(e.pointerId);
                    selectMoveElement(elementId, true);
                }}
                onPointerMove={(e) => moveElement(e, elementId)}
                onPointerUp={() => selectMoveElement(elementId, false)}
                className={isSelected ? classes.selectedElement : ""}
            /></>

    } else {
        return <img
            ref={image}
            id={elementId}
            draggable={false}
            src={displaySrc}
            style={style}
            onDoubleClick={() => selectElement(elementId)}
            onClick={isPhotoClickTarget
                ? handlePhotoClick
                : (e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
            onPointerDown={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                if (isPhotoClickTarget) {
                    handlePhotoPointerDown(e);
                    return;
                }
                e.currentTarget.setPointerCapture(e.pointerId);
                selectMoveElement(elementId, true);
            }}
            onPointerMove={(e) => moveElement(e, elementId)}
            onPointerUp={() => selectMoveElement(elementId, false)}
            className={isSelected ? classes.selectedElement : ""}
        />
    }
}

export default memo(Image);
