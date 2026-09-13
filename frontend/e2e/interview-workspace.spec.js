import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const ID = 'f1fc439c-84f1-45ad-b23c-a3e384a81d3a';

/** Deliberately large fixtures and controlled responses exercise waiting without paid AI. */
async function workspaceApi(page, phase = 'preview') {
  await installMockApi(page);
  await page.addInitScript(() => localStorage.setItem('token', 'local-playwright-token'));
  const cv = {
    name: 'Anna Nowak', title: 'Analityczka danych', email: 'anna@example.test',
    summary: 'Łączę analizę danych z usprawnianiem procesów raportowania.',
    experience: Array.from({ length: 4 }, (_, i) => ({ title: `Analityczka ${i + 1}`, company: `Firma ${i + 1}`, city: 'Warszawa', period: '2022–2026', bullets: Array.from({ length: 12 }, (_, j) => `Osiągnięcie ${i + 1}.${j + 1}: przygotowanie raportów i kontrola jakości danych.`) })),
    skills: ['SQL', 'Python', 'Analiza danych'], languages: [{ name: 'Polski', level: 'C2' }, { name: 'Angielski', level: 'B2' }],
  };
  const changes = [];
  function visit(value, path = '') {
    if (typeof value === 'string') changes.push({ path, value, evidence_refs: ['fact'] });
    else Object.entries(value).forEach(([key, child]) => visit(child, `${path}/${key}`));
  }
  visit(cv);
  const profile = { revision: 2, facts: [{ id: 'fact', path: '', text: 'Przygotowywałam raporty i sprawdzałam jakość danych.', kind: 'fact', source: 'interview' }] };
  const preview = { pages: 3, profile_revision: 2, cv_data: cv, changes, remaining_gaps: Array.from({ length: 12 }, (_, i) => `Do doprecyzowania ${i + 1}: zakres odpowiedzialności za raportowanie.`) };
  let session = { evidence_scope: 'profile', id: ID, revision: 2, phase, mode: 'create', language: 'pl', profile_revision: 2, template_id: 'linden', source_cv_data: { name: 'Anna Nowak' }, answers: [], question_limit: 8, planned_question_count: 8, requirements: [], proposed_facts: [], confirmed: true, question: null, preview: phase === 'preview' ? preview : null };
  const holds = new Map();
  const calls = [];
  let failAnswer = false;
  await page.route('**/api/career-profile*', (route) => route.fulfill({ json: profile }));
  await page.route('**/api/ai/interviews**', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    // These read-only responses keep this layout test on the normal receipt
    // and template-check surfaces instead of accidental schema-error banners.
    if (action === 'credits') {
      await route.fulfill({ json: { credits_charged: 0, requests: [] } });
      return;
    }
    if (route.request().method() === 'POST') {
      calls.push(action);
      if (holds.has(action)) await holds.get(action);
      if (action === 'preview-templates') {
        await route.fulfill({ json: { revision: session.revision, profile_revision: session.profile_revision,
          evidence_scope: session.evidence_scope, target_pages: 1, candidates: [] } });
        return;
      }
      if (action === 'answers' && failAnswer) { await route.fulfill({ status: 503, json: { detail: 'Nie udało się zapisać odpowiedzi. Spróbuj ponownie.' } }); return; }
      if (action === 'next') session = { ...session, phase: 'question', question: { id: 'q1', text: 'Jak usprawniłaś raportowanie?', reason: 'Pokażemy Twój wkład w proces.' } };
      if (action === 'answers') session = { ...session, phase: 'review', question: null, answers: [route.request().postDataJSON()] };
      if (action === 'preview') session = { ...session, phase: 'preview', preview };
      session = { ...session, revision: session.revision + 1 };
    }
    await route.fulfill({ json: session });
  });
  return {
    calls,
    completeDiscovery() { session = { ...session, phase: 'review', question: null, discovery_complete: true, question_limit: 14, planned_question_count: 14 }; },
    hold(action) { let release; holds.set(action, new Promise((resolve) => { release = resolve; })); return () => { holds.delete(action); release(); }; },
    failAnswer() { failAnswer = true; },
  };
}

