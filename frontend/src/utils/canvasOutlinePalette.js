// Keep these contrast-reference values aligned with the central CSS tokens.
// CSS owns the rendered colours; these numbers only choose a surface family.
const OUTLINE_PALETTES = {
  element: { light: "#2563A6", dark: "#8CC8FF" },
  entry: { light: "#467DB5", dark: "#A5C9F5" },
  section: { light: "#5B81AD", dark: "#75B3EF" },
};
const OUTLINE_PADDING = { element: 4, entry: 8, section: 12 };

function parseColour(value) {
  const colour = String(value || "").trim();
  const hex = colour.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length < 5 ? [...hex].map((digit) => digit + digit).join("") : hex;
    const channels = expanded.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16));
    return [...channels.slice(0, 3), (channels[3] ?? 255) / 255];
  }
  const rgb = colour.match(/^rgba?\(([^)]+)\)$/i)?.[1];
  if (!rgb) return null;
  const parts = rgb.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channels = parts.map((part, index) => {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(part)) return NaN;
    const maximum = index < 3 ? 255 : 1;
    const value = Number.parseFloat(part) * (part.endsWith("%") ? maximum / 100 : 1);
    return Math.max(0, Math.min(maximum, value));
  });
  return channels.every(Number.isFinite) ? [...channels.slice(0, 3), channels[3] ?? 1] : null;
}

function luminance(channels) {
  const linear = channels.slice(0, 3).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const OUTLINE_LUMINANCE = Object.fromEntries(Object.entries(OUTLINE_PALETTES).map(
  ([role, colours]) => [role, Object.fromEntries(Object.entries(colours).map(
    ([surface, colour]) => [surface, luminance(parseColour(colour))],
  ))],
));

/**
 * Chooses editor-only blue outline tokens against the actual template surface.
 *
 * Filled rectangles are composited over white in paint order at eight points
 * along each padded outline's perimeter. Thin decoration, outline-only shapes and text
 * cannot masquerade as a background. Each role maximises its weakest sampled
 * contrast; this meets 3:1 whenever either central colour can meet that ratio.
 * Images, gradients and non-rectangular fills are intentionally not sampled.
 * Mixed light/dark regions may not admit one colour with 3:1 at every point.
 *
 * @param {object[]} elements - Authored elements, in their render order.
 * @param {{left:number,top:number,width:number,height:number}|null} bounds
 *   Page-local authored bounds; this helper never changes their geometry.
 * @param {number} [page=1] - One-based page containing the outline.
 * @param {number} [zoom=1] - Painted A4 scale, used for screen-stable padding.
 * @returns {Record<string,string>} CSS variables referencing global tokens.
 *   Missing/invalid bounds use the ordinary white-paper palette. No DOM reads,
 *   document mutations, persistence or network requests are performed.
 */
export function canvasOutlineStyle(elements, bounds, page = 1, zoom = 1) {
  const geometry = [bounds?.left, bounds?.top, bounds?.width, bounds?.height].map(Number.parseFloat);
  const validBounds = geometry.every(Number.isFinite) && geometry[2] >= 0 && geometry[3] >= 0;
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05 ? Number(zoom) : 1;
  const surfaces = validBounds ? (elements || []).flatMap((element, index) => {
      if (element?.category !== "rectangle" || !element.filled
        || Math.max(1, Number(element.page) || 1) !== Math.max(1, Number(page) || 1)) return [];
      const box = [element.left, element.top, element.width, element.height].map(Number.parseFloat);
      const colour = parseColour(element.backgroundColor);
      if (!colour || !box.every(Number.isFinite) || box[2] <= 2 || box[3] <= 2) return [];
      return [{ box, colour, order: Number(element.zIndex) || 0, index }];
    }).sort((first, second) => first.order - second.order || first.index - second.index) : [];
  return Object.fromEntries(Object.entries(OUTLINE_LUMINANCE).map(([role, colours]) => {
    const [left, top, width, height] = geometry;
    const padding = OUTLINE_PADDING[role] / safeZoom;
    // The line sits outside its authored field. A chip's dark interior must
    // not select a pale blue when the actual perimeter crosses white paper.
    const samples = validBounds ? [0, 0.5, 1].flatMap((x) => [0, 0.5, 1].flatMap((y) => {
      if (x === 0.5 && y === 0.5) return [];
      const point = [left - padding + (width + 2 * padding) * x, top - padding + (height + 2 * padding) * y];
      let background = [255, 255, 255];
      for (const { box: [x0, y0, w, h], colour } of surfaces) {
        if (point[0] < x0 || point[0] > x0 + w || point[1] < y0 || point[1] > y0 + h) continue;
        background = background.map((channel, index) => colour[index] * colour[3] + channel * (1 - colour[3]));
      }
      return [luminance(background)];
    })) : [1];
    const score = (surface) => Math.min(...samples.map((sample) => contrast(colours[surface], sample)));
    const surface = score("dark") > score("light") ? "dark" : "light";
    return [`--canvas-outline-${role}`, `var(--color-canvas-${role}-${surface})`];
  }));
}
