import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Discovery and guidance must never trigger paid work. Test the same public
// journey in both locales, including compact, enlarged-text and wide layouts.
for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`Studio and Interview explain the outcome ${language} ${width}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(value => localStorage.setItem('cvstudio.uiLanguage', value), language);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const english = language === 'en';
    await expect(page.getByRole('heading', { level: 1 })).toContainText(english ? 'Stronger content.' : 'Lepsza treść.');
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const jump = page.locator('a[href="#wywiad"]');
    await jump.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#wywiad')).toBeFocused();
    await expect(page.locator('#wywiad figure')).toContainText('Zendesk');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/positioning-${language}-${width}.png`, fullPage: true });
    const start = page.locator('#wywiad').getByRole('link', { name: english ? 'Open the Interview' : 'Przejdź do Wywiadu', exact: true });
    await expect(start).toHaveAttribute('href', '/app/interview');
    expect((await start.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const fit = page.getByRole('link', { name: english ? 'How page fitting works' : 'Jak działa dopasowanie do strony' });
    await fit.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/help#jedna-strona$/);
    await expect(page.locator('#jedna-strona')).toBeFocused();
    await expect(page.locator('#jedna-strona')).toContainText(english ? 'no AI credits' : 'bez kredytów AI');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#jedna-strona').getByRole('link').click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp%2Finterview/);
    expect(api.calls.some(call => call.method === 'POST' && call.path.includes('/ai/'))).toBe(false);
    api.assertHermetic();
  });
}
