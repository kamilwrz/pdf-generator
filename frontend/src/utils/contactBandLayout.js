/**
 * Pure contact-band layout engine.
 *
 * Ports the backend placement math (cv_templates/shared/contact.py:
 * _place_centered_icon_contacts / _place_wrapping_icon_contacts) so the canvas
 * can recompute icon+label positions live when a channel is added or removed.
 * Geometry units are points == CSS px. `bottomY` is the TOP of the last row
 * (matching the backend contract) so callers can place a rule at bottomY + gap.
 */

/**
 * Horizontal footprint of one icon+label chip in points.
 *
 * @param {string} text - The channel's display label.
 * @param {{iconGap:number,itemPad:number,charWidth:number}} metrics
 * @param {(text:string)=>number|null} measure - Real glyph width, or null to
 *   fall back to the deterministic `charWidth` estimate (matches the backend).
 * @returns {number}
 */
export function contactItemWidth(text, metrics, measure) {
  const measured = measure ? measure(text) : null;
  const width = typeof measured === "number" ? measured : text.length * metrics.charWidth;
  return metrics.iconGap + width + metrics.itemPad;
}

// Bind the descriptor's font to the caller's `measure(text, font, sizePt)` so
// the layout functions can call it with a single text argument.
function bindMeasure(descriptor, measure) {
  return (text) =>
    measure ? measure(text, descriptor.text.fontFamily, descriptor.text.fontSizePt) : null;
}

function layoutCentered(descriptor, items, measure) {
  const { iconGap, itemPad, lineStep } = descriptor.metrics;
  const { centerX, startY, maxWidth } = descriptor.anchor;
  const measureLabel = bindMeasure(descriptor, measure);

  // First pass: bucket items into lines using their measured advances. The X
  // start of each line depends on that line's total width, which is only known
  // once the line is complete — so geometry is emitted in the second pass.
  const lines = [[]];
  let lineWidth = 0;
  for (const item of items) {
    const advance = contactItemWidth(item.label, descriptor.metrics, measureLabel);
    if (lines[lines.length - 1].length && lineWidth + advance > maxWidth) {
      lines.push([]);
      lineWidth = 0;
    }
    lines[lines.length - 1].push({ ...item, advance });
    lineWidth += advance;
  }

  const nonEmpty = lines.filter((line) => line.length);
  const placements = [];
  let cy = startY;
  for (const line of nonEmpty) {
    // Exclude the trailing item's itemPad: it is inter-item spacing, not part
    // of the drawn row, so keeping it would push the line left of true center.
    const visibleWidth = line.reduce((sum, it) => sum + it.advance, 0) - itemPad;
    let cx = centerX - visibleWidth / 2;
    for (const it of line) {
      placements.push({
        channel: it.channel,
        iconLeft: cx,
        iconTop: cy,
        labelLeft: cx + iconGap,
        labelTop: cy,
      });
      cx += it.advance;
    }
    cy += lineStep;
  }
  return { placements, bottomY: nonEmpty.length ? cy - lineStep : startY };
}

function layoutWrapping(descriptor, items, measure) {
  const { iconGap, lineStep } = descriptor.metrics;
  const { startX, startY, rightLimit } = descriptor.anchor;
  const measureLabel = bindMeasure(descriptor, measure);

  const placements = [];
  let cx = startX;
  let cy = startY;
  for (const item of items) {
    const advance = contactItemWidth(item.label, descriptor.metrics, measureLabel);
    if (cx > startX && cx + advance > rightLimit) {
      cx = startX;
      cy += lineStep;
    }
    placements.push({
      channel: item.channel,
      iconLeft: cx,
      iconTop: cy,
      labelLeft: cx + iconGap,
      labelTop: cy,
    });
    cx += advance;
  }
  return { placements, bottomY: cy };
}

/**
 * Lay out a contact band's active channels.
 *
 * @param {object} descriptor - Band descriptor (mode/anchor/text/icon/metrics/order).
 * @param {{channel:string,label:string}[]} items - Active channels, in order.
 * @param {(text:string,fontFamily:string,fontSizePt:number)=>number|null} measure
 * @returns {{placements:Array<{channel:string,iconLeft:number,iconTop:number,labelLeft:number,labelTop:number}>,bottomY:number}}
 */
export function layoutContactBand(descriptor, items, measure) {
  if (descriptor.mode === "wrapping") return layoutWrapping(descriptor, items, measure);
  return layoutCentered(descriptor, items, measure);
}
