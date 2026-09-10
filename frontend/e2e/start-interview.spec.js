import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const width of [390, 834, 1280, 1920]) {
  for (const plan of ['pro', 'free']) {
    test(`third interview choice for ${plan} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const api = await installMockApi(page, { entitlements: { plan_slug: plan, ai_assistant: plan === 'pro' } });
      await page.addInitScript(() => { localStorage.setItem('token', 'local-playwright-token'); localStorage.setItem('username', 'Kamil'); });
      await page.goto('/cvstudio/Kamil');
      const chooser = page.getByRole('region', { name: 'Jak chcesz zacząć?' });
      await expect(chooser).toBeVisible();
      const link = chooser.getByRole('link', { name: plan === 'pro' ? 'Wywiad Rozpocznij wywiad' : 'Wywiad Poznaj Pro' });
      await expect(link).toHaveAttribute('href', plan === 'pro' ? '/app/interview' : '/app/account');
      await expect(chooser.getByText(plan === 'pro' ? 'W Twoim Pro' : 'Dostępny w Pro', { exact: true })).toBeVisible();
      if (plan === 'free') await expect(chooser.getByText('W pakiecie Free wywiad jest dostępny po przejściu na Pro.')).toBeVisible();
      const controls = [chooser.getByRole('button', { name: /Utwórz nowe CV/ }), chooser.getByRole('button', { name: /Zaimportuj istniejące CV/ }), link];
      if (width >= 1280) {
        const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
        expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(2);
        expect(boxes[2].x).toBeGreaterThan(boxes[1].x + boxes[1].width);
      }
      if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      for (const control of controls) {
        await control.focus();
        await expect(control).toBeFocused();
        const box = await control.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      await page.screenshot({ path: `../tmp/start-interview-${plan}-${width}.png`, fullPage: true });
      await link.press('Enter');
      await expect(page).toHaveURL(plan === 'pro' ? /\/app\/interview$/ : /\/app\/account$/);
      api.assertHermetic();
    });
  }
}
