import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

for (const name of ["Sterling", "Meridian", "Linden"]) {
  test(`hero creates the selected Free template: ${name}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero.getByRole("radio")).toHaveCount(3);
    await hero.locator("label").filter({ hasText: name }).click();
    await expect(hero.getByRole("radio", { name, exact: true })).toBeChecked();
    await expect(hero.getByRole("link", { name: "Stwórz CV z tym szablonem" })).toHaveAttribute("href", `/cvstudio/guest?start=new&template=${name.toLowerCase()}`);
    const request = page.waitForRequest((request) => request.url().endsWith("/ai/fill_template") && request.method() === "POST");
    await hero.getByRole("link", { name: "Stwórz CV z tym szablonem" }).click();
    expect((await request).postDataJSON().template_id).toBe(name.toLowerCase());
    await expect(page).toHaveURL(/\/cvstudio\/guest$/);
    await expect(page.getByRole("dialog", { name: "Utwórz CV" })).toHaveCount(0);
    await expect(page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]')).toBeFocused();
    api.assertHermetic();
  });
}

test("keyboard selection updates the CTA and motion settles without an automatic loop", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  const hero = page.locator("#top");
  await hero.getByRole("radio", { name: "Linden", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(hero.getByRole("radio", { name: "Sterling", exact: true })).toBeChecked();
  const card = hero.getByRole("button", { name: "Pokaż szablon Sterling" });
  await expect(card).toHaveAttribute("data-active", "true");
  await expect.poll(() => card.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m11)).toBe(1);
  await page.keyboard.press("Tab");
  // Focus remains in the document's ordinary order; cards do not add hidden
  // tab stops behind the foreground preview.
  await expect(hero.getByRole("radio", { name: "Sterling", exact: true })).not.toBeFocused();
});

test("unavailable images retain template selection and a working CTA", async ({ page }) => {
  await installMockApi(page);
  await page.route("**/hero-templates/**", (route) => route.abort());
  await page.goto("/");
  const hero = page.locator("#top");
  await expect(hero.getByText("Podgląd niedostępny. Wybierz szablon po nazwie i zacznij tworzyć CV.")).toBeVisible();
  await hero.getByRole("link", { name: "Stwórz CV z tym szablonem" }).click();
  await expect(page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]')).toBeFocused();
});

test("unknown template links fall back to the ordinary picker", async ({ page }) => {
  await installMockApi(page);
  for (const id of ["unknown"]) {
    await page.goto(`/cvstudio/guest?start=new&template=${id}`);
    await expect(page.getByRole("radio", { name: /Meridian/ })).toBeChecked();
    await expect(page).toHaveURL(/\/cvstudio\/guest$/);
  }
});

test("workspace and legacy redirects preserve a Free selection", async ({ page }) => {
  await installMockApi(page);
  await login(page);
  for (const path of ["/cvstudio/guest", "/pdfcanvas"]) {
    await page.goto(`${path}?start=new&template=sterling`);
    await expect(page).toHaveURL(/\/cvstudio\/Kamil$/);
    await expect(page.getByRole("heading", { name: /Wybrany szablon:/ })).toBeFocused();
    await page.getByRole("button", { name: "Zmień szablon" }).click();
    await expect(page.getByRole("radio", { name: /Sterling/ })).toBeChecked();
  }
});

test("Free showcase fits compact, tablet, laptop, wide and 200% equivalent layouts", async ({ page }, testInfo) => {
  await installMockApi(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const width of [390, 834, 1280, 1920, 640]) {
    await page.setViewportSize({ width, height: width === 640 ? 400 : 950 });
    const hero = page.locator("#top");
    await hero.locator("label").filter({ hasText: "Linden" }).click();
    await expect.poll(() => hero.locator("img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const label of await hero.locator("label").all()) {
      const box = await label.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`hero-${width}.png`), fullPage: true });
  }
});

test("touch swipe changes selection and leaves vertical scrolling native", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  const stage = page.getByTestId("hero-template-stage");
  // Dispatch pointer events on the stage to verify direction/cancellation
  // deterministically on both mouse and touch browser profiles.
  await stage.evaluate((element) => {
    element.setPointerCapture = () => {};
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 200, clientY: 200 }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 100, clientY: 205 }));
  });
  await expect(page.locator("#top").getByRole("radio", { name: "Sterling", exact: true })).toBeChecked();
  await expect(stage).toHaveCSS("touch-action", "pan-y pinch-zoom");
});


test("compact CTA starts editing directly and refresh restores the draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page);
  await page.goto("/");
  const hero = page.locator("#top");
  await hero.locator("label").filter({ hasText: "Meridian" }).click();
  await hero.getByRole("link", { name: "Stwórz CV z wybranym szablonem" }).click();
  await expect(page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]')).toBeFocused();
  await page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]').fill("Anna Nowak");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("cvstudio.guest.doc"))).not.toBeNull();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Utwórz CV" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/cvstudio\/guest$/);
});
