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

function Image({
    src,
    width,
    height,
    left,
    top,
    elementId,
    isSelected,
    isMove,
    zIndex }) {

    const { moveElement, selectElement, A4_Elements, selectMoveElement, resizeElement } = use(PdfContext)

    const [isResizeable, setIsResizeable] = useState(false);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
    const displaySrc = resolveTemplateAssetSrc(src);

    const image = useRef();

    function handleIsResizeable() {
        setIsResizeable(bool => !bool);
    }

    const style = {
        width: width,
        height: height,
        left: left,
        top: top,
        position: "absolute",
        zIndex: zIndex
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
