import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`three clear goals and mirrored tailoring example: ${language} ${width}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
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
    await expect(demo).toHaveAttribute('data-playing', 'false');
    await expect(demo.getByText(language === 'pl' ? 'W ogłoszeniu' : 'In the job advert', { exact: true })).toBeVisible();
    const question = demo.getByRole('button', { name: language === 'pl' ? 'Pytanie' : 'Question', exact: true });
    await question.focus();
    await page.keyboard.press('Tab');
    const answer = demo.getByRole('button', { name: language === 'pl' ? 'Odpowiedź' : 'Answer', exact: true });
    await expect(answer).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(answer).toHaveAttribute('aria-pressed', 'true');
    await demo.getByRole('button', { name: language === 'pl' ? 'Propozycja' : 'Proposal', exact: true }).click();
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

test('tailoring playback advances once, pauses and supports explicit replay', async ({ page }) => {
  await installMockApi(page);
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const demo = page.locator('#dopasowanie figure');
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-playing', 'true');
  await demo.getByRole('button', { name: 'Wstrzymaj pokaz' }).click();
  await page.clock.runFor(6000);
  await expect(demo.getByRole('button', { name: 'Pytanie', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await demo.getByRole('button', { name: 'Wznów pokaz' }).click();
  await page.clock.runFor(5500);
  await expect(demo.getByRole('button', { name: 'Odpowiedź', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(8500);
  await expect(demo.getByRole('button', { name: 'Propozycja', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(demo).toHaveAttribute('data-playing', 'false');
  await demo.getByRole('button', { name: 'Odtwórz ponownie' }).click();
  await expect(demo.getByRole('button', { name: 'Pytanie', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
