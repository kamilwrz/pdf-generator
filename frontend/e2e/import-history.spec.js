import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

test("an abandoned processing import can be cancelled or deleted with keyboard recovery", async ({ page }, testInfo) => {
  const api = await installMockApi(page, { imports: [{
    id: 137, filename: "CV6IMG.pdf", created_at: "2026-08-31T04:47:12Z",
    status: "processing", size_bytes: 570368, document_count: 0, error_code: null,
  }] });
  await login(page);
  await page.getByRole("button", { name: /Zaimportuj istniejące CV/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importuj CV" });
  await dialog.getByRole("button", { name: "Zobacz historię importów" }).click();
  const row = dialog.locator("article").filter({ hasText: "CV6IMG.pdf" });
  await expect(row.getByText(/Przetwarzanie/)).toBeVisible();
  const remove = row.getByRole("button", { name: "Usuń dane" });
  await remove.focus();
  await page.keyboard.press("Enter");
  const confirmation = row.getByRole("group");
  await expect(confirmation.getByRole("button", { name: "Anuluj" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(remove).toBeFocused();
  await expect(row).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(row.getByText(/nie zatrzymuje rozpoczętego odczytu/)).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // 640px also exercises the available layout width at 200% laptop zoom.
    for (const width of [390, 834, 1280, 1920, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(confirmation.getByRole("button", { name: "Usuń trwale" })).toBeInViewport();
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`processing-import-${width}.png`) });
    }
  }
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(row).toHaveCount(0);
  await expect(dialog.getByRole("status")).toHaveText("Import został usunięty z historii.");
  await expect(dialog.getByRole("region", { name: "Lista importów CV" })).toBeFocused();
  await dialog.getByRole("button", { name: "Odśwież status" }).click();
  await expect(row).toHaveCount(0);
  api.assertHermetic();
});

test("import history uses filenames and confirms deletion on desktop and mobile", async ({ page }, testInfo) => {
  const api = await installMockApi(page);
  await login(page);

  await page.getByRole("button", { name: /Zaimportuj istniejące CV/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importuj CV" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zobacz historię importów" }).click();

  await expect(dialog.getByText("CV-Kamil-Frontend-2026.pdf", { exact: true })).toBeVisible();
  await expect(dialog.getByText("CV-Kamil-starsze.pdf", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Import #\d+/)).toHaveCount(0);
  await expect(dialog.getByText(/Usługa była chwilowo niedostępna/)).toBeVisible();

  const firstRow = dialog.locator("article").filter({ hasText: "CV-Kamil-Frontend-2026.pdf" });
  await firstRow.getByRole("button", { name: "Usuń dane" }).click();
  const confirmation = firstRow.getByRole("group", {
    name: "Potwierdź usunięcie danych z pliku CV-Kamil-Frontend-2026.pdf",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "Anuluj" })).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "Usuń trwale" })).toBeVisible();

  const overflowElements = await dialog.evaluate((element) => (
    [element, ...element.querySelectorAll("*")]
      .filter((candidate) => candidate.scrollWidth > candidate.clientWidth + 1)
      .map((candidate) => ({
        className: candidate.className,
        clientWidth: candidate.clientWidth,
        scrollWidth: candidate.scrollWidth,
        tagName: candidate.tagName,
      }))
  ));
  expect(overflowElements).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("import-history-after.png") });

  await confirmation.getByRole("button", { name: "Usuń trwale" }).click();
  await expect(dialog.getByText("CV-Kamil-Frontend-2026.pdf", { exact: true })).toHaveCount(0);
  api.assertHermetic();
});
