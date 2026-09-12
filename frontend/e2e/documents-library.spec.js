import { expect, test } from '@playwright/test';
import { installMockApi, login, SAVED_DOCUMENT } from './support/mockApi.js';

test('library tabs expose imports, recover deletion focus and reflow', async ({ page }, testInfo) => {
  const api = await installMockApi(page);
  await login(page);
  await page.goto('/app/documents');
  const cvs = page.getByRole('tab', { name: 'Zapisane CV', exact: true });
  const imports = page.getByRole('tab', { name: 'Zapisane importy' });
  await expect(cvs).toHaveAttribute('aria-selected', 'true');
  await cvs.focus();
  await page.keyboard.press('ArrowRight');
  await expect(imports).toBeFocused();
  const panel = page.getByRole('tabpanel', { name: 'Zapisane importy' });
  const row = panel.getByRole('listitem').filter({ hasText: 'CV-Kamil-Frontend-2026.pdf' });
  await expect(row.getByRole('link', { name: 'Utwórz CV' })).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: 'CV-Kamil-starsze.pdf' }).getByRole('link')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 834, 1280, 1920, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`library-imports-${width}.png`) });
  }
  await page.getByRole('combobox', { name: 'Język aplikacji' }).selectOption('en');
  await expect(page.getByRole('tab', { name: 'Saved imports' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Saved imports' }).getByRole('link', { name: 'Create CV' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Application language' }).selectOption('pl');
  await row.getByRole('button', { name: /Usuń/ }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Anuluj' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(row.getByRole('button', { name: /Usuń/ })).toBeFocused();
  await row.getByRole('button', { name: /Usuń/ }).click();
  await dialog.getByRole('button', { name: 'Usuń trwale' }).click();
  await expect(row).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: 'Zapisane importy' })).toBeFocused();
  await cvs.click();
  await expect(page.getByRole('tabpanel', { name: 'Zapisane CV', exact: true })).toBeVisible();
  api.assertHermetic();
});

test('saved import opens its extracted data in template selection without extraction', async ({ page }) => {
  const api = await installMockApi(page);
  await page.route('**/api/ai/imports/136', (route) => route.fulfill({ json: { id: 136, status: 'succeeded', cv_data: SAVED_DOCUMENT.cv_data } }));
  await login(page);
  await page.goto('/app/documents');
  await page.getByRole('tab', { name: 'Zapisane importy' }).click();
  await page.getByRole('tabpanel', { name: 'Zapisane importy' }).getByRole('link', { name: 'Utwórz CV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Importuj CV' });
  await expect(dialog.getByText(SAVED_DOCUMENT.cv_data.name, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Następny krok' })).toBeDisabled();
  api.assertHermetic();
});

test('empty imports offer an upload and read failures can be retried', async ({ page }) => {
  const api = await installMockApi(page, { imports: [] });
  let fail = true;
  await page.route('**/api/ai/imports', async (route) => {
    if (fail) { fail = false; return route.fulfill({ status: 503, json: { detail: 'Temporary failure' } }); }
    return route.fallback();
  });
  await login(page);
  await page.goto('/app/documents');
  await page.getByRole('tab', { name: 'Zapisane importy' }).click();
  await page.getByRole('alert').getByRole('button').click();
  const panel = page.getByRole('tabpanel', { name: 'Zapisane importy' });
  await expect(panel.getByRole('link', { name: 'Importuj PDF' })).toBeVisible();
  api.assertHermetic();
});


