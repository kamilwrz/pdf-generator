/**
 * Closed freeform polygon (triangle / diamond / hexagon).
 *
 * Geometry is an SVG polygon inside an absolutely positioned box so move and
 * resize reuse the same pointer contract as rectangle/ellipse. Fill vs stroke
 * follows the shared `filled` / `borderWidth` / `backgroundColor` fields.
 */
import { memo, useState } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import Resize from "../../common/Resize/Resize";
import { polygonToSvgPoints } from "../../../utils/freeformShapes";

function Polygon({
  width,
  height,
  backgroundColor,
  borderWidth,
  filled,
  points,
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
    A4_Elements,
    resizeElement,
  } = useCanvasContext();
  const [isResizeable, setIsResizeable] = useState(false);
  const selectedCount = A4_Elements.filter((element) => element.isSelected).length;
  const selectedElement = A4_Elements.find((element) => element.element_id === elementId);
  const svgPoints = polygonToSvgPoints(points, width, height);
  const strokeWidth = Math.max(0.5, Number(borderWidth) || 1);

  const frameStyle = {
    position: "absolute",
    width,
    height,
    left,
    top,
    zIndex,
    ...(fixedToPage ? { pointerEvents: "none" } : {}),
  };

  const shape = (
    <div
      id={elementId}
      style={frameStyle}
      onDoubleClick={() => selectElement(elementId)}
      onClick={(event) => selectElement(elementId, event.ctrlKey || event.metaKey)}
      onPointerDown={(event) => {
        if (fixedToPage) return;
        if (event.ctrlKey || event.metaKey) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        selectMoveElement(elementId, true);
      }}
      onPointerMove={(event) => {
        if (fixedToPage) return;
        moveElement(event, elementId, category);
      }}
      onPointerUp={() => {
        if (fixedToPage) return;
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
        <polygon
          points={svgPoints}
          fill={filled ? backgroundColor : "transparent"}
          stroke={filled ? "none" : backgroundColor}
          strokeWidth={filled ? 0 : strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  if (fixedToPage) return shape;

  if (isSelected && selectedCount === 1 && !isMove && selectedElement) {
    return (
      <>
        <Resize
          selectedElement={selectedElement}
          isResizeable={isResizeable}
          handleIsResizable={(active) => setIsResizeable(Boolean(active))}
          resizeElement={resizeElement}
          category={category}
          elementId={elementId}
        />
        {shape}
      </>
    );
  }

  return shape;
}

export default memo(Polygon);
