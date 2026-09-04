import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

for (const width of [390, 834, 1366, 1920]) {
  const height = width === 390 ? 760 : (width === 1920 ? 1080 : 900);
  test(`save progress is explicit, bounded, and keyboard-modal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
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
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `test-results/save-progress-${width}.png` });

    releaseSave();
    await expect(page.getByRole("status")).toContainText("Aktualny etap: Potwierdzenie wersji");
    await expect(modal).toBeHidden();
    await expect(saveButton).toBeFocused();
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    api.assertHermetic();
  });

  test(`download progress follows real handoff stages and stays bounded at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, editor_mode: "freeform" },
    });

    // Hold the binary response at the rendering boundary. The first stage can
    // finish while the request proceeds, but the final stage is allowed only
    // after Chromium has received and accepted the download handoff.
    let releaseRender;
    const renderResponseGate = new Promise((resolve) => { releaseRender = resolve; });
    await page.route("**/api/pdf/render_pdf", async (route) => {
      await renderResponseGate;
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "Content-Disposition": "attachment; filename*=UTF-8''CV%20Smoke.pdf" },
        body: "%PDF-1.4\n% local staged-download fixture\n%%EOF",
      });
    });

    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
    const downloadButton = page.getByRole("button", { name: "Pobierz PDF", exact: true });
    await downloadButton.click();

    const modal = page.getByRole("dialog", { name: "Przygotowujemy plik PDF" });
    const progress = modal.getByRole("progressbar", { name: "Postęp pobierania CV" });
    await expect(modal).toBeVisible();
    await expect(modal).toBeFocused();
    await expect(modal.getByText("Projekt w edytorze i Moich dokumentach pozostanie bez zmian.", { exact: false })).toBeVisible();
    await expect(progress).toHaveAttribute("aria-valuenow", "33");
    await expect(progress).toHaveAttribute("aria-valuenow", "67");
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
    await expect(modal).toBeFocused();

    const bounds = await modal.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    const downloadEvent = page.waitForEvent("download");
    releaseRender();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("CV Smoke.pdf");
    await expect(progress).toHaveAttribute("aria-valuenow", "100");
    await expect(modal.getByRole("status")).toContainText("Aktualny etap: Rozpoczęcie pobierania");
    await expect(modal).toBeHidden();
    await expect(downloadButton).toBeFocused();
    await expect(page.getByText("CV gotowe do pobrania", { exact: true })).toBeVisible();
    api.assertHermetic();
  });
}
