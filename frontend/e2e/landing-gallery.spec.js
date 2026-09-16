import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Exercise the actual rail, including scroll boundaries and focus, instead of
// asserting implementation classes. Every preview keeps its native link.
for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`manual gallery keeps every template reachable: ${language} ${width}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const rail = page.locator('#landing-template-gallery');
    const previous = page.getByRole('button', { name: language === 'pl' ? 'Poprzednie szablony' : 'Previous templates' });
    const next = page.getByRole('button', { name: language === 'pl' ? 'Następne szablony' : 'Next templates' });
    const links = rail.getByRole('link');
    await expect(links.first()).toBeVisible();
    const destinations = await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    expect(destinations.length).toBeGreaterThan(3);
    expect(new Set(destinations).size).toBe(destinations.length);
    await expect(previous).toHaveAttribute('aria-disabled', 'true');
    await next.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => rail.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
    await expect(next).toBeFocused();
    await expect(previous).toHaveAttribute('aria-disabled', 'false');
    for (let i = 0; i < destinations.length && await next.getAttribute('aria-disabled') !== 'true'; i += 1) await next.click();
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    const end = await rail.evaluate(node => node.scrollLeft);
    await page.keyboard.press('Enter');
    expect(await rail.evaluate(node => node.scrollLeft)).toBe(end);
    await previous.click();
    await expect.poll(() => rail.evaluate(node => node.scrollLeft)).toBeLessThan(end);
    // Native Tab scrolls offscreen links into view without moving the page sideways.
    await links.first().focus();
    for (let i = 1; i < destinations.length; i += 1) await page.keyboard.press('Tab');
    await expect(links.last()).toBeFocused();
    await expect(links.last()).toBeInViewport();
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(api.calls.some(call => call.method === 'POST' && call.path.includes('/ai/'))).toBe(false);
    await links.last().click();
    await expect(page).toHaveURL(new RegExp(`${destinations.at(-1)}$`));
  });
}

test('gallery image failure preserves its frame and destination', async ({ page }) => {
  await installMockApi(page);
  await page.route('**/template-mockups/**', route => route.abort());
  await page.goto('/');
  const rail = page.locator('#landing-template-gallery');
  await rail.scrollIntoViewIfNeeded();
  const link = rail.getByRole('link').first();
  await expect(link.getByText('Nie udało się wczytać podglądu')).toBeVisible();
  const frame = await link.locator('div').boundingBox();
  expect(Math.abs(frame.width / frame.height - 210 / 297)).toBeLessThan(.01);
  const destination = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
});
