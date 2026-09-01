import { expect, test } from "@playwright/test";

test("skills category delete/re-add converges and the real Error Boundary hides details", async ({ page }) => {
  await page.goto("/e2e/harness.html");

  const categories = page.getByRole("list", { name: "Kategorie umiejętności" });
  await expect(categories.getByRole("listitem")).toHaveText(["Narzędzia", "Technologie"]);

  await page.getByRole("button", { name: "Usuń kategorię Narzędzia" }).click();
  await expect(categories.getByRole("listitem")).toHaveText(["Technologie"]);

  await page.getByRole("button", { name: "Dodaj kategorię Narzędzia ponownie" }).click();
  await expect(categories.getByRole("listitem")).toHaveText(["Technologie", "Narzędzia"]);
  // A stale tombstone used to trigger an endless React update here. Keeping
  // the page responsive after another effect turn proves synchronization has
  // converged without coupling the assertion to React's render count.
  await page.waitForTimeout(250);
  await expect(page.getByRole("button", { name: "Dodaj kategorię Narzędzia ponownie" })).toBeEnabled();

  await page.getByRole("button", { name: "Wywołaj błąd renderowania" }).click();
  await expect(page.getByRole("heading", { name: "Nie udało się wyświetlić edytora" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
  await expect(page.getByText("sensitive-render-detail-must-stay-hidden")).toHaveCount(0);

  await page.getByRole("button", { name: "Przywróć bezpieczny widok" }).click();
  await expect(page.getByText("Edytor testowy działa")).toBeVisible();
});
