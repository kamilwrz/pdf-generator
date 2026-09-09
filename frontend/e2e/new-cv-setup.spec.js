import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 950 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 640, height: 400 }]) {
  test(`fullscreen setup preserves choices and fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await page.goto("/cvstudio/guest?start=new");
    const setup = page.getByRole("dialog", { name: "Utwórz CV" });
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
    await setup.getByRole("button", { name: "Dostosuj zawartość" }).click();
    await setup.getByRole("checkbox", { name: /Zdjęcie/ }).check();
    await setup.getByRole("button", { name: "Dodaj linki" }).click();
    await setup.getByRole("checkbox", { name: "LinkedIn" }).check();
    await checkLayout();
    await setup.getByLabel(/Własna sekcja/).fill("Konferencje");
    await setup.getByRole("button", { name: "Dodaj", exact: true }).click();
    await expect(setup.getByLabel(/Własna sekcja/)).toBeFocused();
    await setup.getByRole("button", { name: "Przenieś Konferencje wyżej" }).click();
    await checkLayout();
    await setup.getByRole("button", { name: "Dostosuj zawartość" }).click();
    await expect(setup.getByRole("checkbox")).toHaveCount(0);
    await setup.getByRole("button", { name: "Dostosuj zawartość" }).click();
    await expect(setup.getByRole("checkbox", { name: /Zdjęcie/ })).toBeChecked();
    await expect(setup.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked();
    await expect(setup.getByRole("checkbox", { name: "Konferencje" })).toBeChecked();
    const create = setup.getByRole("button", { name: "Rozpocznij edycję" });
    const box = await create.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await create.focus();
    await page.keyboard.press("Tab");
    await expect(setup.getByRole("button", { name: "Zamknij: Utwórz CV" })).toBeFocused();
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
  const setup = page.getByRole("dialog", { name: "Utwórz CV" });
  await expect(setup).toBeVisible();
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await page.screenshot({ path: `../tmp/setup-simple-${width}-templates.png` });
    await setup.getByRole("button", { name: "Dostosuj zawartość" }).click();
    await page.screenshot({ path: `../tmp/setup-simple-${width}-settings.png` });
    await setup.getByRole("button", { name: "Dostosuj zawartość" }).click();
    await setup.getByRole("radio", { name: /Meridian/ }).focus();
  }
  await page.emulateMedia({ media: "print" });
  await expect(setup).not.toBeVisible();
});

for (const width of [390, 834, 1280, 1920, 640]) {
  for (const action of ["cancel", "close", "escape"]) {
    test(`guest setup ${action} returns to landing at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 640 ? 400 : 950 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const api = await installMockApi(page);
      await page.goto("/");
      await page.locator("#top").getByRole("link", { name: "Użyj tego szablonu" }).click();
      const setup = page.getByRole("dialog", { name: "Utwórz CV" });
      await expect(setup).toBeVisible();
      if (action === "cancel") {
        await setup.getByRole("button", { name: "Anuluj", exact: true }).click();
      } else if (action === "close") {
        await setup.getByRole("button", { name: "Zamknij: Utwórz CV" }).click();
      } else {
        await setup.getByRole("button", { name: "Dostosuj zawartość" }).click();
        await page.keyboard.press("Escape");
      }
      await expect(page).toHaveURL("/");
      await expect(page.locator("#top")).toBeVisible();
      await expect(page.getByRole("button", { name: "Nowe CV", exact: true })).toHaveCount(0);
      expect(api.calls.filter((call) => /fill_template|create_pdf|update_pdf/.test(call.path))).toEqual([]);
      expect(await page.evaluate(() => localStorage.getItem("cvstudio.guest.doc"))).toBeNull();
      // Replacing the editor history entry prevents Back from exposing its
      // empty freeform state after the start query has been consumed.
      await page.goBack();
      await expect(page).toHaveURL("/");
      api.assertHermetic();
    });
  }
}

test("guest direct setup dismissal has a landing fallback", async ({ page }) => {
  const api = await installMockApi(page);
  await page.goto("/cvstudio/guest?start=new");
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(page).toHaveURL("/");
  api.assertHermetic();
});

test("cancelling replacement preserves the guest document on landing", async ({ page }) => {
  const api = await installMockApi(page);
  await page.goto("/cvstudio/guest?start=new");
  await page.getByRole("button", { name: "Rozpocznij edycję", exact: true }).click();
  await expect(page).toHaveURL(/\/cvstudio\/guest$/);
  const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
  await title.fill("Zachowany szkic");
  await page.getByRole("button", { name: "Nowe CV", exact: true }).click();
  await page.getByRole("dialog", { name: "Utworzyć nowe CV?" })
    .getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(page).toHaveURL("/");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cvstudio.guest.doc"))?.title)).toBe("Zachowany szkic");
  await page.goto("/cvstudio/guest");
  await expect(title).toHaveValue("Zachowany szkic");
  api.assertHermetic();
});

test("authenticated setup cancellation retains account onboarding", async ({ page }) => {
  const api = await installMockApi(page);
  await login(page);
  await page.goto("/cvstudio/Kamil?start=new");
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(page).toHaveURL(/\/cvstudio\/Kamil$/);
  await expect(page.getByRole("heading", { name: "Jak chcesz zacząć?" })).toBeVisible();
  api.assertHermetic();
});

test("pending creation traps focus and failed creation retains settings for retry", async ({ page }) => {
  const api = await installMockApi(page);
  let releaseFailure;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  await page.route("**/api/ai/fill_template", async (route) => {
    await failureGate;
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "Nie udało się utworzyć CV." }) });
  }, { times: 1 });
  await page.goto("/cvstudio/guest?start=new&template=linden");
  const setup = page.getByRole("dialog", { name: "Utwórz CV" });
  await setup.getByRole("button", { name: "Dostosuj zawartość" }).click();
  await setup.getByRole("checkbox", { name: "Telefon" }).uncheck();
  await setup.getByRole("button", { name: "Rozpocznij edycję" }).click();
  await expect(setup.getByRole("button", { name: "Tworzenie CV…" })).toBeDisabled();
  const close = setup.getByRole("button", { name: "Zamknij: Utwórz CV" });
  await close.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(setup).toBeVisible();
  releaseFailure();
  await expect(setup.getByRole("alert")).toBeVisible();
  await expect(setup.getByRole("checkbox", { name: "Telefon" })).not.toBeChecked();
  await setup.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]')).toBeFocused();
  api.assertHermetic();
});

test("compact preselection, optional preview and failed images keep the primary action usable", async ({ page }) => {
  const api = await installMockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/template-mockups/**", (route) => route.abort());
  await page.goto("/cvstudio/guest?start=new&template=linden");
  const setup = page.getByRole("dialog", { name: "Utwórz CV" });
  await expect(setup.getByRole("radio")).toHaveCount(0);
  await expect(setup.getByText("Podgląd niedostępny")).not.toBeVisible();
  const preview = setup.getByRole("button", { name: "Podgląd szablonu" });
  await preview.focus();
  await page.keyboard.press("Enter");
  await expect(preview).toHaveAttribute("aria-expanded", "true");
  await expect(setup.getByText("Podgląd niedostępny")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(preview).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: "../tmp/setup-simple-390-preselected.png" });
  await setup.getByRole("button", { name: "Rozpocznij edycję" }).click();
  await expect(setup).toHaveCount(0);
  api.assertHermetic();
});
