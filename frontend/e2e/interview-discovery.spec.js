import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

async function signIn(page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('username', 'Kamil');
  });
}

for (const width of [390, 834, 1280, 1920]) {
  test(`interview can be discovered through pricing and help at ${width}px`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/pricing');
    await expect(page.getByText('Wywiad AI: opisz doświadczenie i przygotuj CV pod ofertę', { exact: true })).toBeVisible();
    await page.screenshot({ path: `../tmp/interview-discovery-pricing-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Jak działa wywiad i rozliczanie kredytów' }).click();
    await expect(page).toHaveURL(/\/help#wywiad$/);
    await expect(page.locator('#wywiad')).toBeFocused();
    const summary = page.getByText('Jak wywiad zużywa kredyty AI?', { exact: true });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Nie ma stałej ceny całej rozmowy/)).toBeVisible();
    if (width === 834) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-discovery-help-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'przeczytaj o Pro w cenniku' }).click();
    await expect(page).toHaveURL(/\/pricing#wywiad$/);
    await expect(page.locator('#wywiad')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto('/help#dopasowanie');
    await expect(page.locator('#dopasowanie')).toBeFocused();
    await page.getByRole('link', { name: 'Wybierz CV do dopasowania' }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp%2Fdocuments/);
    expect(api.calls.some((call) => call.method === 'POST' && call.path.includes('/ai/'))).toBe(false);
    api.assertHermetic();
  });
}

test('Pro users get direct entry points and canonical interview benefits in the picker', async ({ page }) => {
  const api = await installMockApi(page);
  await signIn(page);
  await page.goto('/app/documents');
  await expect(page.getByText('WYWIAD · MASZ DOSTĘP W PRO')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Utwórz CV z pomocą wywiadu', exact: true })).toHaveAttribute('href', '/app/interview');
  await page.getByRole('link', { name: 'Chcę dopasować obecne CV do oferty' }).click();
  await expect(page.locator('#dopasowanie')).toBeFocused();
  await page.goto('/app/account');
  await expect(page.getByText('WYWIAD · W TWOIM PRO')).toBeVisible();
  await page.getByRole('button', { name: 'Zmień plan' }).click();
  await expect(page.getByRole('dialog').getByText('Wywiad AI: opisz doświadczenie i przygotuj CV pod ofertę', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Zmień plan' })).toBeFocused();
  expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  api.assertHermetic();
});

for (const state of ['free', 'unavailable']) {
  test(`${state} entitlements never advertise active interview access`, async ({ page }) => {
    const api = await installMockApi(page, { entitlements: { plan_slug: 'free', plan_name: 'Darmowy', ai_assistant: false } });
    if (state === 'unavailable') await page.route('**/api/auth/me/entitlements', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Nie udało się pobrać planu.' }) }));
    await signIn(page);
    for (const path of ['/app/documents', '/app/account']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      if (path === '/app/account') await expect(page.getByText(state === 'free' ? 'Twój plan: Darmowy' : 'Nie udało się pobrać planu.', { exact: true })).toBeVisible();
      await expect(page.getByText(/WYWIAD · (MASZ DOSTĘP W PRO|W TWOIM PRO)/)).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Główna nawigacja' }).getByRole('link', { name: 'Profil zawodowy' })).toBeVisible();
    }
    api.assertHermetic();
  });
}

for (const width of [390, 1280]) {
  test(`landing, Pro registration and account start explain the interview at ${width}px`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: 'Zobacz, jak działa wywiad' }).click();
    await expect(page.locator('#wywiad')).toBeFocused();
    await page.goto('/register?plan=pro');
    await expect(page.getByText('Wywiad AI: opisz doświadczenie i przygotuj CV pod ofertę', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-discovery-register-${width}.png`, fullPage: true });
    await signIn(page);
    await page.goto('/cvstudio/Kamil');
    await expect(page.getByRole('heading', { name: 'Jak chcesz zacząć?' })).toBeVisible();
    const entry = page.getByRole('link', { name: 'Utwórz CV z pomocą wywiadu · Pro' });
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('href', '/app/interview');
    await page.screenshot({ path: `../tmp/interview-discovery-start-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Jak działa wywiad', exact: true }).click();
    await expect(page.locator('#wywiad')).toBeFocused();
    api.assertHermetic();
  });
}
