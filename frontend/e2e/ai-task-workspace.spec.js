import { expect, test } from '@playwright/test';
import { installMockApi, login } from './support/mockApi.js';

test('task home and explicit correction review reflow without changing PDF content until acceptance', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await installMockApi(page, { assistantResponses: [{ message: 'Propozycja do przejrzenia.', tips: [], corrections: [{ element_id: 'saved-name', content: 'Kamil Nowak' }] }] });
  await login(page);
  await page.getByText('Kontynuuj ostatnie CV', { exact: true }).click();
  await page.getByRole('button', { name: 'Otwórz asystenta AI' }).click();
  const panel = page.getByRole('complementary', { name: 'Asystent AI' });
  for (const width of [390, 834, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    for (const button of await panel.getByRole('button').all()) {
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await panel.screenshot({ path: testInfo.outputPath(`assistant-home-${width}.png`) });
  }
  await panel.getByRole('button', { name: 'Popraw treść', exact: true }).click();
  await panel.getByRole('button', { name: 'Sprawdź błędy', exact: true }).click();
  const review = panel.locator('details[data-state]').first();
  await expect(review).toBeVisible();
  await expect(review.getByText('Kamil Smoke', { exact: true })).toBeVisible();
  await expect(page.locator('#saved-name')).toHaveText('Kamil Smoke');
  await review.locator('summary').click();
  await review.hover();
  await expect(review).not.toHaveAttribute('open');
  await review.locator('summary').focus();
  await review.locator('summary').press('Enter');
  await expect(review.getByText('Kamil Nowak', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 740 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath('assistant-review-zoom.png') });
  await review.getByRole('button', { name: 'Zastosuj', exact: true }).click();
  await expect(page.locator('#saved-name')).toHaveText('Kamil Nowak');
  await expect(review.getByRole('status')).toHaveText('Zastosowano');
  await expect(review.getByText('Kamil Smoke', { exact: true })).toBeVisible();
  await expect(review.locator('summary')).toBeFocused();
  expect(api.calls.filter(call => call.path === '/ai/assistant')).toHaveLength(1);
  api.assertHermetic();
});

test('offer source drafts survive navigation and only the selected source is sent', async ({ page }) => {
  const api = await installMockApi(page, { assistantResponses: [{ message: 'Analiza gotowa.', tips: [], corrections: [], job_requirements: [] }] });
  await login(page);
  await page.getByText('Kontynuuj ostatnie CV', { exact: true }).click();
  await page.getByRole('button', { name: 'Otwórz asystenta AI' }).click();
  await page.getByRole('button', { name: 'Dopasuj do oferty', exact: true }).click();
  await page.locator('#ai-job-offer-url').fill('https://example.com/job');
  await page.getByRole('radio', { name: 'Wklej treść', exact: true }).check();
  await page.locator('#ai-job-description').fill('SQL i raportowanie');
  await page.getByRole('radio', { name: 'Link', exact: true }).check();
  await expect(page.locator('#ai-job-offer-url')).toHaveValue('https://example.com/job');
  await page.getByRole('button', { name: 'Wróć do działań asystenta' }).click();
  await page.getByRole('button', { name: 'Dopasuj do oferty', exact: true }).click();
  await page.getByRole('radio', { name: 'Wklej treść', exact: true }).check();
  await expect(page.locator('#ai-job-description')).toHaveValue('SQL i raportowanie');
  await page.getByRole('button', { name: 'Tylko analiza' }).click();
  await expect(page.getByText('Analiza gotowa.', { exact: true })).toBeVisible();
  const payload = JSON.parse(api.calls.find(call => call.path === '/ai/assistant').body);
  expect(payload.job_description).toBe('SQL i raportowanie');
  expect(payload.job_offer_url || '').toBe('');
  api.assertHermetic();
});
