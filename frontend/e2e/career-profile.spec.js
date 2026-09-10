import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

function sampleFacts() {
  const facts = [];
  const add = (path, text, context = '') => facts.push({ id: `fact-${facts.length}`, path, text, context, kind: 'fact', source: 'manual' });
  add('/name', 'Anna Nowak'); add('/title', 'Analityczka danych i procesów'); add('/email', 'anna@example.com'); add('/summary', 'Łączę analizę danych z usprawnianiem procesów operacyjnych.');
  const roles = [['Starsza analityczka', 'Northstar Finance', '2023 — obecnie'], ['Analityczka procesów', 'Studio Systems', '2020 — 2023'], ['Specjalistka ds. operacji', 'Example Group', '2018 — 2020']];
  roles.forEach(([title, company, period], i) => {
    const context = `${title} · ${company} · ${period}`;
    add(`/experience/${i}/title`, title, context); add(`/experience/${i}/company`, company, context); add(`/experience/${i}/period`, period, context); add(`/experience/${i}/city`, 'Warszawa', context);
    ['Analiza raportów i rekomendacje usprawnień procesów.', 'Współpraca z zespołami operacyjnymi i produktowymi.', 'Tworzenie dashboardów i dokumentacji procesów.', 'Kontrola jakości danych i terminowości raportowania.', 'Wdrożenie automatyzacji powtarzalnych zadań.', 'Szkolenie nowych członków zespołu.'].forEach((text, n) => add(`/experience/${i}/bullets/${n}`, text, context));
  });
  add('/education/0/degree', 'Analityka gospodarcza'); add('/education/0/school', 'Uniwersytet Ekonomiczny'); add('/education/0/period', '2014 — 2018');
  ['SQL', 'Python', 'Power BI', 'Excel', 'Analiza procesów', 'Raportowanie', 'Prezentacja danych', 'Zarządzanie projektami', 'Dokumentacja', 'Kontrola jakości', 'Komunikacja', 'Praca zespołowa'].forEach((name, i) => add(`/skills/${i}`, name));
  add('/languages/0/name', 'Angielski'); add('/languages/0/level', 'C1'); add('/languages/1/name', 'Niemiecki'); add('/languages/1/level', 'B2');
  add('/custom_sections/0/title', 'Projekty'); add('/custom_sections/0/kind', 'projects'); add('/custom_sections/0/items/0/title', 'Atlas danych'); add('/custom_sections/0/items/0/bullets/0', 'Dashboard do monitorowania jakości danych.');
  facts.push({ id: `fact-${facts.length}`, path: '', text: 'Przeprowadziłam warsztat z raportowania dla zespołu.', context: 'Dodatkowe osiągnięcia', question: 'Jak podzieliłaś się wiedzą z zespołem?', kind: 'fact', source: 'interview:saved' });
  return facts;
}

async function installProfile(page) {
  const base = await installMockApi(page);
  await page.addInitScript(() => { localStorage.setItem('token', 'local-playwright-token'); localStorage.setItem('username', 'Anna'); });
  let profile = { revision: 1, facts: sampleFacts() };
  const original = structuredClone(profile.facts);
  await page.route('**/api/career-profile*', async (route) => {
    if (route.request().method() === 'PUT') profile = { ...route.request().postDataJSON(), revision: profile.revision + 1 };
    await route.fulfill({ json: profile });
  });
  await page.route('**/api/ai/interviews*', (route) => route.fulfill({ json: { items: [{ id: 'saved', mode: 'create', phase: 'clarification', updated_at: '2026-09-10T10:00:00' }], next_offset: null } }));
  return { base, original, current: () => profile };
}

for (const width of [390, 834, 1280, 1920]) {
  test(`career profile groups real records and edits safely at ${width}px`, async ({ page }) => {
    const api = await installProfile(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/career-profile');
    await expect(page.getByRole('button', { name: /Otwórz wpis:/ })).toHaveCount(3);
    await expect(page.locator('textarea')).toHaveCount(0);
    if (width >= 1280) await expect(page.getByLabel('Sekcja profilu')).not.toBeVisible();
    if (width === 390) await expect(page.getByLabel('Sekcja profilu')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(width === 390 ? 2100 : 1600);
    await page.screenshot({ path: `../tmp/career-profile-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Otwórz wpis: Starsza analityczka' }).click();
    await expect(page.getByRole('heading', { name: 'Starsza analityczka' })).toBeFocused();
    if (width === 834) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await page.getByRole('button', { name: 'Edytuj: Firma — Northstar Finance' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Treść', { exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Zapisz profil', exact: true })).toBeDisabled();
    await page.getByLabel('Treść', { exact: true }).fill('Northstar Analytics');
    await page.screenshot({ path: `../tmp/career-profile-edit-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Zastosuj zmianę' }).click();
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(page.getByText('Profil zapisany.', { exact: true })).toBeVisible();
    expect(api.current().facts.map((f) => f.id)).toEqual(api.original.map((f) => f.id));
    expect(api.current().facts.find((f) => f.path === '/experience/0/company').text).toBe('Northstar Analytics');
    await page.getByLabel('Szukaj w profilu').fill('Niemiecki');
    await expect(page.getByRole('button', { name: /Otwórz wpis:/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Otwórz wpis: Niemiecki' }).click();
    await expect(page.locator('dl').getByText('B2', { exact: true })).toBeVisible();
    await page.getByLabel('Szukaj w profilu').fill('podzieliłaś się wiedzą');
    await page.getByRole('button', { name: 'Otwórz wpis: Jak podzieliłaś się wiedzą z zespołem?' }).click();
    await expect(page.getByText('Pytanie z wywiadu', { exact: true })).toBeVisible();
    await expect(page.getByText('Twoja odpowiedź', { exact: true })).toBeVisible();
    await expect(page.getByText('Przeprowadziłam warsztat z raportowania dla zespołu.', { exact: true })).toBeVisible();
    await page.screenshot({ path: `../tmp/career-profile-answer-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /Zapisane wywiady/ }).click();
    await expect(page.getByRole('link', { name: 'Wznów wywiad' })).toBeVisible();
    api.base.assertHermetic();
  });
}
