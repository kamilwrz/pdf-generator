import { expect, test } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Read both complete results on arrival, then reveal the supporting evidence.
// This contract is identical with and without reduced motion and needs no AI.
for (const language of ['pl', 'en']) for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`assistant examples remain readable and keyboard-operable: ${language} ${reducedMotion}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.emulateMedia({ reducedMotion });
    await page.goto('/');
    for (const width of [390, 834, 1280, 1920, 640]) {
      await page.setViewportSize({ width, height: width === 640 ? 400 : 950 });
      for (const id of ['wywiad', 'dopasowanie']) {
        const section = page.locator('#' + id);
        const demo = section.locator('figure');
        const disclosure = demo.locator('details');
        const summary = disclosure.locator('summary');
        const result = demo.getByText(language === 'pl' ? 'Tak może brzmieć Twój opis' : 'How your description could read');
        await expect(result).toBeVisible();
        await expect(disclosure).not.toHaveAttribute('open');
        await summary.focus();
        await expect(summary).toHaveText(language === 'pl' ? 'Zobacz pytanie i odpowiedź' : 'See the question and answer');
        expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
        expect(await summary.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid');
        await page.keyboard.press('Enter');
        await expect(disclosure).toHaveAttribute('open', '');
        await expect(summary).toBeFocused();
        await expect(demo.getByText(language === 'pl' ? 'Asystent pyta' : 'The assistant asks')).toBeVisible();
        await expect(demo.getByText(language === 'pl' ? 'Twoja odpowiedź' : 'Your answer')).toBeVisible();
        await expect(result).toBeVisible();
        if (reducedMotion === 'reduce' && [390, 1280].includes(width)) {
          await section.screenshot({ path: `test-results/example-${id}-${language}-${width}-open.png` });
        }
        await page.keyboard.press('Space');
        await expect(disclosure).not.toHaveAttribute('open');
        await expect(summary).toBeFocused();
        await expect(result).toBeVisible();
        if (reducedMotion === 'reduce' && [390, 1280].includes(width)) {
          await section.screenshot({ path: `test-results/example-${id}-${language}-${width}-closed.png` });
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(api.calls.some(call => call.method === 'POST' && call.path.includes('/ai/'))).toBe(false);
    api.assertHermetic();
  });
}

test('results and disclosures stay stable while time passes and the page scrolls', async ({ page }) => {
  await installMockApi(page);
  await page.clock.install();
  await page.goto('/');
  const demo = page.locator('#wywiad figure');
  const original = await demo.innerText();
  await demo.scrollIntoViewIfNeeded();
  await page.clock.runFor(60000);
  expect(await demo.innerText()).toBe(original);
  await demo.locator('summary').click();
  await page.locator('#dopasowanie').scrollIntoViewIfNeeded();
  await page.clock.runFor(60000);
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.locator('details')).toHaveAttribute('open', '');
  await expect(page.locator('#dopasowanie details')).not.toHaveAttribute('open');
});
