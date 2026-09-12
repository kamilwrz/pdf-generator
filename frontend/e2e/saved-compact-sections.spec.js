import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { cadenzaTemplate } from "../src/templates/cadenza.js";
import { installMockApi, SAVED_DOCUMENT } from "./support/mockApi.js";

test.setTimeout(90_000);

// Keep synthetic template content, but reproduce the healthy short-section
// geometry observed before the first density click in the reported saved CV.
// The two bands are 40.86 px apart, inside the 48 px accent recovery window.
const source = cadenzaTemplate.map((element, index) => {
  const next = { ...element, element_id: `compact-${index}` };
  if (element.fixedToPage || element.flowRole === "masthead") return next;
  if (element.top >= 700) next.top = 736.38 + (element.top - 700) * (20 / 26);
  else if (element.top >= 641) next.top = 695.52 + (element.top - 641) * (20 / 26);
  if (element.category === "text" && element.top >= 641) {
    next.top = (element.top < 700 ? 695.52 : 736.38) + 5.1;
  }
  if (element.category === "textarea" && element.top >= 641) {
    next.height = 10.86;
    next.lineHeight = 10.86;
    next.fontSize = 8.1;
    if (element.top < 700) next.content = "Office · Excel · PowerPoint";
  }
  return next;
});
const columns = new Set(["element_id", "category", "page", "left", "top", "width", "height",
  "content", "fontFamily", "fontSize", "color", "src", "backgroundColor", "img_id"]);
const rows = source.map((element, index) => {
  const row = { id: index + 1, extra_properties: {} };
  for (const [key, value] of Object.entries(element)) (columns.has(key) ? row : row.extra_properties)[key] = value;
  for (const key of columns) row[key] ??= null;
  if (row.src) row.src = `/api/template-assets/${row.src.split("/template-assets/")[1]}`;
  return row;
});
const pairs = source.filter((element) => element.category === "line" && element.flowRole === "section-chrome" && element.width > 120)
  .map((band) => ({ band: band.element_id,
    accent: source.find((element) => element.category === "line" && element.width === 3 && element.top === band.top).element_id,
    heading: source.find((element) => element.category === "text" && element.flowRole === "section-chrome"
      && element.top >= band.top && element.top < band.top + band.height).element_id }));
const skills = pairs.at(-2);
const skillsIds = source.filter((element) => element.top >= 695.52 && element.top < 736.38).map((element) => element.element_id);

for (const width of [390, 834, 1280, 1920]) {
  test(`saved short Skills keeps its own band through density, optimization and deletion at ${width}px`, async ({ page }) => {
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
    await page.getByRole("button", { name: "Dostosuj CV", exact: true }).click();

    let saves = 0;
    async function saveSnapshot() {
      await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
      await expect.poll(() => api.calls.filter((call) => call.path === "/pdf/update_pdf").length).toBe(++saves);
      await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Zapisz dokument", exact: true })).toBeEnabled();
      // Update payloads carry tombstones alongside live rows. Match the API's
      // live-element interpretation when checking the resulting document.
      return JSON.parse(api.calls.filter((call) => call.path === "/pdf/update_pdf").at(-1).body).root
        .filter((element) => !element.deleted);
    }
    let elements;
    for (const action of ["Kompaktowa", "Standardowa", "Kompaktowa", "optimize"]) {
      if (action === "optimize") await page.getByRole("button", { name: "Zoptymalizuj układ dokumentu", exact: true }).click();
      else {
        await page.getByRole("radio", { name: action, exact: true }).press("Enter");
        await expect(page.getByRole("radio", { name: action, exact: true })).toHaveAttribute("aria-checked", "true");
      }
      elements = await saveSnapshot();
      for (const pair of pairs) {
        const band = elements.find((element) => element.element_id === pair.band);
        const heading = elements.find((element) => element.element_id === pair.heading);
        const accent = elements.find((element) => element.element_id === pair.accent);
        expect(heading.page).toBe(band.page);
        expect(heading.top - band.top).toBeCloseTo(5.1, 1);
        expect([accent.page, accent.top]).toEqual([band.page, band.top]);
      }
    }
    await page.getByRole("complementary", { name: "Dostosuj CV", exact: true })
      .getByRole("button", { name: "Zamknij", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Dostosuj CV", exact: true })).toBeHidden();
    await page.screenshot({ path: `../tmp/compact-sections-${width}.png` });
    if (elements.find((element) => element.element_id === skills.heading).page === 2) {
      await page.getByRole("button", { name: "Następna strona", exact: true }).click();
    }
    // Revealing the off-screen heading scrolls the compact canvas. Park the
    // pointer outside it so a record passing underneath cannot claim the
    // hover toolbar before the keyboard action reaches the intended heading.
    await page.mouse.move(0, 0);
    const skillsHeading = page.locator(`[id="${skills.heading}"]`);
    await skillsHeading.scrollIntoViewIfNeeded();
    await skillsHeading.focus();
    const sectionToolbar = page.locator(`[data-canvas-toolbar-key="heading:${skills.heading}"]`);
    await expect(sectionToolbar.getByRole("button", { name: "Więcej działań", exact: true })).toBeVisible();
    await sectionToolbar.getByRole("button", { name: "Więcej działań", exact: true }).press("Enter");
    await sectionToolbar.getByRole("menuitem", { name: "Usuń sekcję", exact: true }).press("Enter");
    await expect(page.locator(`[id="${skills.heading}"]`)).toHaveCount(0);
    const remaining = await saveSnapshot();
    for (const element of source) {
      expect(remaining.some((candidate) => candidate.element_id === element.element_id), element.element_id)
        .toBe(!skillsIds.includes(element.element_id));
    }
    api.assertHermetic();
  });
}
