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
import { memo, useEffect, useState } from 'react';
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use, useRef } from "react";
import Resize from "../../common/Resize/Resize";
import API_BASE_URL from "../../../services/api";
import {
    fetchAuthenticatedImageObjectUrl,
    isAuthenticatedImageSrc,
} from "../../../services/authenticatedImage";

function resolveTemplateAssetSrc(src) {
    const assetPath = String(src || "").match(/\/template-assets\/[^?#]+(?:[?#].*)?$/)?.[0];
    const isLocalFrontend = typeof window !== "undefined"
        && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    return assetPath && !isLocalFrontend ? `${API_BASE_URL}${assetPath}` : src;
}

function isTextAlignedIcon(src, alignWithText) {
    // Explicit false opts out (Loom contact uses geometric centring).
    if (alignWithText === false) return false;
    if (alignWithText === true) return true;
    // Legacy Iconic docs saved without the flag still get optical alignment.
    return /\/template-assets\/iconic\//.test(String(src || ""));
}

/** CSS top so a square icon's centre matches an ~8.5pt label at `lineTop`. */
function iconicDrawTop(lineTop, size) {
    const h = Number(size) || 11;
    const textCapMid = Number(lineTop) + Math.min(h, 12) * 0.35;
    return textCapMid - h / 2;
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
}) {

    const { moveElement, selectElement, A4_Elements, selectMoveElement, resizeElement } = use(PdfContext)

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

    const image = useRef();

    useEffect(() => {
        if (!needsAuthFetch) {
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

    // Stretch to the authored box (object-fit: fill). ReportLab's drawImage
    // does the same. `contain` letterboxes full-page backgrounds whose PNG
    // aspect ratio differs from A4 (e.g. 1024×1536 → white side gutters).
    const style = {
        width: width,
        height: height,
        left: left,
        top: drawTop,
        position: "absolute",
        zIndex: zIndex,
        objectFit: "fill",
        ...(fixedToPage ? { pointerEvents: "none" } : {}),
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
            />
            <img
                ref={image}
                id={elementId}
                draggable={false}
                src={displaySrc}
                style={style}
                onDoubleClick={() => selectElement(elementId)}
                onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
                onPointerDown={(e) => {
                    if (e.ctrlKey || e.metaKey) return;
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
            onClick={(e) => selectElement(elementId, e.ctrlKey || e.metaKey)}
            onPointerDown={(e) => {
                if (e.ctrlKey || e.metaKey) return;
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
