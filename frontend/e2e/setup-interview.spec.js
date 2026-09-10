import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const width of [390, 834, 1280, 1920]) {
  for (const plan of ['free', 'pro']) {
    test(`setup header interview for ${plan} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const api = await installMockApi(page, { entitlements: { plan_slug: plan, ai_assistant: plan === 'pro' } });
      await page.addInitScript(() => { localStorage.setItem('token', 'local-playwright-token'); localStorage.setItem('username', 'Kamil'); });
      await page.goto('/cvstudio/Kamil');
      await page.getByRole('button', { name: /Utwórz nowe CV/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Utwórz CV', exact: true });
      const action = dialog.getByRole('link', { name: plan === 'pro' ? 'Wywiad AI Rozpocznij rozmowę' : 'Wywiad AI Tylko w Pro' });
      await expect(action).toHaveAttribute('href', plan === 'pro' ? '/app/interview' : '/app/account');
      const title = dialog.getByRole('heading', { name: 'Utwórz CV', exact: true });
      const close = dialog.getByRole('button', { name: 'Zamknij: Utwórz CV' });
      const [a, t, c] = await Promise.all([action.boundingBox(), title.boundingBox(), close.boundingBox()]);
      expect(a.x).toBeGreaterThanOrEqual(t.x + t.width);
      expect(a.x + a.width).toBeLessThan(c.x);
      expect(Math.abs(a.y - t.y)).toBeLessThan(30);
      if (width >= 1280) expect(Math.abs(a.x + a.width / 2 - (t.x + c.x) / 2)).toBeLessThan(16);
      await action.focus();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(action).toBeFocused();
      if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      for (const element of [action, title, close]) {
        const box = await element.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.screenshot({ path: `../tmp/setup-interview-${plan}-${width}.png`, fullPage: true });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Utwórz nowe CV/ })).toBeFocused();
      api.assertHermetic();
    });
  }
}
