import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`one assistant with two modes and mirrored tailoring example: ${language} ${width}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const assistant = page.getByRole('region', { name: language === 'pl' ? 'Asystent CV' : 'CV Assistant', exact: true });
    await expect(assistant.locator('#wywiad')).toBeVisible();
    await expect(assistant.locator('#dopasowanie')).toBeVisible();
    await expect(assistant.locator('h3')).toHaveCount(2);
    const hero = page.locator('#top');
    await hero.screenshot({ path: `test-results/landing-hero-${language}-${width}.png` });
    const copy = await hero.locator('h1').boundingBox();
    const cards = hero.locator('button[data-active]');
    for (const card of await cards.all()) {
      const bounds = await card.boundingBox();
      if (width > 1024) expect(bounds.x).toBeGreaterThan(copy.x + copy.width);
    }
    await hero.locator('a[href="#dopasowanie"]').focus();
    await page.keyboard.press('Enter');
    const section = page.locator('#dopasowanie');
    await expect(section).toBeFocused();
    const demo = section.locator('figure');
    const title = section.getByRole('heading');
    const left = await demo.boundingBox();
    const right = await title.boundingBox();
    if (width > 1024) expect(left.x + left.width).toBeLessThan(right.x);
    else expect(right.y + right.height).toBeLessThan(left.y);
    await expect(demo.getByText(language === 'pl' ? 'W ogłoszeniu' : 'In the job advert', { exact: true })).toBeVisible();
    await expect(demo.getByText(language === 'pl' ? 'Tak może brzmieć Twój opis' : 'How your description could read')).toBeVisible();
    const summary = demo.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(summary).toBeFocused();
    await expect(demo.locator('details')).toHaveAttribute('open', '');
    await section.screenshot({ path: `test-results/landing-tailoring-${language}-${width}.png` });
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const start = section.locator('a[href="/app/tailor"]');
    expect((await start.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(api.calls.some(call => call.method === 'POST' && call.path.includes('/ai/'))).toBe(false);
    await start.click();
    await expect(page).toHaveURL(/\/app\/tailor$/);
  });
}
