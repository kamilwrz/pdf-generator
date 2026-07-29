/**
 * Canvas image element with resize handles when selected.
 * Template-asset URLs are rewritten to the API origin outside localhost.
 * `fixedToPage` disables pointer events (sidebars/backgrounds).
 * Iconic icons store `top` as the companion text line top; the draw offset
 * centres the glyph on that line (mirrors PDF `align_with_text`).
 */
import classes from "./Image.module.css";
import { memo, useState } from 'react';
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use, useRef } from "react";
import Resize from "../../common/Resize/Resize";
import API_BASE_URL from "../../../services/api";

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
    isSelected,
    isMove,
    zIndex,
    fixedToPage,
    alignWithText,
}) {

    const { moveElement, selectElement, A4_Elements, selectMoveElement, resizeElement } = use(PdfContext)

    const [isResizeable, setIsResizeable] = useState(false);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
    const displaySrc = resolveTemplateAssetSrc(src);
    const drawTop = isTextAlignedIcon(src, alignWithText)
        ? iconicDrawTop(top, height)
        : top;

    const image = useRef();

    function handleIsResizeable(active) {
        setIsResizeable(Boolean(active));
    }

    const style = {
        width: width,
        height: height,
        left: left,
        top: drawTop,
        position: "absolute",
        zIndex: zIndex,
        objectFit: "contain",
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
