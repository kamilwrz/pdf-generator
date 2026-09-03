import { expect } from "@playwright/test";

/** Verify actual painted caret pixels; correct selection offsets alone missed this bug. */
export async function expectMetadataCaret(page, field, index, { empty = true } = {}) {
  const slot = field.locator(`[data-metadata-slot="${index}"]`);
  if (empty) await expect(slot).toHaveAttribute("data-metadata-caret", "");
  else await expect(field).not.toHaveAttribute("data-metadata-empty-caret");
  const position = await slot.evaluate((node, isEmpty) => {
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !node.contains(selection.anchorNode)) return null;
    const rect = isEmpty ? node.getClientRects()[0] : selection.getRangeAt(0).getBoundingClientRect();
    return { x: rect.x, y: rect.y, height: rect.height };
  }, empty);
  expect(position).not.toBeNull();
  expect(position.height).toBeGreaterThan(4);
  // Native carets blink. Poll screenshots with caret enabled, sampling the
  // middle of the text line so outlines and dotted underlines cannot pass.
  await expect.poll(async () => {
    const shot = await page.screenshot({ caret: "initial", scale: "css" });
    return page.evaluate(async ({ src, position }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      let rows = 0;
      for (let y = Math.ceil(position.y + position.height * 0.25); y < position.y + position.height * 0.7; y++) {
        let painted = false;
        for (let x = Math.max(0, Math.floor(position.x) - 1); x <= Math.ceil(position.x) + 1; x++) {
          const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
          if (b > 170 && b > r + 70 && b > g + 50) painted = true;
        }
        if (painted) rows++;
      }
      return rows;
    }, { src: `data:image/png;base64,${shot.toString("base64")}`, position });
  }, { message: "A blue caret must be painted at the insertion position" }).toBeGreaterThan(2);
}
