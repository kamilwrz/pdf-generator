import { expect, test } from "@playwright/test";
import { TEST_TEMPLATES } from "../src/templates/testTemplatePacks.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";
import { readFile } from "node:fs/promises";

// Browser-native title bubbles cannot share app colours or keyboard styling.
// Check the actual pseudo-element after its delay and account for A4 scaling.
async function expectCanvasTooltip(control, keyboard = false) {
  if (keyboard) { await control.press("Tab"); await control.focus(); }
  else await control.hover();
  await expect(control).not.toHaveAttribute("title");
  await expect.poll(() => control.evaluate((node) => getComputedStyle(node, "::after").visibility)).toBe("visible");
  const tooltip = await control.evaluate((node) => {
    const style = getComputedStyle(node, "::after");
    const canvas = node.closest("[data-page-canvas]");
    const scale = canvas ? canvas.getBoundingClientRect().width / canvas.offsetWidth : 1;
    return { background: style.backgroundColor, color: style.color,
      fontSize: Number.parseFloat(style.fontSize) * scale, content: style.content };
  });
  expect(tooltip.background).toBe("rgb(103, 78, 62)");
  expect(tooltip.color).toBe("rgb(255, 255, 255)");
  expect(tooltip.fontSize).toBeCloseTo(12, 1);
  expect(tooltip.content).toBe(JSON.stringify(await control.getAttribute("data-tooltip")));
}

for (const template of TEST_TEMPLATES) {
  test(`${template.id}: title hide/show restores contact rows`, async ({ page }) => {
    let nextId = 0;
    const elements = materializeElementSpecs(template.elements, () => `masthead-${++nextId}`);
    const title = elements.find((element) => element.mastheadRole === "title");
    Object.assign(title, { content: "", placeholder: "Tytuł zawodowy", starterPlaceholder: true,
      cvDataBindings: [{ path: ["title"], placeholder: "Tytuł zawodowy" }] });
    // Saved CVs can have a tighter first contact row than the generator's
    // reconstruction descriptor. Exercise that geometry, not only demo packs.
    const lowerContacts = elements.filter((element) => element.contactChannel && element.top > title.top);
    const firstRow = Math.min(...lowerContacts.map((element) => element.top));
    const contraction = Math.min(6, Math.max(0, firstRow - title.top - 1));
    lowerContacts.forEach((element) => { element.top -= contraction; });
    const contacts = elements.filter((element) => element.contactChannel && element.category === "text");
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, template_id: template.id },
      savedElements: elements.map((element) => ({ ...element, extra_properties: { ...element } })),
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      const body = await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url));
      await route.fulfill({ body, contentType: "image/png" });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
    const field = page.locator(`[id="${title.element_id}"]`);
    await expect(field).toBeVisible();
    const positions = async () => Promise.all(contacts.map((element) =>
      page.locator(`[id="${element.element_id}"]`).evaluate((node) => Number.parseFloat(node.style.top))));
    const before = await positions();
    expect(before.every(Number.isFinite)).toBe(true);
    await field.hover();
    await page.getByRole("button", { name: "Ukryj stanowisko", exact: true }).click();
    await page.getByRole("button", { name: "Dodaj stanowisko", exact: true }).click();
    await expect.poll(positions).toEqual(before);
    await expect(page.locator('[data-placeholder="Tytuł zawodowy"]')).toHaveCount(1);
    if (template.id === "regent") {
      test.setTimeout(60_000);
      while (!await page.getByText("200%", { exact: true }).isVisible()) {
        await page.getByRole("button", { name: "Powiększ", exact: true }).click();
      }
      for (const width of [390, 834, 1366, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.locator('[data-placeholder="Tytuł zawodowy"]').hover();
        await page.getByRole("button", { name: "Ukryj stanowisko", exact: true }).click();
        await page.getByRole("button", { name: "Dodaj stanowisko", exact: true }).click();
        await expect.poll(positions).toEqual(before);
      }
      await page.screenshot({ path: test.info().outputPath("regent-restored.png") });
    }
    api.assertHermetic();
  });
}

