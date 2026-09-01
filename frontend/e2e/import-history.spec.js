import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

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
