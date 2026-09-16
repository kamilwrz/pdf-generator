import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`document workflow cards share hierarchy: ${language} ${width}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(lang => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('username', 'Kamil');
      localStorage.setItem('cvstudio.uiLanguage', lang);
    }, language);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/documents');
    const assistant = page.locator('article[aria-labelledby="assistant-choice"]');
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
    } else expect(b.y).toBeGreaterThan(a.y + a.height);
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
