import { test, expect } from '@playwright/test';
import { installMockApi, PRO_ENTITLEMENTS } from './support/mockApi.js';

const ID = 'f1fc439c-84f1-45ad-b23c-a3e384a81d3a';
const nameFact = { id: 'name', text: 'Anna Nowak', path: '/name', kind: 'fact', source: 'manual', context: '' };

/** Both responsive stage controls express the same allowed transition. */
async function openPreparation(page) {
  const button = page.getByRole('button', { name: '03 Przygotuj CV', exact: true });
  if (await button.isVisible()) await button.click();
  else await page.getByRole('combobox', { name: 'Etapy', exact: true }).selectOption('prepare');
}

/** Source maintenance is available in information review at either host width. */
async function openInformation(page) {
  const button = page.getByRole('button', { name: '01 Twoje informacje', exact: true });
  if (await button.isVisible()) await button.click();
  else await page.getByRole('combobox', { name: 'Etapy', exact: true }).selectOption('facts');
}

async function installInterviewApi(page, recovered = false) {
  const entitlements = structuredClone(PRO_ENTITLEMENTS);
  const base = await installMockApi(page, { entitlements });
  await page.addInitScript(() => { localStorage.setItem('token', 'local-playwright-token'); localStorage.setItem('username', 'Kamil'); });
  let profile = { revision: 0, facts: [] };
  let session = null;
  let clarified = false;
  const creditRequests = [];
  const calls = [];
  await page.route('**/api/career-profile*', async (route) => {
    if (route.request().method() === 'PUT') profile = { ...route.request().postDataJSON(), revision: profile.revision + 1 };
    if (route.request().method() === 'DELETE') profile = { revision: profile.revision + 1, facts: [] };
    await route.fulfill({ json: { ...profile, sources: { documents: [{ id: 30, title: 'Anna CV' }], imports: [] } } });
  });
  await page.route('**/api/ai/interviews**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body = method === 'POST' ? route.request().postDataJSON() : null;
    calls.push({ path, method, body });
    let result;
    if (path.endsWith('/credits')) result = { credits_charged: creditRequests.reduce((sum, item) => sum + item.credits_charged, 0), requests: creditRequests };
    else if (path.endsWith('/interviews') && method === 'GET') result = { items: session ? [{ ...session, updated_at: '2026-09-10T10:00:00' }] : [], next_offset: null };
    else if (path.endsWith('/interviews') && method === 'POST') {
      session = { evidence_scope: body.include_profile ? 'profile' : 'session', evidence_profile: { revision: 0, facts: [] }, id: ID, revision: 1, mode: body.mode, source_document_id: body.source_document_id || null, phase: 'intake', language: body.language, profile_revision: 0, template_id: body.template_id || null, question_limit: body.mode === 'tailor' ? 5 : 8, planned_question_count: body.mode === 'tailor' ? null : 8, answers: [], question: null, requirements: [], proposed_facts: [nameFact], confirmed: false, preview: null, source_cv_data: { name: 'Anna Nowak' } };
      result = session;
    } else if (path.endsWith('/confirm')) {
      if (session.evidence_scope === 'profile') profile = { revision: profile.revision + 1, facts: body.facts };
      else session.evidence_profile = { revision: session.evidence_profile.revision + 1, facts: body.facts };
      session = { ...session, revision: session.revision + 1, phase: 'ready', proposed_facts: [], confirmed: true };
      result = { session, profile: session.evidence_scope === 'profile' ? profile : session.evidence_profile };
    } else if (path.endsWith('/next')) {
      creditRequests.unshift({ id: `question-${session.revision}`, operation: 'next', created_at: '2026-09-12T10:00:00Z', credits_charged: 7, pending: false, stages: [{ operation: 'next', credits_charged: 7, status: 'settled' }] });
      session = { ...session, revision: session.revision + 1, phase: 'question', question: { id: 'q1', topic: 'project', text: 'Jaki projekt ukończyłaś samodzielnie?', reason: 'Pokażemy Twój wkład w osiągnięcie.', context: 'Projekt' } };
      result = session;
    } else if (path.endsWith('/clarify')) {
      session = { ...session, revision: session.revision + 1, phase: 'clarification', clarification_round: true, pending_clarifications: [], question: { id: 'clarify-project', topic: 'clarify-project', clarification: true, text: 'W którym projekcie używałaś Pythona?', reason: 'Potwierdźmy związek technologii z projektem.', context: 'Projekty', suggested_text: 'Portal CV w Pythonie' } };
      result = session;
    } else if (path.endsWith('/skip-clarifications')) {
      session = { ...session, revision: session.revision + 1, phase: 'preview', pending_clarifications: [], question: null };
      result = session;
    } else if (path.endsWith('/answers')) {
      if (session.question?.clarification) clarified = true;
      const fact = body.status === 'answered' ? { id: 'answer', text: body.answer, context: 'Projekt', kind: 'fact', path: '', source: 'interview' }
        : body.status === 'no_experience' ? { id: 'answer', text: 'Brak doświadczenia', context: 'Projekt', kind: 'gap', path: '', source: 'interview' } : null;
      if (fact && session.evidence_scope === 'profile') profile = { revision: profile.revision + 1, facts: [...profile.facts.filter((item) => item.id !== fact.id), fact] };
      if (fact && session.evidence_scope === 'session') session.evidence_profile = { revision: session.evidence_profile.revision + 1, facts: [...session.evidence_profile.facts.filter((item) => item.id !== fact.id), fact] };
      const evidence = session.evidence_scope === 'profile' ? profile : session.evidence_profile;
      session = { ...session, revision: session.revision + 1, profile_revision: evidence.revision, phase: 'ready', question: null, preview: null, answers: [...session.answers, { ...body }], proposed_facts: [] };
      result = session;
    } else if (path.endsWith('/source')) {
      session = { ...session, revision: session.revision + 1, phase: 'intake', confirmed: false, preview: null, source_cv_data: body.cv_data || session.source_cv_data };
      result = session;
    } else if (path.endsWith('/preview')) {
      creditRequests.unshift({ id: `preview-${session.revision}`, operation: 'preview', created_at: '2026-09-12T10:01:00Z', credits_charged: 18, pending: false, stages: ['preview', 'editorial', 'verify'].map((operation) => ({ operation, credits_charged: 6, status: 'settled' })) });
      session = { ...session, revision: session.revision + 1, phase: 'preview', template_id: body.template_id, preview: { pages: 1, profile_revision: session.evidence_scope === 'profile' ? profile.revision : session.evidence_profile.revision, cv_data: { name: 'Anna Nowak', summary: 'Tworzę raporty.', experience: [], education: [], skills: [] }, changes: [{ path: '/summary', value: 'Tworzę raporty.', evidence_refs: ['answer'] }], remaining_gaps: [], ...(recovered ? { recovered_previous_attempt: !clarified, review_notes: [{ path: '/experience/0/bullets/6', action: 'kept_original' }, { path: '/custom_sections/0/items/0/bullets/0', action: 'omitted_suggestion' }] } : {}) } };
      if (recovered && !clarified) session = { ...session, phase: 'clarification', pending_clarifications: [{ topic: 'clarify-project' }] };
      result = session;
    } else if (path.endsWith('/document')) result = { document_id: 41 };
    else result = session;
    const charged = creditRequests.reduce((sum, item) => sum + item.credits_charged, 0);
    entitlements.remaining.ai_credits = 200 - charged;
    entitlements.usage.ai_credits_used = charged;
    await route.fulfill({ json: result });
  });
  return { calls, base };
}

