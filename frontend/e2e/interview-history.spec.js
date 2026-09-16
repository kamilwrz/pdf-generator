import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const copy = {
  pl: { tab: /Zapisane rozmowy/, remove: 'Usuń rozmowę', confirm: 'Usuń tę rozmowę', cancel: 'Anuluj', activity: 'Ostatnia aktywność', older: 'Pokaż starsze rozmowy', empty: 'Nie masz jeszcze zapisanych rozmów.' },
  en: { tab: /Saved conversations/, remove: 'Delete conversation', confirm: 'Delete this conversation', cancel: 'Cancel', activity: 'Last activity', older: 'Show older conversations' },
};
const sample = (id, overrides = {}) => ({
  id, mode: 'tailor', phase: 'question', created_at: '2026-09-16T08:15:00+00:00', updated_at: '2026-09-16T14:32:00+00:00',
  candidate_name: 'Anna Nowak', target_role: 'Analityczka danych', source_title: 'Anna — CV bazowe',
  offer_title: 'Analityk AML', offer_company: 'Bank A', offer_excerpt: 'Analiza transakcji i kontrola jakości danych.',
  answer_count: 3, last_question: 'Po czym rozpoznajesz, że transakcja wymaga dalszego sprawdzenia?', document_id: 41,
  ...overrides,
});

async function history(page, language, { many = false, failDelete = false, single = false, holdDelete = false } = {}) {
  const api = await installMockApi(page);
  await page.addInitScript((lang) => {
    localStorage.setItem('token', 'local-playwright-token'); localStorage.setItem('username', 'Anna');
    localStorage.setItem('cvstudio.uiLanguage', lang);
  }, language);
  await page.route('**/api/career-profile**', (route) => route.fulfill({ json: { revision: 0, facts: [], sources: { documents: [], imports: [] } } }));
  let items = [sample('bank-a'), sample('bank-b', { offer_company: 'Bank B', updated_at: '2026-09-16T12:00:00+00:00' }),
    sample('create', { mode: 'create', source_title: 'CV — rekrutacja wrzesień', offer_title: '', offer_company: '', offer_excerpt: '', last_question: '', document_id: null }),
    { id: 'legacy', mode: 'create', phase: 'ready', updated_at: '2026-09-15T09:00:00' }];
  if (many) items = Array.from({ length: 50 }, (_, i) => sample(`session-${i}`, { source_title: `CV ${i}`, offer_company: `Bank ${i}` }));
  if (single) items = items.slice(0, 1);
  const deletes = [], offsets = [];
  let releaseDelete;
  const deletionReady = new Promise((resolve) => { releaseDelete = resolve; });
  let fail = failDelete;
  await page.route('**/api/ai/interviews**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'DELETE') {
      const id = url.pathname.split('/').pop(); deletes.push(id);
      if (fail) { fail = false; return route.fulfill({ status: 503, json: { detail: 'Temporary delete failure' } }); }
      if (holdDelete) await deletionReady;
      items = items.filter((item) => item.id !== id);
      return route.fulfill({ json: { deleted: true } });
    }
    const offset = Number(url.searchParams.get('offset') || 0); offsets.push(offset);
    return route.fulfill({ json: { items: offset ? [sample('older', { offer_company: 'Older Bank' })] : items, next_offset: many && !offset ? 50 : null } });
  });
  await page.goto('/app/career-profile');
  await page.getByRole('button', { name: copy[language].tab }).click();
  return { api, deletes, offsets, releaseDelete };
}

for (const language of ['pl', 'en']) {
  for (const width of [390, 834, 1280, 1920]) {
    test(`saved conversations are identifiable and deletable (${language}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const state = await history(page, language);
      const labels = copy[language];
      const first = page.getByRole('listitem', { name: 'Analityk AML · Bank A' });
      await expect(first).toContainText('Anna — CV bazowe');
      await expect(first).toContainText(labels.activity);
      await expect(first.locator('time').first()).toHaveAttribute('datetime', '2026-09-16T14:32:00.000Z');
      await expect(first).toContainText('16:32'); // Browser timezone is fixed to Europe/Warsaw below.
      await expect(page.getByRole('heading', { name: 'Analityk AML · Bank B' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'CV — rekrutacja wrzesień' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/history-${language}-${width}.png`, fullPage: true });
      const trigger = first.getByRole('button', { name: labels.remove, exact: true });
      await trigger.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Analityk AML · Bank A' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: labels.cancel, exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      expect(state.deletes).toEqual([]);
      await trigger.click();
      if (width === 834) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await expect(dialog.getByRole('button', { name: labels.confirm, exact: true })).toBeInViewport();
      await page.screenshot({ path: `test-results/history-delete-${language}-${width}.png`, fullPage: true });
      await dialog.getByRole('button', { name: labels.confirm, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(first).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 2, name: labels.tab })).toBeFocused();
      await expect(page.getByRole('listitem', { name: 'Analityk AML · Bank B' })).toBeVisible();
      expect(state.deletes).toEqual(['bank-a']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      state.api.assertHermetic();
    });
  }
}

test.use({ timezoneId: 'Europe/Warsaw' });

test('failed deletion retains context and retry fixes the older-page offset', async ({ page }) => {
  const state = await history(page, 'pl', { many: true, failDelete: true });
  const row = page.getByRole('listitem', { name: 'Analityk AML · Bank 0', exact: true });
  await row.getByRole('button', { name: copy.pl.remove, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: copy.pl.confirm, exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Temporary delete failure');
  await expect(row).toHaveCount(1);
  await expect(dialog.getByRole('heading', { name: 'Analityk AML · Bank 0', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: copy.pl.confirm, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: copy.pl.older }).click();
  // React StrictMode can repeat the initial read; the continuation must use
  // the corrected offset regardless of development-only mount behaviour.
  await expect.poll(() => state.offsets.at(-1)).toBe(49);
  expect(state.deletes).toEqual(['session-0', 'session-0']);
  state.api.assertHermetic();
});

test('pending deletion blocks duplicate actions and ends in the empty list', async ({ page }) => {
  const state = await history(page, 'pl', { single: true, holdDelete: true });
  await page.getByRole('button', { name: copy.pl.remove, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: copy.pl.confirm, exact: true }).click();
  await expect(dialog.getByRole('button', { name: copy.pl.confirm, exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: copy.pl.cancel, exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect.poll(() => state.deletes).toEqual(['bank-a']);
  state.releaseDelete();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: copy.pl.tab })).toBeFocused();
  await expect(page.getByText(copy.pl.empty, { exact: true })).toBeVisible();
  state.api.assertHermetic();
});
