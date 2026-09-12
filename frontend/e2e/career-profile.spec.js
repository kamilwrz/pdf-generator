import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

function sampleFacts() {
  const facts = [];
  const add = (path, text, context = '') => facts.push({ id: `fact-${facts.length}`, path, text, context, kind: 'fact', source: 'document:30' });
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
  let profile = { revision: 1, facts: sampleFacts(), source_binding: { kind: 'document', id: 30 }, source_available: true };
  const original = structuredClone(profile.facts);
  await page.route('**/api/career-profile**', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      if (route.request().url().endsWith('/source')) {
        const notes = profile.facts.filter((fact) => fact.source === 'manual' || fact.question);
        const selected = sampleFacts().filter((fact) => !fact.question).map((fact) => ({ ...fact, source: `${body.kind}:${body.id}`, text: fact.path === '/experience/0/company' && body.id !== 30 ? 'Nowa firma ze źródła' : fact.text }));
        profile = { ...profile, facts: [...selected, ...notes], source_binding: { kind: body.kind, id: body.id }, revision: profile.revision + 1 };
      } else profile = { ...profile, ...body, revision: profile.revision + 1 };
    }
    if (route.request().method() === 'DELETE') profile = { ...profile, revision: profile.revision + 1, facts: [], source_binding: null };
    await route.fulfill({ json: { ...profile, sources: { documents: [{ id: 30, title: 'Anna CV' }, { id: 31, title: 'Drugie CV' }], imports: [{ id: 40, filename: 'Import CV.pdf' }] } } });
  });
  await page.route('**/api/ai/interviews*', (route) => route.fulfill({ json: { items: [{ id: 'saved', mode: 'create', phase: 'clarification', updated_at: '2026-09-10T10:00:00' }], next_offset: null } }));
  return { base, original, current: () => profile, changeSavedNote: () => { profile = { ...profile, revision: profile.revision + 1, facts: profile.facts.map((fact) => fact.question ? { ...fact, text: 'Saved in another window' } : fact) }; } };
}

for (const width of [390, 834, 1280, 1920]) {
  test(`career profile reads source records and edits only notes at ${width}px`, async ({ page }) => {
    const api = await installProfile(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app/career-profile');
    await expect(page.getByRole('button', { name: /Otwórz wpis:/ })).toHaveCount(3);
    await expect(page.locator('textarea')).toHaveCount(0);
    if (width >= 1280) await expect(page.getByLabel('Sekcja profilu')).not.toBeVisible();
    if (width === 390) await expect(page.getByLabel('Sekcja profilu')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(width === 390 ? 2400 : 1800);
    await page.screenshot({ path: `../tmp/career-profile-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Otwórz wpis: Starsza analityczka' }).click();
    await expect(page.getByRole('heading', { name: 'Starsza analityczka' })).toBeFocused();
    if (width === 834) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await expect(page.getByRole('button', { name: /^Edytuj:/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Usuń informację:/ })).toHaveCount(0);
    await expect(page.getByLabel('Dodaj do tego wpisu')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Edytuj w edytorze CV' })).toHaveAttribute('href', '/app/documents/30');
    await page.getByLabel('Szukaj w profilu').fill('Niemiecki');
    await expect(page.getByRole('button', { name: /Otwórz wpis:/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Otwórz wpis: Niemiecki' }).click();
    await expect(page.locator('dl').getByText('B2', { exact: true })).toBeVisible();
    await page.getByLabel('Szukaj w profilu').fill('podzieliłaś się wiedzą');
    await page.getByRole('button', { name: 'Otwórz wpis: Jak podzieliłaś się wiedzą z zespołem?' }).click();
    await expect(page.getByText('Pytanie z wywiadu', { exact: true })).toBeVisible();
    await expect(page.getByText('Twoja odpowiedź', { exact: true })).toBeVisible();
    await expect(page.getByText('Przeprowadziłam warsztat z raportowania dla zespołu.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Edytuj:/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Twoja odpowiedź', { exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Zapisz profil', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Źródło danych profilu', exact: true })).toBeDisabled();
    await page.getByText('Kontekst i sposób wykorzystania', { exact: true }).click();
    await expect(page.getByLabel('Rodzaj informacji')).toHaveCount(0);
    await expect(page.getByLabel('Przeznaczenie')).toHaveCount(0);
    await page.getByLabel('Twoja odpowiedź', { exact: true }).fill('Przeprowadziłam dwa warsztaty dla zespołu.');
    await page.screenshot({ path: `../tmp/career-profile-answer-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Zastosuj zmianę' }).click();
    await page.getByRole('combobox', { name: 'Źródło danych profilu', exact: true }).selectOption('document:31');
    await expect(page.getByText('Dane profilu zaktualizowane.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zapisz profil', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
    await expect(page.getByText('Profil zapisany.', { exact: true })).toBeVisible();
    expect(api.current().facts.find((f) => f.question).text).toBe('Przeprowadziłam dwa warsztaty dla zespołu.');
    expect(api.current().facts.find((f) => f.path === '/experience/0/company').text).toBe('Nowa firma ze źródła');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Źródło danych profilu', exact: true })).toHaveValue('document:31');
    await page.getByRole('combobox', { name: 'Źródło danych profilu', exact: true }).selectOption('import:40');
    await expect(page.getByRole('link', { name: 'Przejdź do importów w edytorze' })).toHaveAttribute('href', '/app/import');
    await page.getByRole('button', { name: /Zapisane wywiady/ }).click();
    await expect(page.getByRole('link', { name: 'Wznów wywiad' })).toBeVisible();
    api.base.assertHermetic();
  });
}


test('source selection and read-only controls work in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cvstudio.uiLanguage', 'en'));
  const api = await installProfile(page);
  await page.goto('/app/career-profile');
  const source = page.getByRole('combobox', { name: 'Profile data source', exact: true });
  await source.selectOption('document:31');
  await expect(page.getByText('Profile data updated.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit in the CV editor' })).toHaveAttribute('href', '/app/documents/31');
  await page.getByRole('button', { name: 'Open entry: Starsza analityczka' }).click();
  await expect(page.getByRole('button', { name: /^Edit:/ })).toHaveCount(0);
  api.base.assertHermetic();
});

test('failed selection retains the active source and can be retried', async ({ page }) => {
  const api = await installProfile(page);
  let attempts = 0;
  await page.route('**/api/career-profile/source', async (route) => {
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 503, json: { detail: 'Source temporarily unavailable' } });
    else await route.fallback();
  });
  await page.goto('/app/career-profile');
  const source = page.getByRole('combobox', { name: 'Źródło danych profilu', exact: true });
  await source.selectOption('document:31');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(source).toHaveValue('document:30');
  expect(attempts).toBe(1);
  await source.selectOption('document:31');
  await expect(source).toHaveValue('document:31');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toBe(2);
  api.base.assertHermetic();
});

