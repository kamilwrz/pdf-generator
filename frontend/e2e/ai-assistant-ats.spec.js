import { expect, test } from '@playwright/test';
import { installMockApi, login } from './support/mockApi.js';

for (const width of [390, 834, 1280, 1920]) {
  test(`ATS quick action runs without a CV review at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    const api = await installMockApi(page, {
      assistantResponses: [{ message: 'Ocena ATS gotowa.', rating: 8, tips: [], corrections: [] }],
    });
    await login(page);
    await page.getByText('Kontynuuj ostatnie CV', { exact: true }).click();
    await page.getByRole('button', { name: 'Otwórz asystenta AI' }).click();
    const panel = page.getByRole('complementary', { name: 'Asystent AI' });
    const ats = panel.getByRole('button', { name: 'Oceń ATS', exact: true });
    const actions = ats.locator('..').getByRole('button');
    await expect(actions).toHaveCount(6);
    await expect(ats).toBeEnabled();
    expect(api.calls.filter(call => call.path === '/ai/assistant')).toHaveLength(0);

    // Native keyboard activation must reach ATS from the initial interview focus.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(ats).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('log')).toContainText('Ocena ATS gotowa.');
    await expect(ats).toBeEnabled();
    const requests = api.calls.filter(call => call.path === '/ai/assistant');
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].body).action).toBe('ats_score');
    for (const button of await actions.all()) {
      const bounds = await button.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    api.assertHermetic();
  });
}
