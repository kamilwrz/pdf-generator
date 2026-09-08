import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mockApi.js";

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 950 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 640, height: 400 }]) {
  test(`fullscreen setup preserves choices and fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await page.goto("/cvstudio/guest?start=new");
    const setup = page.getByRole("dialog", { name: "Skonfiguruj nowe CV" });
    await expect(setup).toBeVisible();
    expect(await setup.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
    const checkLayout = async () => {
      const overflow = await setup.evaluate((dialog) => Array.from(dialog.querySelectorAll("*"))
        .filter((element) => element.clientWidth > 0 && getComputedStyle(element).overflowX === "auto" && element.scrollWidth > element.clientWidth));
      expect(overflow).toHaveLength(0);
      expect(await setup.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    };
    await checkLayout();
    const meridian = setup.getByRole("radio", { name: /Meridian/ });
    await expect(meridian).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(setup.getByRole("radio", { name: /Linden/ })).toBeChecked();
    await setup.getByRole("button", { name: "Dalej: kontakt" }).click();
    await expect(setup.getByRole("heading", { name: "Zacznij od najważniejszych danych." })).toBeFocused();
    await setup.getByRole("checkbox", { name: /Zdjęcie/ }).check();
    await setup.getByRole("checkbox", { name: "LinkedIn" }).check();
    await checkLayout();
    await setup.getByRole("button", { name: "Dalej: sekcje" }).click();
    await setup.getByLabel(/Własna sekcja/).fill("Konferencje");
    await setup.getByRole("button", { name: "Dodaj", exact: true }).click();
    await expect(setup.getByLabel(/Własna sekcja/)).toBeFocused();
    await setup.getByRole("button", { name: "Przenieś Konferencje wyżej" }).click();
    await checkLayout();
    await setup.getByRole("button", { name: "Wstecz" }).click();
    await expect(setup.getByRole("checkbox", { name: /Zdjęcie/ })).toBeChecked();
    await expect(setup.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked();
    await setup.getByRole("button", { name: "Dalej: sekcje" }).click();
    await expect(setup.getByRole("checkbox", { name: "Konferencje" })).toBeChecked();
    const create = setup.getByRole("button", { name: "Utwórz A4" });
    const box = await create.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await create.focus();
    await page.keyboard.press("Tab");
    await expect(setup.getByRole("button", { name: "Zamknij: Skonfiguruj nowe CV" })).toBeFocused();
    await create.click();
    await expect(setup).toHaveCount(0);
    await expect(page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]')).toBeFocused();
    api.assertHermetic();
  });
}

test("captures full-size and compact setup for visual review", async ({ page }) => {
  await installMockApi(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cvstudio/guest?start=new");
  const setup = page.getByRole("dialog", { name: "Skonfiguruj nowe CV" });
  await expect(setup).toBeVisible();
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await setup.getByRole("button", { name: /01 Szablon/ }).click();
    await page.screenshot({ path: `../tmp/setup-redesign-${width}-templates.png` });
    await setup.getByRole("button", { name: "Dalej: kontakt" }).click();
    await page.screenshot({ path: `../tmp/setup-redesign-${width}-contact.png` });
    await setup.getByRole("button", { name: "Dalej: sekcje" }).click();
    await page.screenshot({ path: `../tmp/setup-redesign-${width}-sections.png` });
  }
  await page.emulateMedia({ media: "print" });
  await expect(setup).not.toBeVisible();
});
