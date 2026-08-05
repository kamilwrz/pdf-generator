/**
 * Canvas CSS font stacks aligned with PDF font resolution.
 *
 * ReportLab aliases Helvetica/Courier → Inter (standard WinAnsi faces cannot
 * render Polish glyphs). The editor must measure wrap/`scrollHeight` with the
 * same files the PDF embeds, otherwise a font change that picks Helvetica
 * reflows the canvas on Arial metrics while the export draws Inter.
 */

/** @type {Record<string, string>} */
export const CANVAS_FONT_STACKS = {
  "Times-Roman": "Times-Roman, 'Times New Roman', Times, serif",
  // Match `PDF_Generator._UNICODE_FONT_ALIASES` — Inter first, not Arial.
  Helvetica: "Inter, Helvetica, Arial, sans-serif",
  Courier: "Inter, Courier, 'Courier New', monospace",
  Inter: "Inter, sans-serif",
  Roboto: "Roboto, sans-serif",
  PlayfairDisplay: "PlayfairDisplay, serif",
  CormorantGaramond: "CormorantGaramond, serif",
  Lora: "Lora, serif",
  Montserrat: "Montserrat, sans-serif",
  JetBrainsMono: "JetBrainsMono, monospace",
};

/**
 * CSS `font-family` value for painting/measuring a canvas text element.
 *
 * @param {string|null|undefined} family stored PdfElement.fontFamily
 * @returns {string}
 */
export function canvasFontFamily(family) {
  const key = String(family || "").trim();
  if (!key) return CANVAS_FONT_STACKS.Inter;
  return CANVAS_FONT_STACKS[key] || key;
}