test('refresh never rebases local notes over a concurrent saved edit', async ({ page }) => {
  const api = await installProfile(page);
  await page.goto('/app/career-profile');
  await page.getByLabel('Szukaj w profilu').fill('podzieliłaś');
  await page.getByRole('button', { name: /Otwórz wpis:/ }).click();
  await page.getByRole('button', { name: /^Edytuj:/ }).click();
  await page.getByLabel('Twoja odpowiedź', { exact: true }).fill('My unsaved note');
  await page.getByRole('button', { name: 'Zastosuj zmianę' }).click();
  api.changeSavedNote();
  await page.getByRole('button', { name: 'Odśwież dane z CV' }).click();
  await expect(page.getByRole('alert')).toContainText('Notatki zmieniły się w innym oknie');
  await expect(page.getByText('My unsaved note', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zapisz profil', exact: true })).toBeDisabled();
  expect(api.current().facts.find((fact) => fact.question).text).toBe('Saved in another window');
  await page.getByRole('button', { name: 'Wczytaj zapisane notatki i odrzuć lokalne zmiany' }).click();
  await expect(page.getByText('Saved in another window', { exact: true })).toBeVisible();
  api.base.assertHermetic();
});


test('clearing an unavailable source restores focus without repopulating the profile', async ({ page }) => {
  const api = await installProfile(page);
  let profile = { revision: 4, facts: [], source_binding: { kind: 'document', id: 30 }, source_available: false, sources: { documents: [], imports: [] } };
  await page.route('**/api/career-profile**', async (route) => {
    if (route.request().method() === 'DELETE') profile = { ...profile, revision: 5, source_binding: null };
    await route.fulfill({ json: profile });
  });
  await page.goto('/app/career-profile');
  await expect(page.getByRole('combobox', { name: 'Źródło danych profilu', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Wyczyść profil', exact: true }).click();
  await page.getByRole('button', { name: /^Potwierd/ }).click();
  await expect(page.getByRole('button', { name: 'Moje informacje', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Źródło danych profilu', exact: true })).toHaveCount(0);
  expect(profile.facts).toEqual([]);
  api.base.assertHermetic();
});
