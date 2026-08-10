/**
 * Open cubic-Bezier path ornament for freeform mode.
 *
 * The path is rendered as SVG inside the element box. When the shape is the
 * sole selection, control-point handles appear so the user can reshape the
 * curve without leaving the canvas. Move/resize still operate on the box.
 */
import { memo, use, useRef, useState } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";
import Resize from "../../common/Resize/Resize";
import {
  curvesToSvgPath,
  listPathControlHandles,
  movePathHandle,
} from "../../../utils/freeformShapes";
import classes from "./Path.module.css";

function Path({
  width,
  height,
  backgroundColor,
  borderWidth,
  curves,
  left,
  top,
  isSelected,
  isMove,
  category,
  elementId,
  zIndex,
  fixedToPage,
}) {
  const {
    moveElement,
    selectElement,
    selectMoveElement,
    editElementValues,
    A4_Elements,
    resizeElement,
  } = use(PdfContext);
  const [isResizeable, setIsResizeable] = useState(false);
  const dragHandleRef = useRef(null);
  const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
  const selectedElement = A4_Elements.find((element) => element.element_id === elementId);
  const strokeWidth = Math.max(0.5, Number(borderWidth) || 1.4);
  const d = curvesToSvgPath(curves, width, height);
  const showHandles = isSelected && selectedCount === 1 && !isMove && !fixedToPage;
  const handles = showHandles
    ? listPathControlHandles({ left, top, width, height, curves })
    : [];

  const frameStyle = {
    position: "absolute",
    width,
    height,
    left,
    top,
    zIndex,
    ...(fixedToPage ? { pointerEvents: "none" } : {}),
  };

  function startHandleDrag(event, handle) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragHandleRef.current = {
      pointerId: event.pointerId,
      handle,
    };
  }

  function moveHandleDrag(event) {
    const drag = dragHandleRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !selectedElement) return;
    // Handles sit as siblings of the path box; walk up to the page surface so
    // zoomed/spread views still convert pointer coords into page-space pixels.
    const pageCanvas = event.currentTarget.closest("[data-page-canvas]");
    const host = pageCanvas?.getBoundingClientRect?.();
    if (!pageCanvas || !host) return;
    const pageWidth = parseFloat(pageCanvas.style.width) || 595;
    const pageHeight = parseFloat(pageCanvas.style.height) || 842;
    const scaleX = host.width / pageWidth;
    const scaleY = host.height / pageHeight;
    if (!scaleX || !scaleY) return;
    const absoluteLeft = (event.clientX - host.left) / scaleX;
    const absoluteTop = (event.clientY - host.top) / scaleY;
    const nextCurves = movePathHandle(
      selectedElement,
      drag.handle,
      absoluteLeft,
      absoluteTop,
    );
    editElementValues({ curves: nextCurves }, elementId);
  }

  function endHandleDrag(event) {
    if (dragHandleRef.current?.pointerId === event.pointerId) {
      dragHandleRef.current = null;
    }
  }

  const shape = (
    <div
      id={elementId}
      style={frameStyle}
      onDoubleClick={() => selectElement(elementId)}
      onClick={(event) => selectElement(elementId, event.ctrlKey || event.metaKey)}
      onPointerDown={(event) => {
        if (fixedToPage) return;
        if (event.ctrlKey || event.metaKey) return;
        // Ignore handle hits; those set their own capture.
        if (event.target?.dataset?.pathHandle === "true") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        selectMoveElement(elementId, true);
      }}
      onPointerMove={(event) => {
        if (fixedToPage) return;
        if (dragHandleRef.current) {
          moveHandleDrag(event);
          return;
        }
        moveElement(event, elementId, category);
      }}
      onPointerUp={(event) => {
        if (fixedToPage) return;
        if (dragHandleRef.current) {
          endHandleDrag(event);
          return;
        }
        selectMoveElement(elementId, false);
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
        style={{ display: "block", overflow: "visible" }}
        aria-hidden="true"
      >
        <path
          d={d}
          fill="none"
          stroke={backgroundColor || "#24201E"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  if (fixedToPage) return shape;

  return (
    <>
      {isSelected && selectedCount === 1 && !isMove && selectedElement ? (
        <Resize
          selectedElement={selectedElement}
          isResizeable={isResizeable}
          handleIsResizable={(active) => setIsResizeable(Boolean(active))}
          resizeElement={resizeElement}
          category={category}
          elementId={elementId}
        />
      ) : null}
      {shape}
      {handles.map((handle) => (
        <button
          key={handle.id}
          type="button"
          data-path-handle="true"
          className={`${classes.handle} ${handle.kind === "control" ? classes.control : classes.anchor}`}
          style={{ left: handle.left, top: handle.top, zIndex: (zIndex || 2) + 5 }}
          aria-label={handle.kind === "control" ? "Punkt kontrolny krzywej" : "Punkt ścieżki"}
          onPointerDown={(event) => startHandleDrag(event, handle)}
          onPointerMove={moveHandleDrag}
          onPointerUp={endHandleDrag}
          onPointerCancel={endHandleDrag}
        />
      ))}
    </>
  );
}

export default memo(Path);
