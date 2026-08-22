/**
 * Rectangle for freeform/template chrome.
 *
 * Outline mode reuses `backgroundColor` as the stroke (legacy contract).
 * Filled mode paints a solid panel; optional `borderRadius` keeps canvas and
 * PDF rounded corners aligned via border-box geometry.
 */
import classes from "./Rectangle.module.css";
import { memo, useState } from 'react';
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";
import Resize from "../../common/Resize/Resize";
import { isProfilePhotoFrame } from "../../../utils/profilePhoto";

function Rectangle({
    width,
    height,
    backgroundColor,
    borderWidth,
    borderRadius,
    filled,
    left,
    top,
    isSelected,
    isMove,
    category,
    elementId,
    zIndex,
    fixedToPage,
    photoSlot,
    id: semanticId,
}) {

    const {
        moveElement,
        selectElement,
        selectMoveElement,
        A4_Elements,
        resizeElement,
        showGallery,
    } = use(PdfContext);

    const [isResizeable, setIsResizeable] = useState(false);
    const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
    // Empty profile-photo wells open the gallery on click so the user can pick
    // a portrait without hunting for the sidebar "Zdjęcia" control.
    const isPhotoFrame = isProfilePhotoFrame({ photoSlot, id: semanticId });

    function handleIsResizeable(active) {
        setIsResizeable(Boolean(active));
    }

    function handleClick(e) {
        selectElement(elementId, e.ctrlKey || e.metaKey);
        if (isPhotoFrame && !e.ctrlKey && !e.metaKey) {
            showGallery?.();
        }
    }

    // border-box keeps the border inside width/height so it matches the PDF
    // (which insets the stroke by half its width).
    const style = {
        width: width,
        height: height,
        left: left,
        top: top,
        position: "absolute",
        boxSizing: "border-box",
        background: filled ? backgroundColor : "transparent",
        border: filled ? "none" : `${borderWidth || 1}px solid ${backgroundColor}`,
        // Rounded pill/tag chrome (e.g. Harbor skill pills). Omitted when unset
        // so ordinary rectangles keep square corners identical to the PDF.
        ...(borderRadius ? { borderRadius: `${borderRadius}px` } : {}),
        zIndex: zIndex,
        // Page-fixed decorations stay inert, except the profile-photo frame:
        // its only allowed interaction is opening the gallery to replace it.
        ...(fixedToPage && !isPhotoFrame ? { pointerEvents: "none" } : {}),
        ...(isPhotoFrame ? { cursor: "pointer" } : {}),
    }

    if (fixedToPage) {
        return (
            <div
                id={elementId}
                style={style}
                onClick={isPhotoFrame ? handleClick : undefined}
            />
        );
    }

    if (isSelected && selectedCount === 1 && !isMove) {
        const selectedElement = A4_Elements.find(element => element.element_id === elementId);

        return (
            <>
                <Resize
                    selectedElement={selectedElement}
                    isResizeable={isResizeable}
                    handleIsResizable={handleIsResizeable}
                    resizeElement={resizeElement}
                    category={selectedElement.category}
                    elementId={elementId}
                />

                <div
                    id={elementId}
                    onDoubleClick={() => selectElement(elementId)}
                    onClick={handleClick}
                    onPointerDown={(e) => {
                        if (e.ctrlKey || e.metaKey) return;
                        // Photo slots are click-targets for the gallery, not drag handles.
                        if (isPhotoFrame) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        selectMoveElement(elementId, true);
                    }}
                    onPointerMove={(e) => moveElement(e, elementId)}
                    onPointerUp={() => selectMoveElement(elementId, false)}
                    className={isSelected ? classes.selectedElement : ""}
                    style={style}>
                </div>
            </>
        )
    }
    else {
        return (
            <div
                id={elementId}
                onDoubleClick={() => selectElement(elementId)}
                onClick={handleClick}
                onPointerDown={(e) => {
                    if (e.ctrlKey || e.metaKey) return;
                    if (isPhotoFrame) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    selectMoveElement(elementId, true);
                }}
                onPointerMove={(e) => moveElement(e, elementId, category)}
                onPointerUp={() => selectMoveElement(elementId, false)}
                className={isSelected ? classes.selectedElement : ""}
                style={style}>
            </div>
        )
    }
}

export default memo(Rectangle);
