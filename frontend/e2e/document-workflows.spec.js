import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`one CV Assistant contains two modes: ${language} ${width}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.route('**/api/tailoring', route => route.fulfill({ json: { items: [] } }));
    await page.addInitScript(lang => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('username', 'Kamil');
      localStorage.setItem('cvstudio.uiLanguage', lang);
    }, language);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/documents');
    const feature = page.getByRole('region', { name: language === 'pl' ? 'Asystent CV' : 'CV Assistant', exact: true });
    await expect(feature.getByRole('heading', { level: 2 })).toHaveCount(1);
    await expect(feature.getByRole('heading', { level: 3 })).toHaveCount(2);
    const assistant = feature.locator('article[aria-labelledby="assistant-choice"]');
    const tailoring = page.locator('article[aria-labelledby="tailoring-choice"]');
    await expect(assistant).toBeVisible();
    await expect(assistant.getByRole('link')).toHaveAttribute('href', '/app/interview');
    await expect(tailoring.getByRole('link')).toHaveAttribute('href', '/app/tailor');
    await expect(page.locator('main a[href="/app/tailor"]')).toHaveCount(1);
    const a = await assistant.boundingBox();
    const b = await tailoring.boundingBox();
    if (width > 767) {
      expect(a.y).toBe(b.y);
      expect(a.height).toBe(b.height);
      expect(Math.abs(a.width - b.width)).toBeLessThan(1);
      const buttons = await Promise.all([assistant, tailoring].map(card => card.getByRole('link').boundingBox()));
      expect(Math.abs(buttons[0].y - buttons[1].y)).toBeLessThan(1);
    } else expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    await assistant.getByRole('link').focus();
    await page.keyboard.press('Tab');
    await expect(tailoring.getByRole('link')).toBeFocused();
    await page.screenshot({ path: `test-results/document-workflows-${language}-${width}.png`, fullPage: true });
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(api.calls.some(call => call.method === 'POST')).toBe(false);
    await tailoring.getByRole('link').press('Enter');
    await expect(page).toHaveURL(/\/app\/tailor$/);
  });
}

for (const state of ['free', 'unavailable']) {
  test(`assistant access stays explicit for ${state}`, async ({ page }) => {
    await installMockApi(page, { entitlements: { plan_slug: 'free', ai_assistant: false } });
    if (state === 'unavailable') await page.route('**/api/auth/me/entitlements', route => route.fulfill({ status: 503, json: { detail: 'Unavailable' } }));
    await page.addInitScript(() => { localStorage.setItem('token', 'local-playwright-token'); localStorage.setItem('username', 'Kamil'); });
    await page.goto('/app/documents');
    const assistant = page.locator('article[aria-labelledby="assistant-choice"]');
    await expect(assistant.getByRole('link')).toHaveAttribute('href', '/app/account');
    await expect(assistant.getByRole('link')).toHaveText(state === 'free' ? 'Poznaj Pro' : 'Sprawdź dostęp');
    await expect(page.locator('article[aria-labelledby="tailoring-choice"]').getByRole('link')).toHaveAttribute('href', '/app/tailor');
  });
}

for (const language of ['pl', 'en']) {
  test('shared assistant navigation and both mode returns: ' + language, async ({ page }) => {
    const api = await installMockApi(page);
    await page.route('**/api/tailoring', route => route.fulfill({ json: { items: [] } }));
    await page.addInitScript(lang => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('username', 'Kamil');
      localStorage.setItem('cvstudio.uiLanguage', lang);
    }, language);
    await page.route('**/api/career-profile*', route => route.fulfill({ json: { revision: 0, facts: [], sources: { documents: [], imports: [] } } }));
    await page.route('**/api/ai/interviews**', route => route.fulfill({ json: { items: [], next_offset: null } }));
    const name = language === 'pl' ? 'Asystent CV' : 'CV Assistant';
    const nav = page.getByRole('navigation', { name: language === 'pl' ? 'Główna nawigacja' : 'Main navigation', exact: true });
    await page.goto('/app/documents');
    await expect(nav.locator('a[href="/app/tailor"]')).toHaveCount(0);
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(/\/app\/assistant$/);
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeFocused();
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    for (const [id, path] of [['assistant-choice', '/app/interview'], ['tailoring-choice', '/app/tailor']]) {
      const mode = page.locator('article[aria-labelledby="' + id + '"]');
      await expect(mode.getByRole('link')).toHaveAttribute('href', path);
      await mode.getByRole('link').focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(path + '$'));
      await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
      const breadcrumbs = page.getByRole('navigation', { name: language === 'pl' ? 'Ścieżka strony' : 'Breadcrumbs', exact: true });
      await breadcrumbs.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(/\/app\/assistant$/);
    }
    expect(api.calls.some(call => ['POST', 'PUT', 'DELETE'].includes(call.method))).toBe(false);
    api.assertHermetic();
  });
}

test('assistant entry preserves its destination across authentication', async ({ page }) => {
  const api = await installMockApi(page);
  await page.goto('/app/assistant');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp%2Fassistant$/);
  await page.getByLabel('Nazwa użytkownika').fill('Kamil');
  await page.getByLabel('Hasło', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/assistant$/);
  await expect(page.locator('article')).toHaveCount(2);
  api.assertHermetic();
});
