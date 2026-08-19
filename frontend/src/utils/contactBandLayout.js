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

// Nova-style stacked band: one channel per row, left-anchored. Label width is
// irrelevant to placement here (rows never wrap), so `measure` is unused.
function layoutStacked(descriptor, items) {
  const { iconGap, lineStep } = descriptor.metrics;
  const { startX, startY } = descriptor.anchor;
  const placements = items.map((item, i) => ({
    channel: item.channel,
    iconLeft: startX,
    iconTop: startY + i * lineStep,
    labelLeft: startX + iconGap,
    labelTop: startY + i * lineStep,
  }));
  const bottomY = items.length ? startY + (items.length - 1) * lineStep : startY;
  return { placements, bottomY };
}

// Volt-style chip (pill) width. Uses the char-count formula the backend draws
// with (NOT a measured width), so the canvas pill matches the PDF exactly.
function chipWidth(text, m) {
  const raw = m.widthBase + String(text).length * m.widthPerChar;
  return Math.max(m.minWidth, Math.min(m.maxWidth, raw));
}

// Volt-style chip band: each channel is a rounded pill (rect) with an icon and a
// label at fixed inset offsets; rows wrap at `rightLimit`. Each placement carries
// rect geometry in addition to icon/label so the controller can move + resize the
// pill background. `measure` is unused (width is deterministic per chipWidth).
function layoutChip(descriptor, items) {
  const m = descriptor.metrics;
  const { startX, startY, rightLimit } = descriptor.anchor;
  const fontSize = descriptor.text.fontSizePt;
  const placements = [];
  let cx = startX;
  let cy = startY;
  for (const item of items) {
    const width = chipWidth(item.label, m);
    if (cx > startX && cx + width > rightLimit) {
      cx = startX;
      cy += m.lineStep;
    }
    const textTop = cy + (m.chipH - fontSize) / 2;
    placements.push({
      channel: item.channel,
      rectLeft: cx, rectTop: cy, rectWidth: width,
      iconLeft: cx + m.padLeft, iconTop: textTop,
      labelLeft: cx + m.labelOffset, labelTop: textTop,
    });
    cx += width + m.chipGap;
  }
  return { placements, bottomY: cy };
}

/**
 * Lay out a contact band's active channels.
 *
 * @param {object} descriptor - Band descriptor (mode/anchor/text/icon/metrics/order).
 * @param {{channel:string,label:string}[]} items - Active channels, in order.
 * @param {(text:string,fontFamily:string,fontSizePt:number)=>number|null} measure
 * @returns {{placements:Array,bottomY:number}} placements carry icon/label
 *   positions for every mode, plus rect geometry (rectLeft/rectTop/rectWidth) in
 *   `chip` mode.
 */
export function layoutContactBand(descriptor, items, measure) {
  if (descriptor.mode === "wrapping") return layoutWrapping(descriptor, items, measure);
  if (descriptor.mode === "stacked") return layoutStacked(descriptor, items);
  if (descriptor.mode === "chip") return layoutChip(descriptor, items);
  return layoutCentered(descriptor, items, measure);
}
