import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

for (const width of [390, 1366]) {
  test(`save progress is explicit, bounded, and keyboard-modal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 760 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, editor_mode: "freeform" },
    });

    // Hold the backend response at the real persistence boundary so the modal
    // can be verified without relying on a synthetic animation duration.
    let releaseSave;
    const saveResponseGate = new Promise((resolve) => { releaseSave = resolve; });
    await page.route("**/api/pdf/update_pdf", async (route) => {
      await saveResponseGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: true, pdf_id: SAVED_DOCUMENT.id, revision: SAVED_DOCUMENT.revision + 1 }),
      });
    });

    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
    const saveButton = page.getByRole("button", { name: "Zapisz dokument", exact: true });
    await saveButton.click();

    const modal = page.getByRole("dialog", { name: "Zapisujemy Twoje CV" });
    await expect(modal).toBeVisible();
    await expect(modal).toBeFocused();
    await expect(page.getByText("Plik PDF nie zostanie teraz pobrany.", { exact: false })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Postęp zapisu CV" })).toHaveAttribute("aria-valuenow", "33");
    await expect(page.getByRole("progressbar", { name: "Postęp zapisu CV" })).toHaveAttribute("aria-valuenow", "67");
    await page.keyboard.press("Tab");
    await expect(modal).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
    await expect(modal).toBeFocused();

    const bounds = await modal.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(width === 390 ? 760 : 900);
    await page.screenshot({ path: `test-results/save-progress-${width}.png` });

    releaseSave();
    await expect(page.getByRole("status")).toContainText("Aktualny etap: Potwierdzenie wersji");
    await expect(modal).toBeHidden();
    await expect(saveButton).toBeFocused();
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    api.assertHermetic();
  });
}