// Exercise the screenshot regression with the photo and title both hidden.
// Compare screen-space controls with authored geometry, not their CSS offsets.
for (const width of [390, 834, 1366, 1920]) {
  test(`Slate identity control placement at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let nextId = 0;
    const template = TEST_TEMPLATES.find((item) => item.id === "slate");
    const elements = materializeElementSpecs(template.elements, () => `placement-${++nextId}`);
    const name = elements.find((item) => item.mastheadRole === "name");
    const title = elements.find((item) => item.mastheadRole === "title");
    const titleArea = elements.find((item) => item.mastheadRole === "title-decoration");
    const photo = elements.find((item) => item.photoSlot === "frame");
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, template_id: "slate" },
      savedElements: elements.map((item) => ({ ...item, extra_properties: { ...item } })),
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({
        body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)),
        contentType: "image/png",
      });
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
    await page.locator(`[id="${title.element_id}"]`).dispatchEvent("pointerenter");
    await expectCanvasTooltip(page.getByRole("button", { name: "Ukryj stanowisko", exact: true }));
    await page.getByRole("button", { name: "Ukryj stanowisko", exact: true }).click();
    await page.locator(`[id="${photo.element_id}"]`).dispatchEvent("pointerenter");
    await expectCanvasTooltip(page.getByRole("button", { name: "Ukryj slot zdjęcia profilowego" }));
    await page.getByRole("button", { name: "Ukryj slot zdjęcia profilowego" }).click();
    const add = page.getByRole("button", { name: "Dodaj stanowisko", exact: true });
    const restore = page.getByRole("button", { name: "Pokaż slot zdjęcia profilowego" });
    const field = page.locator(`[id="${name.element_id}"]`);
    for (const zoom of [100, 160, 200]) {
      // Zoom steps are 10%; the guard fails clearly if the toolbar contract changes.
      for (let step = 0; step < 20 && !await page.getByText(`${zoom}%`, { exact: true }).isVisible(); step++) {
        const current = Number.parseInt(await page.getByText(/^\d+%$/).textContent(), 10);
        await page.getByRole("button", { name: current > zoom ? "Pomniejsz" : "Powiększ", exact: true }).click();
      }
      await expect(page.getByText(`${zoom}%`, { exact: true })).toBeVisible();
      await expectCanvasTooltip(add);
      await expectCanvasTooltip(restore);
      const canvas = await field.evaluate((node) => {
        const canvas = node.closest("[data-page-canvas]");
        const rect = canvas.getBoundingClientRect();
        return { left: rect.left, top: rect.top, scale: rect.width / canvas.clientWidth };
      });
      const plus = await add.boundingBox();
      expect(plus.x + plus.width / 2).toBeCloseTo(canvas.left + (titleArea.left + titleArea.width / 2) * canvas.scale, 0);
      expect(plus.y + plus.height / 2).toBeCloseTo(canvas.top + (titleArea.top + titleArea.height / 2) * canvas.scale, 0);
      const photoControl = await restore.evaluate((node) => {
        const rect = node.parentElement.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, bottom: rect.bottom };
      });
      expect(photoControl.x + photoControl.width / 2).toBeCloseTo(canvas.left + (photo.left + photo.width / 2) * canvas.scale, 0);
      expect(photoControl.bottom).toBeLessThan(canvas.top + photo.top * canvas.scale);
      await field.dispatchEvent("pointerenter");
      const toggle = page.getByRole("button", { name: /^(Włącz|Wyłącz) wielkie litery$/ });
      await expect(toggle).toBeVisible();
      await expectCanvasTooltip(toggle, true);
      const separation = await toggle.evaluate((node, nameId) => {
        const range = document.createRange();
        range.selectNodeContents(document.getElementById(nameId));
        const name = range.getBoundingClientRect();
        const control = node.parentElement.getBoundingClientRect();
        return { horizontal: name.left - control.right, vertical: name.top - control.bottom };
      }, name.element_id);
      expect(Math.max(separation.horizontal, separation.vertical)).toBeCloseTo(8, 0);
      expect(plus.height).toBeCloseTo(24, 0);
      await toggle.focus();
      await toggle.press("Enter");
      await expect(field).toHaveCSS("text-transform", "none");
      await toggle.press("Enter");
      await expect(field).toHaveCSS("text-transform", "uppercase");
      if (zoom === 160) await page.screenshot({ path: test.info().outputPath("identity-controls.png") });
    }
    await restore.focus();
    await restore.press("Enter");
    await expect(restore).toHaveCount(0);
    await expect(page.locator(`[id="${photo.element_id}"]`)).toBeVisible();
    await add.focus();
    await add.press("Enter");
    await expect(add).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    api.assertHermetic();
  });
}
