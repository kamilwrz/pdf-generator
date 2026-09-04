import { expect, test } from "@playwright/test";
import { IMPORT_HISTORY, SAVED_DOCUMENT, installMockApi, login } from "./support/mockApi.js";

for (const width of [390, 834, 1280, 1920]) {
  test(`imported CV stays untitled until renamed at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    // History summaries omit CV content; selecting one fetches its owned detail.
    await page.route(`**/api/ai/imports/${IMPORT_HISTORY[0].id}`, (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...IMPORT_HISTORY[0], cv_data: SAVED_DOCUMENT.cv_data }),
    }));
    await login(page);
    await page.getByRole("button", { name: /Zaimportuj istniejące CV/ }).click();
    const dialog = page.getByRole("dialog", { name: "Importuj CV" });
    await dialog.getByRole("button", { name: "Zobacz historię importów" }).click();
    await dialog.locator("article").filter({ hasText: "CV-Kamil-Frontend-2026.pdf" })
      .getByRole("button", { name: "Utwórz CV", exact: true }).click();
    await dialog.getByRole("button", { name: /Monument/ }).click();
    await expect(dialog).toHaveCount(0);

    const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
    await expect(title).toHaveValue("");
    await expect(title).toHaveAttribute("placeholder", "Projekt bez tytułu");
    await page.getByRole("button", { name: /^Następny szablon:/ }).click();
    await expect(page.getByText("Szablon zmieniony", { exact: true })).toBeVisible();
    await expect(title).toHaveValue("");

    await page.getByRole("button", { name: "Zmień nazwę dokumentu" }).click();
    await expect(title).toBeFocused();
    await page.keyboard.type("Moje CV");
    const fillResponse = page.waitForResponse((response) => response.url().endsWith("/ai/fill_template"));
    await page.getByRole("button", { name: /^Następny szablon:/ }).click();
    await fillResponse;
    await expect(page.getByRole("button", { name: /^Następny szablon:/ })).toBeEnabled();
    await expect(title).toHaveValue("Moje CV");
    api.assertHermetic();
  });
}
