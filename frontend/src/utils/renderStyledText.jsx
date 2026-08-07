/**
 * Render inline-decorated text for canvas DISPLAY (not editing).
 *
 * Produces inline `<span>`s from `{ content, runs }` so the browser wraps the
 * text naturally across span boundaries — the same wrap the run-aware PDF
 * renderer reproduces. Styling is applied inline; spans are inline so they do
 * not affect the box model the plain path relies on.
 *
 * When there are no runs the caller should keep rendering plain text; these
 * helpers still work (they return a single text node) but adding them to the
 * hot path is unnecessary for unformatted content.
 */

import { styledSegments } from "./textRuns.js";

function segmentStyle(segment) {
  const style = {};
  if (segment.bold) style.fontWeight = 700;
  if (segment.italic) style.fontStyle = "italic";
  if (segment.underline) style.textDecoration = "underline";
  if (segment.color) style.color = segment.color;
  return style;
}

/**
 * Render `content` + `runs` as an array of React nodes. Plain segments render
 * as bare strings; styled segments render as `<span style=…>`.
 */
export function renderStyledText(content, runs) {
  const segments = styledSegments(content, runs);
  return segments.map((segment, index) => {
    if (!segment.bold && !segment.italic && !segment.underline && !segment.color) {
      return segment.text;
    }
    return (
      <span key={index} style={segmentStyle(segment)}>
        {segment.text}
      </span>
    );
  });
}
