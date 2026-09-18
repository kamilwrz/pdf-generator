import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const copy = {
  pl: { title: 'Asystent CV', heading: 'Które CV chcesz ulepszyć?', cvs: 'Moje CV', imports: 'Importy', search: 'Szukaj po nazwie', next: 'Następna strona', empty: 'Brak wyników.', clear: 'Wyczyść wyszukiwanie' },
  en: { title: 'CV Assistant', heading: 'Which CV would you like to improve?', cvs: 'My CVs', imports: 'Imports', search: 'Search by name', next: 'Next page', empty: 'No matches.', clear: 'Clear search' },
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
    await expect(page.getByRole('tab', { name: `${t.cvs} 37` })).toBeVisible();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('listitem')).toHaveCount(4);
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
    await expect(panel.getByRole('button', { name: 'CV 5 — Analityk danych', exact: true })).toBeVisible();
    const cvTab = page.getByRole('tab', { name: `${t.cvs} 37` });
    await cvTab.focus(); await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: `${t.imports} 15` })).toBeFocused();
    await expect(panel.getByRole('button', { name: 'Import 1.pdf', exact: true })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(panel.getByRole('button', { name: 'CV 5 — Analityk danych', exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: t.search }).fill('CV 37');
    await expect(panel.getByRole('listitem')).toHaveCount(1);
    await expect(panel.getByRole('button', { name: 'CV 37 — Analityk danych', exact: true })).toBeVisible();
    await page.getByRole('searchbox').fill('missing');
    await expect(panel).toContainText(t.empty);
    await page.getByRole('button', { name: t.clear }).click();
    await expect(page.getByRole('searchbox')).toBeFocused();
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(writes).toEqual([]);
    for (const control of await panel.getByRole('listitem').getByRole('button').all()) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: test.info().outputPath(`source-${language}-${width}.png`), fullPage: true });
  });
}

test('import-only account opens imports and exposes recovery in the empty CV tab', async ({ page }) => {
  const writes = await fixture(page, 'pl', { documents: [], imports: [{ id: 7, filename: 'Anna.pdf' }] });
  await page.goto('/app/interview');
  await expect(page.getByRole('tab', { name: 'Importy 1' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Moje CV 0' }).click();
  await expect(page.getByRole('link', { name: 'Utwórz CV ręcznie', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
