import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { cadenzaTemplate } from "../src/templates/cadenza.js";
import { installMockApi, SAVED_DOCUMENT } from "./support/mockApi.js";

test.setTimeout(60_000);

// Nullable database columns and missing legacy decoration metadata exercise
// the actual owned-document hydration route, rather than a fresh template.
const columns = new Set(["element_id", "category", "page", "left", "top", "width", "height",
  "content", "fontFamily", "fontSize", "color", "src", "backgroundColor", "img_id"]);
const source = cadenzaTemplate.map((element, index) => ({ ...element, element_id: `density-${index}` }));
const rows = source.map((element, index) => {
  const row = { id: index + 1, extra_properties: {} };
  for (const [key, value] of Object.entries(element)) (columns.has(key) ? row : row.extra_properties)[key] = value;
  for (const key of columns) row[key] ??= null;
  if (element.category === "line" && element.flowRole === "section-chrome") delete row.extra_properties.flowRole;
  if (row.src) row.src = `/api/template-assets/${row.src.split("/template-assets/")[1]}`;
  return row;
});
const bands = source.filter((element) => element.category === "line" && element.flowRole === "section-chrome" && element.width > 120)
  .map((band) => ({ band: band.element_id, heading: source.find((element) => element.category === "text"
    && element.flowRole === "section-chrome" && element.top >= band.top && element.top < band.top + band.height).element_id }));

for (const width of [390, 834, 1280, 1920]) {
  test(`saved Cadenza density preserves heading bands at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("token", "local-playwright-token");
      localStorage.setItem("username", "Kamil");
      localStorage.setItem("cvstudio.uiLanguage", "pl");
    });
    const document = { ...SAVED_DOCUMENT, template_id: "cadenza", cv_data: null };
    const api = await installMockApi(page, { savedDocument: document, documents: [document], savedElements: rows });
    await page.route("**/api/template-assets/**", (route) => route.fulfill({
      path: fileURLToPath(new URL(`../../backend/template_assets/${route.request().url().split("/template-assets/")[1]}`, import.meta.url)),
    }));
    await page.goto("/app/documents/41");
    await expect(page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" })).toHaveValue("CV Smoke", { timeout: 25_000 });
    // Legacy metadata repair must not manufacture unsaved changes on open.
    expect(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(false);
    await page.getByRole("button", { name: "Dostosuj CV", exact: true }).click();
    for (const density of ["Kompaktowa", "Standardowa", "Kompaktowa"]) {
      const choice = page.getByRole("radio", { name: density, exact: true });
      await choice.focus();
      await page.keyboard.press("Enter");
      await expect(choice).toHaveAttribute("aria-checked", "true");
    }
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    await expect.poll(() => api.calls.filter((call) => call.path === "/pdf/update_pdf").length).toBe(1);
    const payload = JSON.parse(api.calls.find((call) => call.path === "/pdf/update_pdf").body);
    for (const pair of bands) {
      const band = payload.root.find((element) => element.element_id === pair.band);
      const heading = payload.root.find((element) => element.element_id === pair.heading);
      expect(band.flowRole).toBe("section-chrome");
      expect(heading.page).toBe(band.page);
      expect(heading.top - band.top).toBeCloseTo(5.1, 1);
    }
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    await page.screenshot({ path: `../tmp/saved-density-${width}.png` });
    api.assertHermetic();
  });
}
