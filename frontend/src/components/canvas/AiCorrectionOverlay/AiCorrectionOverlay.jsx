/**
 * Soft, animated marks on A4 elements that still have a pending AI suggestion.
 *
 * Drawn above canvas content and below the selection chrome. Marks use an
 * opacity pulse so the eye finds them without opaque colour blocks covering
 * the CV text. `pointer-events: none` keeps editing unaffected.
 */
import { useMemo } from "react";
import { useCanvasContext } from "../../../store/canvas-context";
import { getElementBounds, getTextContentBounds } from "../../../utils/elementBounds";
import { imageDisplayTop } from "../../../utils/iconAlignment";
import classes from "./AiCorrectionOverlay.module.css";

function frameForElement(element) {
  const left = Number(element.left) || 0;
  const top = imageDisplayTop(element);

  if (element.category === "text") {
    const {
      width,
      height,
      left: contentLeft,
      top: contentTop,
    } = getTextContentBounds(element);
    return {
      left: Number.isFinite(contentLeft) ? contentLeft : left,
      top: Number.isFinite(contentTop) ? contentTop : top,
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  }

  const { width, height } = getElementBounds(element);
  return {
    left,
    top,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
  };
}

/** Expand the mark slightly past glyph bounds so thin one-line titles stay visible. */
function paddedFrame(frame) {
  const padX = 3;
  const padY = 2;
  return {
    left: frame.left - padX,
    top: frame.top - padY,
    width: frame.width + padX * 2,
    height: frame.height + padY * 2,
  };
}

/**
 * @param {object} props
 * @param {Array<object>} [props.elements]
 * @param {number} [props.page]
 */
export default function AiCorrectionOverlay({ elements, page }) {
  const {
    A4_Elements,
    currentPage,
    aiCorrectionHighlights = [],
  } = useCanvasContext();

  const canvasElements = elements ?? A4_Elements;
  const displayedPage = page ?? currentPage;

  const marks = useMemo(() => {
    if (!Array.isArray(aiCorrectionHighlights) || aiCorrectionHighlights.length === 0) {
      return [];
    }
    const byId = new Map(
      canvasElements.map((el) => [el.element_id, el]),
    );
    const out = [];
    for (const item of aiCorrectionHighlights) {
      const element = byId.get(item.elementId);
      if (!element) continue;
      if (element.category === "connector") continue;
      if ((element.page ?? 1) !== displayedPage) continue;
      out.push({
        id: item.elementId,
        kind: item.kind || "content",
        ...paddedFrame(frameForElement(element)),
      });
    }
    return out;
  }, [aiCorrectionHighlights, canvasElements, displayedPage]);

  if (marks.length === 0) return null;

  return (
    <div className={classes.layer} aria-hidden="true">
      {marks.map((mark, index) => (
        <div
          key={mark.id}
          className={`${classes.mark} ${classes[`kind_${mark.kind}`] || classes.kind_content}`}
          style={{
            left: mark.left,
            top: mark.top,
            width: mark.width,
            height: mark.height,
            // Stagger the pulse so a dense list of marks does not flash in lockstep.
            animationDelay: `${(index % 6) * 0.12}s`,
          }}
        >
          <span className={classes.tick} />
        </div>
      ))}
    </div>
  );
}
