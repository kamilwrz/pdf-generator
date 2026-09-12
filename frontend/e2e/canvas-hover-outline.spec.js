import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_ELEMENTS } from "./support/mockApi.js";

// Reuse the persisted Skills graph and add an ordinary two-field record so the
// test covers both structural overlay paths, including a complete dark panel.
function outlineElements(background) {
  const projects = SAVED_ELEMENTS.filter((element) => [
    "skills-heading", "skills-rule", "skills-tools-title", "skills-tools-body",
  ].includes(element.element_id)).map((element) => ({
    ...element,
    element_id: element.element_id.replace("skills", "projects"),
    top: element.top + 180,
    content: element.element_id === "skills-heading" ? "PROJEKTY" : element.content,
    flowGroup: element.flowGroup?.replace("skills", "projects"),
    extra_properties: {
      ...element.extra_properties,
      flowGroup: element.flowGroup?.replace("skills", "projects"),
    },
  }));
  return [
    { element_id: "outline-background", category: "rectangle", left: 0, top: 0,
      width: 595, height: 842, page: 1, filled: true, fixedToPage: true,
      backgroundColor: background,
      extra_properties: { filled: true, fixedToPage: true, backgroundColor: background } },
    ...SAVED_ELEMENTS, ...projects,
    { element_id: "outline-title", category: "textarea", content: "Frontend Developer",
      left: 250, top: 125, width: 280, height: 18, page: 1, fontSize: 10,
      lineHeight: 14, mastheadRole: "title",
      extra_properties: { lineHeight: 14, mastheadRole: "title" } },
  ].map((element) => ["text", "textarea"].includes(element.category) ? {
    ...element, color: background === "#FFFFFF" ? "#161616" : "#FFFFFF",
    extra_properties: { ...element.extra_properties, color: background === "#FFFFFF" ? "#161616" : "#FFFFFF" },
  } : element);
}

