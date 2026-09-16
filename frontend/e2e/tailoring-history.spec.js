import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

test.use({ timezoneId: 'Europe/Warsaw' });
const copy = {
  pl: { history: 'Wróć do dopasowania', resume: 'Kontynuuj dopasowanie', activity: 'Ostatnia aktywność', excerpt: 'Fragment ogłoszenia', empty: 'Nie masz jeszcze zapisanych dopasowań.', loading: 'Wczytywanie zapisanego postępu…', reload: 'Wczytaj zapisany stan', start: 'Dodaj CV' },
  en: { history: 'Resume tailoring', resume: 'Continue tailoring', activity: 'Last activity', excerpt: 'Advert excerpt', empty: 'No saved tailoring yet.', loading: 'Loading saved progress…', reload: 'Load saved progress', start: 'Add your CV' },
};
const base = { created_at: '2026-09-16T08:15:00+00:00', updated_at: '2026-09-16T14:32:00+00:00', answer_count: 0 };
const items = [
  { ...base, id: 'offer-a', phase: 'question', offer_title: 'Analityk AML', offer_company: 'Bank A', candidate_name: 'Anna Nowak', source_title: 'Anna — CV bazowe', answer_count: 3, last_question: 'Jak sprawdzasz transakcje?' },
  { ...base, id: 'offer-b', phase: 'completed', offer_title: 'Analityk AML', offer_company: 'Bank B', source_title: 'Anna — CV bazowe', document_id: 41 },
  { ...base, id: 'pasted', phase: 'offer', source_title: 'Anna.pdf', offer_excerpt: 'Specjalista ds. raportowania w Example. Praca z SQL i Excel.', updated_at: '2026-09-16T12:00:00Z' },
  { ...base, id: 'linked', phase: 'offer', source_title: 'Anna.pdf', offer_url: `https://jobs.example/analyst/${'long-path-'.repeat(24)}` },
  { ...base, id: 'empty', phase: 'source' },
];

/** Fixtures isolate list/resume requests from paid AI and production data. */
async function setup(page, language, { hold = false, fail = false, empty = false } = {}) {
  await installMockApi(page);
  await page.addInitScript(lang => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('cvstudio.uiLanguage', lang);
  }, language);
  const calls = [];
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let failing = fail;
  await page.route('**/api/tailoring**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    calls.push({ method: request.method(), pathname });
    if (pathname.endsWith('/sources')) return route.fulfill({ json: { documents: [], imports: [] } });
    if (!pathname.endsWith('/tailoring')) return route.fulfill({ json: { id: 'offer-a', revision: 1, step: 'source', language, source_kind: null, source_id: null, offer_kind: 'text', job_description: '', job_offer_url: '' } });
    if (hold) await ready;
    if (failing) return route.fulfill({ status: 503, json: { detail: 'History unavailable' } });
    return route.fulfill({ json: { items: empty ? [] : items } });
  });
  return { calls, release, recover: () => { failing = false; } };
}

for (const language of ['pl', 'en']) {
  for (const width of [390, 834, 1280, 1920]) {
    test(`tailoring history shows saved context (${language}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const state = await setup(page, language);
      await page.goto('/app/tailor');
      const region = page.getByRole('region', { name: copy[language].history });
      const first = region.getByRole('listitem', { name: 'Analityk AML · Bank A', exact: true });
      await expect(first).toContainText('Anna — CV bazowe');
      await expect(first).toContainText('Anna Nowak');
      await expect(first).toContainText(copy[language].activity);
      await expect(first).toContainText('16:32');
      await expect(first).toContainText('Jak sprawdzasz transakcje?');
      await expect(first.locator('dd').last()).toHaveText('3');
      await expect(first.locator('time').first()).toHaveAttribute('datetime', '2026-09-16T14:32:00.000Z');
      await expect(region.getByRole('heading', { name: 'Analityk AML · Bank B' })).toBeVisible();
      await expect(region.getByText(/Specjalista ds. raportowania/)).toBeVisible();
      await expect(region.getByText(/https:\/\/jobs.example/)).toBeVisible();
      await expect(region.locator('a[href="/app/documents/41"]')).toHaveCount(1);
      await expect(region.getByRole('listitem')).toHaveCount(5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/tailoring-history-${language}-${width}.png`, fullPage: true });
      if (width === 834) {
        await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      const resume = first.getByRole('link', { name: copy[language].resume });
      await resume.focus();
      await expect(resume).toBeFocused();
      expect(await resume.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
      expect((await resume.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/app\/tailor\/offer-a$/);
      await page.goBack();
      await expect(region.getByRole('heading', { name: 'Analityk AML · Bank A' })).toBeVisible();
      expect(state.calls.every(call => call.method === 'GET')).toBe(true);
    });
  }
}

test('loading, failed read, explicit retry and empty history stay distinct', async ({ page }) => {
  const state = await setup(page, 'pl', { hold: true, fail: true, empty: true });
  await page.goto('/app/tailor');
  await expect(page.getByRole('status')).toHaveText(copy.pl.loading);
  await expect(page.getByText(copy.pl.empty, { exact: false })).toHaveCount(0);
  state.release();
  await expect(page.getByRole('alert')).toContainText('History unavailable');
  await expect(page.getByText(copy.pl.empty, { exact: false })).toHaveCount(0);
  state.recover();
  await page.getByRole('button', { name: copy.pl.reload }).click();
  await expect(page.getByText(copy.pl.empty, { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.pl.start, exact: true })).toBeEnabled();
  expect(state.calls.every(call => call.method === 'GET')).toBe(true);
});
