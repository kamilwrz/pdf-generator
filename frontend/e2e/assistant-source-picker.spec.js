import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const copy = {
  pl: { title: 'Asystent CV', heading: 'Które CV chcesz ulepszyć?', sources: 'Źródło CV', search: 'Szukaj po nazwie', next: 'Następna strona', empty: 'Brak wyników.', upload: 'CV w PDF (do 10 MB)', clear: 'Wyczyść wyszukiwanie' },
  en: { title: 'CV Assistant', heading: 'Which CV would you like to improve?', sources: 'CV source', search: 'Search by name', next: 'Next page', empty: 'No matches.', upload: 'CV as PDF (up to 10 MB)', clear: 'Clear search' },
};

/** A large synthetic library catches accidental unbounded lists without paid AI. */
async function fixture(page, language, sources) {
  await installMockApi(page);
  await page.addInitScript(lang => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('cvstudio.uiLanguage', lang);
  }, language);
  const writes = [];
  await page.route('**/api/career-profile**', route => route.fulfill({ json: { revision: 0, facts: [], sources } }));
  await page.route('**/api/ai/interviews**', route => {
    writes.push(route.request().method());
    return route.fulfill({ status: 503, json: { detail: 'Unexpected interview request' } });
  });
  return writes;
}

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`bounded source selection ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const writes = await fixture(page, language, {
      documents: Array.from({ length: 37 }, (_, i) => ({ id: i + 1, title: `CV ${i + 1} — Analityk danych` })),
      imports: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, filename: `Import ${i + 1}.pdf` })),
    });
    const t = copy[language];
    await page.goto('/app/interview');
    await expect(page.getByRole('heading', { name: t.heading, exact: true })).toHaveCount(1);
    // One combined collection replaces the former tab navigation entirely.
    await expect(page.getByRole('tab')).toHaveCount(0);
    const list = page.getByRole('list', { name: t.sources });
    await expect(list.getByRole('listitem')).toHaveCount(4);
    if (width >= 1280) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      const title = await page.getByRole('heading', { level: 1, name: t.title }).boundingBox();
      // The Pro badge belongs to the centred heading group.
      const group = await page.getByRole('heading', { level: 1, name: t.title }).evaluate(el => {
        const bounds = el.parentElement.getBoundingClientRect();
        return { centre: bounds.x + bounds.width / 2, width: bounds.width };
      });
      expect(Math.abs(group.centre - width / 2)).toBeLessThan(2);
      expect(title.y).toBeGreaterThan(70);
    }
    await page.getByRole('button', { name: t.next }).click();
    await expect(list.getByRole('button', { name: 'CV 5 — Analityk danych', exact: true })).toBeVisible();
    // The search spans saved CVs and imports without any tab switch.
    await page.getByRole('searchbox', { name: t.search }).fill('Import 1.pdf');
    const importRow = list.getByRole('button', { name: 'Import 1.pdf', exact: true });
    await expect(importRow).toBeVisible();
    await expect(importRow).toHaveAccessibleDescription('Import');
    await page.getByRole('searchbox').fill('CV 37');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByRole('button', { name: 'CV 37 — Analityk danych', exact: true })).toHaveAccessibleDescription('CV');
    await page.getByRole('searchbox').fill('missing');
    await expect(page.getByRole('status').filter({ hasText: t.empty })).toBeVisible();
    await page.getByRole('button', { name: t.clear }).click();
    await expect(page.getByRole('searchbox')).toBeFocused();
    await expect(page.getByLabel(t.upload)).toBeVisible();
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(writes).toEqual([]);
    for (const control of await list.getByRole('listitem').getByRole('button').all()) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: test.info().outputPath(`source-${language}-${width}.png`), fullPage: true });
  });
}

test('import-only account lists its import with upload and manual creation available', async ({ page }) => {
  const writes = await fixture(page, 'pl', { documents: [], imports: [{ id: 7, filename: 'Anna.pdf' }] });
  await page.goto('/app/interview');
  await expect(page.getByRole('button', { name: 'Anna.pdf', exact: true })).toBeVisible();
  await expect(page.getByLabel('CV w PDF (do 10 MB)')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Szukaj po nazwie' }).fill('missing');
  await page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click();
  await expect(page.getByRole('button', { name: 'Anna.pdf', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
