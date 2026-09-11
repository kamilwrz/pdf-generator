import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

for (const width of [390, 834, 1280, 1920]) {
  test(`saved CV: unchanged, reverted and saved edits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
    await expect(title).toHaveValue("CV Smoke");
    // Browser unload uses the same dirty decision as route/replacement guards.
    const unloadBlocked = () => page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(await unloadBlocked()).toBe(false);
    await title.fill("Zmienione CV");
    expect(await unloadBlocked()).toBe(true);
    await title.fill("CV Smoke");
    expect(await unloadBlocked()).toBe(false);
    // Entering and leaving an unchanged saved textarea must not reflow it.
    await page.locator('#skills-tools-body').dblclick();
    await title.click();
    expect(await unloadBlocked()).toBe(false);
    await title.fill("Zmienione CV");
    const exit = page.getByRole("button", { name: "Wyloguj się" });
    await exit.click();
    const dialog = page.getByRole("alertdialog", { name: "Niezapisane zmiany" });
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole("button", { name: "Wróć do edycji" });
    await expect(cancel).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(950);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(exit).toBeFocused();
    await expect(title).toHaveValue("Zmienione CV");
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    expect(await unloadBlocked()).toBe(false);
    await exit.click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    api.assertHermetic();
  });
}

test("failed save keeps edits and successful retry continues navigation", async ({ page }) => {
  const api = await installMockApi(page);
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
  await title.fill("CV do zapisania");
  await page.getByRole("button", { name: "Wyloguj się" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Niezapisane zmiany" });
  await page.route("**/api/pdf/update_pdf", (route) => route.fulfill({
    status: 409, contentType: "application/json",
    body: JSON.stringify({ detail: { code: "document_conflict", message: "Konflikt zapisu" } }),
  }));
  await dialog.getByRole("button", { name: "Zapisz i kontynuuj" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(title).toHaveValue("CV do zapisania");
  await expect(page).toHaveURL(/\/app\/documents\/41$/);
  await page.unroute("**/api/pdf/update_pdf");
  await dialog.getByRole("button", { name: "Zapisz i kontynuuj" }).click();
  await expect(page).toHaveURL(/\/$/);
  api.assertHermetic();
});

test("new CV explains that no account version exists at 200 percent text zoom", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await installMockApi(page);
  await login(page);
  await page.getByRole("button", { name: /Utwórz nowe CV/ }).click();
  const setup = page.getByRole("dialog", { name: "Utwórz CV" });
  await setup.getByRole("button", { name: "Rozpocznij edycję" }).click();
  await expect(setup).toHaveCount(0);
  await page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" }).fill("Nowe CV");
  await page.getByRole("button", { name: "Wyloguj się" }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const dialog = page.getByRole("alertdialog", { name: "Niezapisane CV" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("To CV nie zostało jeszcze zapisane na koncie")).toBeVisible();
  await expect(page.locator('[data-editor-inspector-state]')).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Odrzuć CV", exact: true })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(640);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(480);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/unsaved-new-zoom.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  api.assertHermetic();
});