for (const width of [390, 834, 1280, 1920]) {
  for (const language of ['en', 'pl']) {
    test(`English embedded interview sends ${language} document language at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const api = await installInterviewApi(page);
      await page.addInitScript(() => localStorage.setItem('cvstudio.uiLanguage', 'en'));
      await page.goto('/app/documents/41');
      await page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
      await page.getByRole('button', { name: 'CV Assistant', exact: true }).click();
      const flow = page.getByRole('region', { name: 'CV Assistant' });
      const languageField = flow.getByRole('combobox', { name: 'New CV language', exact: true });
      await expect(languageField).toBeHidden();
      await flow.locator('summary').filter({ hasText: /^CV language:/ }).click();
      await expect(languageField).toHaveValue('en');
      await languageField.focus();
      if (language === 'pl') {
        await page.keyboard.press('Home');
      }
      await expect(languageField).toHaveValue(language);
      if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await flow.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(flow.getByRole('button', { name: 'Start conversation', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect.poll(() => api.calls.find(call => call.path.endsWith('/interviews') && call.method === 'POST')?.body.language).toBe(language);
      api.base.assertHermetic();
    });
  }

  test(`English interview credit line reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installInterviewApi(page);
    await page.addInitScript(() => localStorage.setItem('cvstudio.uiLanguage', 'en'));
    await page.goto('/app/interview');
    await page.getByRole('combobox', { name: 'Your CV', exact: true }).selectOption('document:30');
    await page.getByRole('button', { name: 'Start conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Next question', exact: true }).click();
    // The receipt is a single static line: no history disclosure to operate.
    const credits = page.getByRole('region', { name: 'Credits' });
    await expect(credits).toContainText('Used 7');
    await expect(credits.locator('details')).toHaveCount(0);
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-credits-en-${width}.png`, fullPage: true });
  });

  test(`interview creates, resumes and reviews CV at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await installInterviewApi(page, true);
    await page.goto('/app/interview');
    await page.getByLabel('Twoje CV').selectOption('document:30');
    await page.screenshot({ path: `../tmp/assistant-intake-${width}.png`, fullPage: true });
    await page.getByLabel('To moje CV — dołącz mój profil zawodowy').check();
    await page.getByRole('button', { name: 'Rozpocznij rozmowę', exact: true }).click();
    await page.getByRole('button', { name: /Przejdź do (rozmowy|przygotowania CV)/ }).click();
    await page.getByRole('button', { name: 'Następne pytanie', exact: true }).click();
    await expect(page.getByText(/Pytanie 1 z maksymalnie 8 · Zapisane odpowiedzi: 0/)).toBeVisible();
    const credits = page.getByRole('region', { name: 'Kredyty' });
    await expect(credits).toContainText('Zużyte 7');
    await page.getByLabel('Twoja odpowiedź').fill('Tworzę raporty.');
    await page.getByRole('button', { name: 'Zapisz odpowiedź', exact: true }).click();
    await expect(page.getByText('Odpowiedź zapisana w profilu zawodowym.', { exact: true })).toBeVisible();
    await expect(page.getByText(/do zapisania/)).toHaveCount(0);
    expect(api.calls.filter((call) => call.path.endsWith('/confirm'))).toHaveLength(1);
    await page.goto(`/app/interview/${ID}`);
    await expect(page.getByRole('region', { name: 'Kredyty' })).toContainText('Zużyte 7');
    await openInformation(page);
    await page.getByRole('button', { name: /Przejdź do (rozmowy|przygotowania CV)/ }).click();
    await openPreparation(page);
    await page.getByLabel('Szablon nowego CV').selectOption('linden');
    await page.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' }).click();
    await expect(page.getByRole('heading', { name: 'Doprecyzujmy szczegóły' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zapisz jako nowe CV' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Doprecyzuj — do 5 pytań' }).click();
    await expect(page.getByRole('heading', { name: 'Czy proponowany opis jest w pełni zgodny z Twoim doświadczeniem?' })).toBeVisible();
    await expect(page.getByText('W którym projekcie używałaś Pythona?', { exact: true })).toBeVisible();
    await expect(page.getByText('Portal CV w Pythonie', { exact: true })).toBeVisible();
    await expect(page.getByText(/Doprecyzowanie 1 z 1/)).toBeVisible();
    await expect(page.getByLabel('Pełny poprawiony opis', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Tak — zatwierdź ten opis', exact: true }).focus();
    await page.keyboard.press('Tab');
    const correctDescription = page.getByRole('button', { name: 'Popraw opis', exact: true });
    await expect(correctDescription).toBeFocused();
    await expect(correctDescription).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(correctDescription).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Pełny poprawiony opis', { exact: true })).toBeFocused();
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-clarification-${width}.png`, fullPage: true });
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 100% !important; }' });
    if (width === 834 || width === 1920) {
      const alternatives = page.locator('summary').filter({ hasText: 'Jeśli żadna z tych odpowiedzi nie pasuje' });
      await alternatives.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Zakończ doprecyzowanie bez zapisywania propozycji' }).click();
    } else {
      if (width === 390) {
        await page.getByRole('button', { name: 'Tak — zatwierdź ten opis', exact: true }).focus();
        await page.keyboard.press('Enter');
      } else {
        await page.getByLabel('Pełny poprawiony opis').fill('Python był używany w projekcie uczelnianym.');
        await expect(page.getByRole('button', { name: 'Tak — zatwierdź ten opis', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Zapisz pełny poprawiony opis', exact: true }).click();
      }
      await expect(page.getByRole('button', { name: 'Przejdź do przygotowania CV', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Przejdź do (rozmowy|przygotowania CV)/ }).click();
      await openPreparation(page);
      await page.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' }).click();
    }
    expect(api.calls.filter((call) => call.path.endsWith('/confirm'))).toHaveLength(1);
    await expect(page.getByRole('heading', { name: 'Twoja nowa wersja CV' })).toBeVisible();
    await page.getByRole('button', { name: 'Sprawdź uwagi do CV' }).click();
    await expect(page.getByRole('heading', { name: 'CV jest gotowe do sprawdzenia' })).toBeVisible();
    const recoveryDetails = page.getByText('Co zachowaliśmy lub pominęliśmy (2)', { exact: true });
    await recoveryDetails.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('zachowano potwierdzoną treść', { exact: false })).toBeVisible();
    if (width === 834 || width === 1920) await expect(page.getByText(/Odzyskanie nie zużyło/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('/experience/0/bullets/6');
    await page.getByRole('button', { name: 'Treść CV', exact: true }).click();
    await page.getByLabel('Wpis CV', { exact: true }).selectOption('/summary');
    await expect(page.getByRole('article', { name: 'Treść wybranego wpisu CV' })).toContainText('Tworzę raporty.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-preview-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Zapisz jako nowe CV' }).click();
    await expect(page).toHaveURL(/\/app\/documents\/41$/);
    expect(api.calls.filter((call) => call.path.endsWith('/document'))).toHaveLength(1);
    api.base.assertHermetic();
  });
}

for (const width of [390, 834, 1280, 1920]) {
  test(`tailoring starts inside the assistant and preserves the source at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await installInterviewApi(page);
    await page.goto('/app/documents/41');
    await page.getByRole('button', { name: 'Otwórz asystenta AI', exact: true }).click();
    await page.getByRole('button', { name: 'Dopasuj do oferty', exact: true }).click();
    await page.getByRole('radio', { name: 'Wklej treść', exact: true }).check();
    await page.getByLabel('Lub wklej treść oferty', { exact: true }).fill('Szukamy programisty React. Firma Przykład.');
    await page.screenshot({ path: `../tmp/job-match-intake-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Dopasuj CV do ogłoszenia', exact: true }).click();
    const flow = page.getByRole('region', { name: 'Asystent CV' });
    await expect(flow).toBeVisible();
    await flow.getByRole('button', { name: 'Rozpocznij rozmowę', exact: true }).click();
    await flow.getByRole('button', { name: 'Zakończ rozmowę i wybierz szablon', exact: true }).click();
    await expect(flow.getByRole('button', { name: 'Utwórz CV · Sterling', exact: true })).toBeVisible();
    await expect(flow.getByRole('button', { name: 'Wczytaj aktualne CV do rozmowy' })).toHaveCount(0);
    await flow.getByRole('button', { name: 'Treść CV', exact: true }).click();
    await flow.getByRole('button', { name: 'Wczytaj aktualne CV do rozmowy' }).click();
    await flow.getByRole('button', { name: 'Wróć', exact: true }).click();
    await flow.getByRole('button', { name: 'Wybierz szablon', exact: true }).click();
    await flow.getByRole('button', { name: 'Utwórz CV · Sterling', exact: true }).click();
    await expect(flow.getByRole('heading', { name: 'Twoja nowa wersja CV' })).toBeVisible();
    // The static receipt line repeats only settled usage for this interview.
    // The embedded host owns the account balance; the interview receipt only
    // repeats its own settled cost, avoiding two competing balance readouts.
    await expect(flow.getByRole('region', { name: 'Kredyty' })).toContainText('Zużyte 25');
    await expect(flow.getByRole('region', { name: 'Kredyty' })).not.toContainText('Dostępne');
    await expect(page.getByTitle('Wykorzystano 25 z 200 kredytów AI w tym miesiącu')).toContainText('175');
    await page.screenshot({ path: `../tmp/interview-assistant-${width}.png`, fullPage: true });
    expect(await flow.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const start = api.calls.find((call) => call.path.endsWith('/interviews') && call.method === 'POST');
    expect(start.body.mode).toBe('tailor');
    expect(start.body.source_document_id).toBe(41);
    expect(start.body.job_description).toContain('React');
    await flow.getByRole('button', { name: 'Wróć do asystenta' }).click();
    await expect(page.getByRole('button', { name: 'Dopasuj CV do ogłoszenia', exact: true })).toBeFocused();
    api.base.assertHermetic();
  });
}
