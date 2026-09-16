import { expect, test } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

test('interview demo supports keyboard, reduced motion and responsive reading', async ({ page }) => {
  await installMockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const demo = page.locator('#wywiad figure');
  for (const width of [390, 834, 1280, 1920, 640]) {
    await page.setViewportSize({ width, height: width === 640 ? 400 : 950 });
    await demo.scrollIntoViewIfNeeded();
    for (const name of [/Pytanie/, /Odpowiedź/, /Propozycja/]) {
      const button = demo.getByRole('button', { name });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(demo.getByText('Propozycja do sprawdzenia')).toBeVisible();
    if (width === 390 || width === 1280) await page.locator('#wywiad').screenshot({ path: `test-results/interview-demo-${width}.png` });
  }
  await page.screenshot({ path: 'test-results/interview-demo.png', fullPage: true });
});

test('English shell includes the example and plays through to a reviewable result', async ({ page }) => {
  await installMockApi(page);
  await page.addInitScript(() => localStorage.setItem('cvstudio.uiLanguage', 'en'));
  await page.goto('/');
  const demo = page.locator('#wywiad figure');
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.getByText('Interview simulation · sample data')).toBeVisible();
  await expect(demo.getByRole('button', { name: 'Answer', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await expect(demo.getByRole('button', { name: 'Proposal', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });
  await expect(demo.getByText('Proposal to review')).toBeVisible();
  await demo.getByRole('button', { name: 'Play again' }).click();
  await expect(demo.getByRole('button', { name: 'Question', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
