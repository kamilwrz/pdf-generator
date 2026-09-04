import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_ELEMENTS } from "./support/mockApi.js";

const extraElements = [
  { element_id: "contacts-anchor", category: "text", content: "", left: 0, top: 0,
    width: 0, height: 0, flowRole: "masthead-anchor", contactBandId: "contacts",
    contactBand: { id: "contacts", mode: "wrapping", order: ["email", "phone"] } },
  { element_id: "contact-email", category: "text", content: "email@example.com",
    left: 250, top: 140, width: 140, height: 16, fontSize: 10,
    contactBandId: "contacts", contactChannel: "email" },
  { element_id: "languages-heading", category: "text", content: "JĘZYKI",
    left: 250, top: 370, width: 280, height: 16, fontSize: 10, bold: true,
    flowRole: "section-chrome", editorSectionLayout: "grid", gridKind: "languages" },
  { element_id: "language-item", category: "textarea", content: "Polski · C2",
    left: 250, top: 400, width: 136, height: 18, fontSize: 10, lineHeight: 14,
    flowRole: "grid-member", flowGroup: "language-row", gridKind: "languages",
    editorGridEntry: true, editorSectionId: "languages-heading" },
].map((element) => ({ ...element, page: 1, extra_properties: { ...element } }));

// Compare computed appearance across both toolbar implementations. Screenshots
// capture the actual open form, including its canvas context and viewport fit.
for (const width of [390, 834, 1280, 1920]) {
  test(`canvas toolbar appearance and skill form at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page, { savedElements: [...SAVED_ELEMENTS, ...extraElements] });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    const checkControl = async (control, size, danger = false) => {
      await expect(control).toBeVisible();
      await control.hover();
      const appearance = await control.evaluate((el) => {
        const style = getComputedStyle(el);
        const shell = getComputedStyle(el.parentElement);
        return {
          size: el.getBoundingClientRect().height, radius: style.borderRadius,
          color: style.color, hover: style.backgroundColor,
          border: shell.borderColor, surface: shell.backgroundColor,
          shellRadius: shell.borderRadius,
        };
      });
      expect(appearance.size).toBeCloseTo(size, 0);
      expect(appearance).toMatchObject({
        radius: "0px", shellRadius: "0px", border: "rgb(201, 197, 188)",
        surface: "rgb(255, 255, 255)", hover: "rgb(236, 232, 223)",
        color: danger ? "rgb(180, 35, 24)" : "rgb(103, 78, 62)",
      });
    };

    // Authored single-line text has a zero-height baseline box for PDF parity.
    // Dispatch its normal hover event; measure/click the actual toolbar DOM.
    await page.locator("#skills-heading").dispatchEvent("pointerenter");
    await checkControl(page.locator('[data-canvas-toolbar-key="heading:skills-heading"] button').first(), 28.8);
    await expect(page.locator('[data-canvas-toolbar-key="heading:skills-heading"]').getByRole("button", { name: "AI dla wybranego zakresu" })).toBeVisible();
    await page.locator("#skills-tools-title").hover();
    await checkControl(page.locator('[data-canvas-toolbar-key="record:skills-tools-title"] button').first(), 28.8);
    await expect(page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]').getByRole("button", { name: "AI dla wybranego zakresu" })).toBeVisible();
    await page.locator("#contact-email").dispatchEvent("pointerenter");
    await checkControl(page.getByRole("button", { name: "Dodaj kontakt", exact: true }), 24);
    await page.locator("#contact-email").dispatchEvent("pointerenter");
    await checkControl(page.getByRole("button", { name: /Usuń kontakt:/ }), 24, true);
    await page.locator("#language-item").hover();
    await checkControl(page.locator('[data-canvas-toolbar-key="grid-entry:language-item"] button').first(), 24);
    await expect(page.locator('[data-canvas-toolbar-key="grid-entry:language-item"] button')).toHaveCount(2);

    const body = page.locator("#skills-tools-body");
    await body.focus();
    await body.press("Shift+F10");
    const toolbar = page.locator('[data-canvas-toolbar-key="skills-entry:skills-heading:skills-tools"]');
    const add = toolbar.getByRole("button", { name: /Dodaj umiejętność do kategorii/ });
    await expect(add).toBeFocused();
    await expect(toolbar.getByRole("button")).toHaveCount(1);
    await checkControl(add, 24);
    await add.press("Enter");
    const input = toolbar.getByRole("textbox", { name: "Dodaj umiejętność" });
    await expect(input).toBeFocused();
    const submit = toolbar.getByRole("button", { name: "Dodaj umiejętność", exact: true });
    await expect(submit).toBeDisabled();
    const form = toolbar.locator("form");
    await expect.poll(async () => {
      const box = await form.boundingBox();
      return box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 1000;
    }).toBe(true);
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
    expect(await input.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Arial");
    await input.fill("figma");
    await input.press("Enter");
    await expect(toolbar.getByRole("alert")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await input.fill("Analiza danych");
    await expect(toolbar.getByRole("alert")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("skills-form.png") });
    await input.press("Escape");
    await expect(add).toBeFocused();
    await add.press("Enter");
    await input.fill("Analiza danych");
    await input.press("Enter");
    await expect(body).toContainText("Analiza danych");
    api.assertHermetic();
  });
}
