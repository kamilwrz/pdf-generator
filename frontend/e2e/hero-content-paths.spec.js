import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) {
  test(`getting-started FAQ preserves the chosen route: ${language}`, async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const question = language === 'pl' ? 'Od czego zacząć?' : 'Where should I start?';
    const guide = page.locator('details').filter({ has: page.locator('summary', { hasText: question }) });
    await expect(guide).not.toHaveAttribute('open');
    await guide.locator('summary').focus();
    await page.keyboard.press('Enter');
    const links = guide.getByRole('link');
    await expect(links).toHaveCount(4);
    await expect(links.nth(1)).toHaveAttribute('href', '/register?start=import&plan=free');
    await expect(links.nth(2)).toHaveAttribute('href', '#wywiad');
    await expect(links.nth(3)).toHaveAttribute('href', '#dopasowanie');
    await page.keyboard.press('Tab');
    await expect(links.first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#top$/);
    await expect(page.locator('#top')).toBeFocused();
    await links.nth(1).click();
    await expect(page).toHaveURL(/\/register\?start=import&plan=free$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  for (const signedIn of [false, true]) {
    test(`landing Pro entry retains account context: ${language} ${signedIn ? 'account' : 'guest'}`, async ({ page }) => {
      await installMockApi(page);
      await page.addInitScript(({ lang, authenticated }) => {
        localStorage.setItem('cvstudio.uiLanguage', lang);
        if (authenticated) {
          localStorage.setItem('token', 'mock-token');
          localStorage.setItem('username', 'Kamil');
        }
      }, { lang: language, authenticated: signedIn });
      await page.goto('/');
      const pro = page.locator('#cennik article').last().getByRole('link');
      await expect(pro).toHaveAttribute('href', signedIn ? '/app/account' : '/register?plan=pro');
      await pro.click();
      await expect(page).toHaveURL(signedIn ? /\/app\/account$/ : /\/register\?plan=pro$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  for (const width of [390, 834, 1280, 1920]) {
    test(`hero content paths stack with keyboard access: ${language} ${width}`, async ({ page }) => {
      await installMockApi(page);
      await page.addInitScript(language => localStorage.setItem('cvstudio.uiLanguage', language), language);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      const paths = page.locator('#top nav');
      const links = paths.getByRole('link');
      await expect(links).toHaveCount(2);
      await expect(links.nth(0)).toHaveAttribute('href', '#wywiad');
      await expect(links.nth(1)).toHaveAttribute('href', '#dopasowanie');
      for (const enlarged of [false, true]) {
        if (enlarged) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        const first = await links.nth(0).boundingBox();
        const second = await links.nth(1).boundingBox();
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
        expect(second.x).toBeCloseTo(first.x, 0);
        expect(first.height).toBeGreaterThanOrEqual(44);
        expect(first.x + first.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await links.nth(0).focus();
      await expect(links.nth(0)).toBeFocused();
      expect(await links.nth(0).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
      await page.keyboard.press('Tab');
      await expect(links.nth(1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#dopasowanie$/);
      await page.goto('/');
      await paths.scrollIntoViewIfNeeded();
      await paths.screenshot({ path: `test-results/hero-content-paths-${language}-${width}.png` });
      await links.nth(0).click();
      await expect(page).toHaveURL(/#wywiad$/);
    });
  }
}
