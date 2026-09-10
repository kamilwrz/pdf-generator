import { test, expect } from '@playwright/test';
import { installMockApi, SAVED_DOCUMENT, SAVED_ELEMENTS } from './support/mockApi.js';

async function authenticate(page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('username', 'Kamil');
  });
}

test('login returns to the library, a document survives refresh and Back', async ({ page }) => {
  // A current freeform snapshot needs no legacy template reflow on hydration.
  const api = await installMockApi(page, { savedDocument: { ...SAVED_DOCUMENT, editor_mode: 'freeform', template_id: null, cv_data: null }, savedElements: [SAVED_ELEMENTS[0]] });
  await page.goto('/login');
  await page.getByLabel('Nazwa użytkownika').fill('Kamil');
  await page.getByLabel('Hasło', { exact: true }).fill('local-password');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/documents$/);
  await page.getByRole('link', { name: 'Otwórz', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/documents\/41$/);
  await expect(page.getByRole('textbox', { name: 'Nazwa bieżącego dokumentu' })).toHaveValue("CV Smoke");
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nazwa bieżącego dokumentu' })).toHaveValue("CV Smoke");
  await page.getByRole('link', { name: 'Moje dokumenty', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Moje dokumenty', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Nazwa bieżącego dokumentu' })).toHaveValue("CV Smoke");
  api.assertHermetic();
});

test('a private bookmark survives authentication and failed document reads can retry', async ({ page }) => {
  const api = await installMockApi(page);
  let fail = true;
  await page.route('**/api/pdf/show_pdf', (route) => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Chwilowa niedostępność.' }) }) : route.fallback());
  await page.goto('/app/documents/41');
  await expect(page).toHaveURL(/login\?returnTo=/);
  await page.getByLabel('Nazwa użytkownika').fill('Kamil');
  await page.getByLabel('Hasło', { exact: true }).fill('local-password');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nie udało się otworzyć CV' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await expect(page.getByRole('textbox', { name: 'Nazwa bieżącego dokumentu' })).toHaveValue("CV Smoke");
  api.assertHermetic();
});

test('library handles search, download, delete cancellation and success', async ({ page }) => {
  const api = await installMockApi(page);
  await authenticate(page);
  let deletions = 0;
  await page.route('**/api/pdf/delete_pdf', async (route) => {
    deletions += 1;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ pdf_id: 41 }) });
  });
  await page.goto('/app/documents');
  await page.getByLabel('Szukaj dokumentów').fill('nie istnieje');
  await expect(page.getByText(/Brak dokumentów pasujących/)).toBeVisible();
  await page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click();
  await expect(page.getByLabel('Szukaj dokumentów')).toBeFocused();
  await expect(page.getByLabel('Szukaj dokumentów')).toHaveValue('');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz PDF', exact: true }).click();
  await download;
  await page.getByRole('button', { name: `Usuń ${SAVED_DOCUMENT.title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Anuluj', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  expect(deletions).toBe(0);
  await expect(page.getByRole('button', { name: `Usuń ${SAVED_DOCUMENT.title}`, exact: true })).toBeFocused();
  await page.getByRole('button', { name: `Usuń ${SAVED_DOCUMENT.title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Usuń trwale', exact: true }).click();
  await expect(page.getByText('Twoje pierwsze CV zaczyna się tutaj.')).toBeVisible();
  expect(deletions).toBe(1);
  api.assertHermetic();
});

test('account privacy controls export data and require exact confirmation before erasure', async ({ page }) => {
  const api = await installMockApi(page);
  await authenticate(page);
  await page.goto('/app/account');
  await expect(page.getByRole('meter', { name: /Kredyty AI: wykorzystano/ })).toBeVisible();
  await expect(page.getByRole('meter', { name: /Projekty CV/ })).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz moje dane' }).click();
  expect((await download).suggestedFilename()).toBe('cv-studio-data-2026-09-10.json');

  await page.getByRole('button', { name: 'Usuń konto' }).click();
  const confirmation = page.getByLabel('Nazwa użytkownika');
  await expect(confirmation).toBeFocused();
  await confirmation.fill('kamil');
  await expect(page.getByRole('button', { name: 'Usuń konto trwale' })).toBeDisabled();
  await confirmation.fill('Kamil');
  await page.getByRole('button', { name: 'Usuń konto trwale' }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  expect(api.calls.some((call) => call.method === 'DELETE' && call.path === '/account')).toBe(true);
  api.assertHermetic();
});

test('template selection is retained and paid creation stays gated', async ({ page }) => {
  const api = await installMockApi(page);
  await page.goto('/templates/monument');
  await page.getByRole('link', { name: 'Użyj szablonu Monument' }).click();
  await expect(page.getByRole('button', { name: 'Rozpocznij edycję', exact: true })).toBeDisabled();
  await expect(page.getByText(/Szablon Monument wymaga aktywnego Pro/)).toBeVisible();
  await page.getByRole('link', { name: 'Sprawdź dostęp Pro' }).click();
  await expect(page).toHaveURL(/template=monument/);
  await page.goto('/templates/linden');
  await page.getByRole('link', { name: 'Użyj szablonu Linden' }).click();
  await expect(page.locator('[data-template-id="linden"], .main-container').first()).toBeVisible();
  api.assertHermetic();
});

for (const width of [390, 834, 1280, 1920, 640]) {
  test(`public and account routes remain usable at ${width}px`, async ({ page }) => {
    const api = await installMockApi(page);
    await authenticate(page);
    await page.setViewportSize({ width, height: width === 640 ? 400 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/templates', '/templates/linden', '/pricing', '/help', '/privacy', '/app/documents', '/app/account']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('h1')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole('navigation', { name: 'Główna nawigacja' })).toBeVisible();
      if ([390, 1280].includes(width)) await page.screenshot({ path: `../tmp/site-${width}-${path.replaceAll('/', '-')}.png`, fullPage: true });
    }
    api.assertHermetic();
  });
}
