import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) {
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