function contrastRatio(first, second) {
  const luminance = (colour) => {
    const rgb = colour.startsWith("#")
      ? colour.slice(1).match(/../g).map((value) => parseInt(value, 16))
      : colour.match(/[\d.]+/g).slice(0, 3).map(Number);
    const linear = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function readOutline(locator, pseudo = "::before") {
  return locator.evaluate((element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    const canvas = element.closest("[data-page-canvas]");
    const scale = new DOMMatrixReadOnly(getComputedStyle(canvas).transform).a;
    return {
      padding: Math.abs(parseFloat(style.left)) * scale,
      width: parseFloat(style.borderLeftWidth) * scale * new DOMMatrixReadOnly(style.transform).a,
      radius: parseFloat(style.borderTopLeftRadius) * scale * new DOMMatrixReadOnly(style.transform).a,
      style: style.borderLeftStyle,
      colour: style.borderLeftColor,
      shadow: style.boxShadow,
      background: style.backgroundColor,
      pointerEvents: style.pointerEvents,
    };
  }, pseudo);
}

async function enterField(page, id) {
  await page.mouse.move(1, 1);
  await page.locator(`[id="${id}"]`).evaluate((element) => element.scrollIntoView({ block: "center" }));
  // Baseline text may have a zero-height layout box. Dispatch the production
  // pointer event while its glyph and the real overlay remain in the viewport.
  await page.locator(`[id="${id}"]`).dispatchEvent("pointerenter");
}

for (const width of [390, 834, 1280, 1920]) {
  for (const background of ["#FFFFFF", "#172C46"]) {
    test(`hover outlines remain separated on ${background} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const api = await installMockApi(page, { savedElements: outlineElements(background) });
      await login(page);
      await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();

      const authoredBefore = await page.locator("#projects-tools-body").evaluate((element) => ({
        text: element.textContent, left: element.style.left, top: element.style.top,
        width: element.style.width, height: element.style.height,
      }));
      for (const zoom of [140, 280]) {
        if (zoom === 280) {
          await page.evaluate(() => {
            const button = document.querySelector('[aria-label="Powiększ"]');
            for (let step = 0; step < 14; step += 1) button.click();
          });
        }
        const scrollExtent = await page.locator(".canvas-area").evaluate((element) => ({
          width: element.scrollWidth, height: element.scrollHeight,
          canvasWidth: element.querySelector("[data-page-canvas]").getBoundingClientRect().width,
        }));
        // The scaled A4 page, its ordinary gutters and the viewport determine
        // scroll width. An inverse-scaled pseudo-box must not add its larger
        // pre-transform width to the document's scrollable overflow.
        expect(scrollExtent.width).toBeLessThanOrEqual(Math.max(width, scrollExtent.canvasWidth + 120));
        for (const id of ["saved-name", "outline-title"]) {
          const field = page.locator(`[id="${id}"]`);
          await field.evaluate((element) => element.scrollIntoView({ block: "center" }));
          const box = await field.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const rect = range.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          });
          await page.mouse.move(box.x + Math.min(12, box.width / 2), box.y + box.height / 2);
          await expect(field).toHaveAttribute("data-editor-hover-outline", "true");
          await expect.poll(async () => (await readOutline(field, "::after")).style).toBe("solid");
          const fallback = await readOutline(field, "::after");
          expect(fallback).toMatchObject({ shadow: "none", pointerEvents: "none" });
          expect(fallback.width).toBeCloseTo(1, 1);
          expect(fallback.padding).toBeCloseTo(4, 1);
          expect(contrastRatio(fallback.colour, background)).toBeGreaterThanOrEqual(3);
        }
        for (const [id, level, padding] of [
          ["projects-heading", "section", 12],
          ["projects-tools-title", "entry", 8],
          ["skills-tools-title", "skills", 8],
          ["skills-tools-body", "skills", 8],
        ]) {
          await enterField(page, id);
          const outer = page.locator(`[data-canvas-highlight-level="${level}"]`);
          await expect(outer).toBeVisible();
          const appearance = await readOutline(outer);
          expect(appearance).toMatchObject({ style: "dotted", shadow: "none",
            background: "rgba(0, 0, 0, 0)", pointerEvents: "none" });
          expect(appearance.padding).toBeCloseTo(padding, 1);
          expect(appearance.width).toBeCloseTo(1, 1);
          expect(appearance.radius).toBeCloseTo(2, 1);
          expect(contrastRatio(appearance.colour, background)).toBeGreaterThanOrEqual(3);
          {
            const inner = page.locator('[data-canvas-element-highlight="true"]');
            await expect(inner).toBeVisible();
            const elementAppearance = await readOutline(inner);
            expect(elementAppearance).toMatchObject({ style: "solid", shadow: "none", pointerEvents: "none" });
            expect(elementAppearance.padding).toBeCloseTo(4, 1);
            expect(elementAppearance.width).toBeCloseTo(1, 1);
            expect(elementAppearance.colour).not.toBe(appearance.colour);
            expect(contrastRatio(elementAppearance.colour, background)).toBeGreaterThanOrEqual(3);
            const [outerBox, innerBox] = await Promise.all([outer.boundingBox(), inner.boundingBox()]);
            // Left edges share the record's content origin; compare the actual
            // painted boundaries to catch double outlines touching at any zoom.
            const visibleGap = innerBox.x - elementAppearance.padding - (outerBox.x - appearance.padding);
            expect(visibleGap).toBeGreaterThanOrEqual(padding - 4 - 0.2);
          }
          if (level === "entry") await page.screenshot({ path: testInfo.outputPath(`entry-${zoom}.png`) });
          expect(await page.locator(".canvas-area").evaluate((element) => ({
            width: element.scrollWidth, height: element.scrollHeight,
          }))).toEqual({ width: scrollExtent.width, height: scrollExtent.height });
          await page.locator(`[id="${id}"]`).dispatchEvent("pointerleave");
        }
      }
      expect(await page.locator("#projects-tools-body").evaluate((element) => ({
        text: element.textContent, left: element.style.left, top: element.style.top,
        width: element.style.width, height: element.style.height,
      }))).toEqual(authoredBefore);
      expect(api.calls.filter((call) => /render_pdf|create_pdf|update_pdf/.test(call.path))).toEqual([]);
      api.assertHermetic();
    });
  }
}
