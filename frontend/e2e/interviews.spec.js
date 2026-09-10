import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const ID = 'f1fc439c-84f1-45ad-b23c-a3e384a81d3a';
const nameFact = { id: 'name', text: 'Anna Nowak', path: '/name', kind: 'fact', source: 'manual', context: '' };

async function installInterviewApi(page) {
  const base = await installMockApi(page);
  await page.addInitScript(() => { localStorage.setItem('token', 'local-playwright-token'); localStorage.setItem('username', 'Kamil'); });
  let profile = { revision: 0, facts: [] };
  let session = null;
  const calls = [];
  await page.route('**/api/career-profile*', async (route) => {
    if (route.request().method() === 'PUT') profile = { ...route.request().postDataJSON(), revision: profile.revision + 1 };
    if (route.request().method() === 'DELETE') profile = { revision: profile.revision + 1, facts: [] };
    await route.fulfill({ json: profile });
  });
  await page.route('**/api/ai/interviews**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body = method === 'POST' ? route.request().postDataJSON() : null;
    calls.push({ path, method, body });
    let result;
    if (path.endsWith('/interviews') && method === 'GET') result = { items: session ? [{ ...session, updated_at: '2026-09-10T10:00:00' }] : [], next_offset: null };
    else if (path.endsWith('/interviews') && method === 'POST') {
      session = { id: ID, revision: 1, mode: body.mode, source_document_id: body.source_document_id || null, phase: 'intake', language: 'pl', profile_revision: 0, template_id: body.template_id || null, question_limit: body.mode === 'tailor' ? 5 : 8, answers: [], question: null, requirements: [], proposed_facts: [nameFact], confirmed: false, preview: null, source_cv_data: { name: 'Anna Nowak' } };
      result = session;
    } else if (path.endsWith('/confirm')) {
      profile = { revision: profile.revision + 1, facts: body.facts };
      session = { ...session, revision: session.revision + 1, phase: 'ready', proposed_facts: [], confirmed: true };
      result = { session, profile };
    } else if (path.endsWith('/next')) {
      session = { ...session, revision: session.revision + 1, phase: 'question', question: { id: 'q1', topic: 'project', text: 'Jaki projekt ukończyłaś samodzielnie?', reason: 'Pokażemy Twój wkład w osiągnięcie.', context: 'Projekt' } };
      result = session;
    } else if (path.endsWith('/answers')) {
      session = { ...session, revision: session.revision + 1, phase: 'review', question: null, answers: [{ ...body }], proposed_facts: body.status === 'answered' ? [{ id: 'answer', text: body.answer, context: 'Projekt', kind: 'fact', path: '', source: 'interview' }] : [] };
      result = session;
    } else if (path.endsWith('/source')) {
      session = { ...session, revision: session.revision + 1, phase: 'intake', confirmed: false, preview: null, source_cv_data: body.cv_data || session.source_cv_data };
      result = session;
    } else if (path.endsWith('/preview')) {
      session = { ...session, revision: session.revision + 1, phase: 'preview', template_id: body.template_id, preview: { pages: 1, profile_revision: profile.revision, cv_data: { name: 'Anna Nowak', summary: 'Tworzę raporty.', experience: [], education: [], skills: [] }, changes: [{ path: '/summary', value: 'Tworzę raporty.', evidence_refs: ['answer'] }], remaining_gaps: [] } };
      result = session;
    } else if (path.endsWith('/document')) result = { document_id: 41 };
    else result = session;
    await route.fulfill({ json: result });
  });
  return { calls, base };
}

