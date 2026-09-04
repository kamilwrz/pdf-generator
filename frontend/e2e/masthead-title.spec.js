import { expect, test } from "@playwright/test";
import { TEST_TEMPLATES } from "../src/templates/testTemplatePacks.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";
import { readFile } from "node:fs/promises";

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
