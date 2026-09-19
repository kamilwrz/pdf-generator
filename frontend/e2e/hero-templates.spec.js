import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

for (const name of ["Sterling", "Meridian", "Linden"]) {
  test('hero starts onboarding, where the template is chosen: ' + name, async ({ page }) => {
    const api = await installMockApi(page);
    await page.goto('/');
    const hero = page.locator('#top');
    await expect(hero.getByRole('radio')).toHaveCount(0);
    await hero.getByRole('link', { name: 'Stwórz CV za darmo', exact: true }).click();
    await page.getByRole('button', { name: 'Zaczynam od zera', exact: true }).click();
    await page.getByRole('radio', { name: new RegExp(name) }).check();
    const request = page.waitForRequest(request => request.url().endsWith('/ai/fill_template') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Otwórz CV w edytorze', exact: true }).click();
    expect((await request).postDataJSON().template_id).toBe(name.toLowerCase());
    await expect(page).toHaveURL(/\/cvstudio\/guest$/);
    await expect(page.getByRole('dialog', { name: 'CV STUDIO' })).toHaveCount(0);
    await expect(page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]')).toBeFocused();
    api.assertHermetic();
  });
}

test('unavailable sample images retain a working creation path', async ({ page }) => {
  await installMockApi(page);
  await page.route('**/hero-templates/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#top').getByRole('status')).toContainText('Nie udało się wczytać podglądów');
  await page.locator('#top').getByRole('link', { name: 'Stwórz CV za darmo', exact: true }).click();
  await page.getByRole('button', { name: 'Zaczynam od zera', exact: true }).click();
  await page.getByRole('button', { name: 'Otwórz CV w edytorze', exact: true }).click();
  await expect(page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]')).toBeFocused();
});

test("unknown template links fall back to the ordinary picker", async ({ page }) => {
  await installMockApi(page);
  for (const id of ["unknown"]) {
    await page.goto(`/cvstudio/guest?start=new&template=${id}`);
    await page.getByRole("button", { name: "Zaczynam od zera", exact: true }).click();
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
    await page.getByRole("button", { name: "Zaczynam od zera", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Wybierz szablon dla swojego CV" })).toBeFocused();
    await expect(page.getByRole("radio", { name: /Sterling/ })).toBeChecked();
  }
});

test('mobile creation retains a draft and exposes a direct resume alongside the demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockApi(page);
  await page.goto('/');
  await page.locator('#top').getByRole('link', { name: 'Stwórz CV za darmo', exact: true }).click();
  await page.getByRole('button', { name: 'Zaczynam od zera', exact: true }).click();
  await page.getByRole('radio', { name: /Linden/ }).check();
  await page.getByRole('button', { name: 'Otwórz CV w edytorze', exact: true }).click();
  const name = page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]');
  await expect(name).toBeFocused();
  await name.fill('Anna Nowak');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cvstudio.guest.doc'))).toContain('Anna Nowak');
  await page.goto('/');
  const hero = page.locator('#top');
  await expect(hero.getByRole('link', { name: 'Edytor CV Wypróbuj na przykładzie', exact: true })).toBeVisible();
  await hero.getByRole('link', { name: 'Wróć do szkicu CV', exact: true }).click();
  await expect(page).toHaveURL(/\/cvstudio\/guest$/);
  await expect(page.getByRole('button', { name: 'Pobierz PDF', exact: true })).toBeVisible();
  // Display-mode canvas text has a zero-height baseline box for PDF parity.
  // Its rendered text and CSS visibility verify restoration without requiring an editing box.
  await expect(page.getByText('Anna Nowak', { exact: true })).toHaveCSS('visibility', 'visible');
  await expect(page.getByRole('dialog', { name: 'CV STUDIO' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Anna Nowak', { exact: true })).toHaveCSS('visibility', 'visible');
});