for (const width of [390, 834, 1280, 1920]) {
  test(`interview creates, resumes and reviews CV at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await installInterviewApi(page);
    await page.goto('/app/interview');
    await page.getByLabel('Imię i nazwisko', { exact: true }).fill('Anna Nowak');
    await page.getByRole('button', { name: 'Rozpocznij wywiad', exact: true }).click();
    await page.getByRole('button', { name: 'Zatwierdź informacje', exact: true }).click();
    await page.getByRole('button', { name: 'Następne pytanie', exact: true }).click();
    await page.getByLabel('Twoja odpowiedź').fill('Tworzę raporty.');
    await page.getByRole('button', { name: 'Zapisz odpowiedź', exact: true }).click();
    await page.goto(`/app/interview/${ID}`);
    await page.getByRole('button', { name: /Sprawdź informacje/ }).click();
    await page.getByRole('button', { name: 'Zatwierdź informacje', exact: true }).click();
    await page.getByLabel('Szablon nowego CV').selectOption('linden');
    await page.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' }).click();
    await expect(page.getByRole('heading', { name: 'Twoja nowa wersja CV' })).toBeVisible();
    await page.getByText('Cała treść CV', { exact: true }).click();
    await expect(page.getByRole('article', { name: 'Cała treść nowego CV' })).toContainText('Tworzę raporty.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-preview-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Zapisz jako nowe CV' }).click();
    await expect(page).toHaveURL(/\/app\/documents\/41$/);
    expect(api.calls.filter((call) => call.path.endsWith('/document'))).toHaveLength(1);
    api.base.assertHermetic();
  });
}

test('profile editing works with keyboard and reflows at 200 percent text zoom', async ({ page }) => {
  await installInterviewApi(page);
  await page.goto('/app/career-profile');
  await page.getByRole('button', { name: 'Dodaj informację', exact: true }).click();
  const summary = page.locator('summary').filter({ hasText: 'Uzupełnij' });
  await summary.focus(); await page.keyboard.press('Enter');
  await page.getByLabel('Treść', { exact: true }).fill('Wdrożyłam raportowanie.');
  await page.getByRole('button', { name: 'Zapisz profil', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Profil zapisany.');
  await page.setViewportSize({ width: 640, height: 450 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Wyczyść profil', exact: true }).click();
  await page.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wyczyść profil', exact: true })).toBeFocused();
});

for (const width of [390, 1280]) {
  test(`tailoring starts inside the assistant and preserves the source at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await installInterviewApi(page);
    await page.goto('/app/documents/41');
    await page.getByRole('button', { name: 'Otwórz asystenta AI', exact: true }).click();
    await page.getByRole('button', { name: 'Dopasuj do oferty', exact: true }).click();
    await page.getByLabel('Opis awaryjny', { exact: false }).fill('Szukamy programisty React. Firma Przykład.');
    await page.getByRole('button', { name: 'Dopasuj z wywiadem — nowe CV' }).click();
    const flow = page.getByRole('region', { name: 'Wywiad zawodowy' });
    await expect(flow).toBeVisible();
    await flow.getByRole('button', { name: 'Rozpocznij wywiad', exact: true }).click();
    await flow.getByRole('button', { name: 'Zatwierdź informacje', exact: true }).click();
    await expect(flow.getByLabel('Szablon nowego CV')).toHaveValue('sterling');
    await expect(flow.getByLabel('Szablon nowego CV')).toBeDisabled();
    await flow.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu' }).click();
    await flow.getByRole('button', { name: 'Zatwierdź informacje', exact: true }).click();
    await flow.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' }).click();
    await expect(flow.getByRole('heading', { name: 'Twoja nowa wersja CV' })).toBeVisible();
    await page.screenshot({ path: `../tmp/interview-assistant-${width}.png`, fullPage: true });
    expect(await flow.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const start = api.calls.find((call) => call.path.endsWith('/interviews') && call.method === 'POST');
    expect(start.body.mode).toBe('tailor');
    expect(start.body.source_document_id).toBe(41);
    expect(start.body.job_description).toContain('React');
    await flow.getByRole('button', { name: 'Wróć do asystenta' }).click();
    await expect(page.getByRole('button', { name: 'Dopasuj z wywiadem — nowe CV' })).toBeFocused();
    api.base.assertHermetic();
  });
}