for (const width of [390, 834, 1280, 1920]) {
  test(`completed discovery keeps preparation reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await workspaceApi(page, 'review');
    api.completeDiscovery();
    await page.goto(`/app/interview/${ID}`);
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await expect(page.getByText(/Omówiliśmy dostępne wpisy/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Następne pytanie', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pogłęb wywiad/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const prepare = page.getByRole('button', { name: 'Przejdź do przygotowania CV', exact: true });
    await prepare.focus();
    await page.screenshot({ path: `../tmp/interview-complete-${width}.png`, fullPage: true });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Przygotuj swoją wersję CV' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji', exact: true })).toBeVisible();
    expect(api.calls).toEqual([]);
  });

  test(`bounded interview preview and generation loading at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: width === 834 ? 'reduce' : 'no-preference' });
    const api = await workspaceApi(page);
    const duplicateKeyErrors = [];
    page.on('console', message => {
      if (message.type() === 'error' && message.text().includes('children with the same key')) duplicateKeyErrors.push(message.text());
    });
    await page.goto(`/app/interview/${ID}`);
    const preview = page.getByRole('region', { name: 'Przegląd nowego CV' });
    await expect(preview).toBeVisible();
    await expect(page.getByLabel('Szablon nowego CV')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Następne pytanie', exact: true })).toHaveCount(0);
    await page.getByLabel('Wpis CV', { exact: true }).selectOption('/experience/0');
    await expect(preview).not.toContainText('Osiągnięcie 1.12');
    await expect(preview).toContainText('Osiągnięcie 1.6');
    await expect(preview).not.toContainText('Osiągnięcie 2.1');
    // Template choices and text review are distinct sibling components. A
    // shared React key previously duplicated the choices after a re-render.
    const templateOptions = page.getByRole('region', { name: 'Jedna strona w innym szablonie', exact: true });
    await expect(templateOptions).toHaveCount(1);
    expect(duplicateKeyErrors).toEqual([]);
    // Template comparison adds a bounded task above the original text review.
    // Measure its complete block separately so the original navigation, record,
    // and footer budget still catches expanded or duplicated preview content.
    const layout = await templateOptions.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        comparisonHeight: element.getBoundingClientRect().height
          + Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom),
        pageHeight: document.documentElement.scrollHeight,
      };
    });
    expect(layout.comparisonHeight).toBeLessThan(width < 500 ? 400 : 260);
    // The current public introduction and footer wrap at 390px. Keep a bounded
    // 2500px mobile page alongside the stricter six-item reading assertions;
    // the desktop budget and the separate comparison-panel cap stay fixed.
    expect(layout.pageHeight - layout.comparisonHeight).toBeLessThan(width < 500 ? 2500 : 1800);
    await page.screenshot({ path: `../tmp/interview-workspace-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Dalsze punkty', exact: true }).click();
    await expect(preview).toContainText('Osiągnięcie 1.12');
    await page.getByRole('button', { name: /^Zmiany/ }).click();
    await expect(preview.locator('article')).toHaveCount(5);
    await page.getByRole('button', { name: 'Następne', exact: true }).click();
    await expect(preview.getByRole('heading', { level: 4 })).toBeFocused();
    await expect(preview.locator('article')).toHaveCount(5);
    await preview.locator('summary').first().focus();
    await page.keyboard.press('Enter');
    await expect(preview.getByText('Przygotowywałam raporty i sprawdzałam jakość danych.').first()).toBeVisible();
    await page.getByRole('button', { name: /^Do sprawdzenia/ }).click();
    await expect(preview.locator('li')).toHaveCount(5);
    await page.getByRole('button', { name: 'Następne', exact: true }).click();
    await expect(preview).toContainText('Do doprecyzowania 6:');
    const stageButton = page.getByRole('button', { name: '03 Przygotuj CV', exact: true });
    if (await stageButton.isVisible()) await stageButton.click();
    else await page.getByRole('combobox', { name: 'Etapy', exact: true }).selectOption('prepare');
    await expect(page.getByText(/Każdy z trzech etapów korzysta z kredytów AI/)).toBeVisible();
    const release = api.hold('preview');
    await page.getByRole('button', { name: 'Odśwież podgląd', exact: true }).click();
    const loading = page.getByRole('region', { name: 'Przetwarzanie wywiadu' });
    await expect(loading.getByRole('heading')).toHaveText('Twoja historia nabiera kształtu');
    await expect(loading.getByRole('heading')).toBeFocused();
    await expect(loading).toContainText('osobną redakcję języka i stylu, niezależną weryfikację faktów');
    await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    await expect(page.getByRole('navigation', { name: 'Etapy wywiadu' })).toBeHidden();
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (width === 834) expect(await page.getByRole('progressbar').locator('span').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.screenshot({ path: `../tmp/interview-loading-${width}.png`, fullPage: true });
    release();
    await expect(page.getByRole('heading', { name: 'Twoja nowa wersja CV' })).toBeFocused();
    await expect(templateOptions).toHaveCount(1);
    expect(duplicateKeyErrors).toEqual([]);
    expect(api.calls.filter((action) => action === 'preview')).toHaveLength(1);
  });
}

test('question waiting, failed answer and draft recovery use distinct states', async ({ page }) => {
  const api = await workspaceApi(page, 'ready');
  await page.goto(`/app/interview/${ID}`);
  const releaseQuestion = api.hold('next');
  await page.getByRole('button', { name: 'Następne pytanie', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Szukamy właściwego pytania' })).toBeVisible();
  await page.screenshot({ path: '../tmp/interview-loading-question.png', fullPage: true });
  releaseQuestion();
  await expect(page.getByLabel('Twoja odpowiedź')).toHaveAccessibleDescription(/Możesz odpowiadać własnymi słowami/);
  await page.getByLabel('Twoja odpowiedź').fill('Zautomatyzowałam raport tygodniowy.');
  api.failAnswer();
  const releaseAnswer = api.hold('answers');
  await page.getByRole('button', { name: 'Zapisz odpowiedź', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Zachowujemy Twoją odpowiedź' })).toBeVisible();
  releaseAnswer();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  await expect(page.getByLabel('Twoja odpowiedź')).toHaveValue('Zautomatyzowałam raport tygodniowy.');
  await expect(page.getByRole('button', { name: 'Zapisz odpowiedź', exact: true })).toBeEnabled();
  expect(api.calls).toEqual(['next', 'answers']);
});
