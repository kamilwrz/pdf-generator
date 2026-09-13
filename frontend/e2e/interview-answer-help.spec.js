import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const ID = '291a5c2a-a449-4cd4-bbc9-f11f119e5796';
const QUESTION_ID = 'responsibilities-0';
const HELP_ID = 'answer-help-0';
const copy = {
  pl: {
    suggest: 'Zaproponuj odpowiedź', use: 'Użyj propozycji', tasks: 'Użyj wybranych czynności',
    confirm: 'Potwierdzam i zapisuję odpowiedź', answer: 'Twoja odpowiedź', credits: 'Kredyty wywiadu',
    other: 'Inne odpowiedzi', unknown: 'Nie pamiętam', skip: 'Pomiń',
    retry: 'Spróbuj ponownie', error: 'Nie udało się przygotować propozycji. Twoja odpowiedź została zachowana.',
    cancel: 'Ukryj propozycję', reopen: 'Pokaż propozycję',
  },
  en: {
    suggest: 'Suggest an answer', use: 'Use suggestion', tasks: 'Use selected tasks',
    confirm: 'Confirm and save answer', answer: 'Your answer', credits: 'Interview credits',
    other: 'Other answers', unknown: 'I cannot remember', skip: 'Skip',
    retry: 'Try again', error: 'We could not prepare a suggestion. Your answer has been kept.',
  },
};
const suggestedDraft = 'Sprawdzałam zgłoszenia klientów i dokumentowałam decyzje w systemie.';
const selectedTask = 'Porównywanie danych zgłoszenia z dokumentacją klienta.';
const uncheckedTask = 'Przygotowywanie zestawień zgłoszeń dla zespołu.';

/**
 * Keep the source CV, evidence and question immutable while help is generated.
 * Only an explicit answer POST may extend history/evidence. All values are
 * synthetic, and the shared API harness prevents any production request.
 */
async function openInterview(page, {
  language = 'pl', width = 1280, mode = 'draft', eligible = true,
  failFirst = false, holdHelp = false, cached = false,
} = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await installMockApi(page);
  await page.addInitScript((lng) => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('cvstudio.uiLanguage', lng);
  }, language);
  const source = {
    name: 'Anna Example', title: 'Specjalistka obsługi klienta', summary: 'Obsługa zgłoszeń klientów.',
    experience: [{ title: 'Specjalistka obsługi klienta', company: 'Example Services',
      city: 'Warszawa', period: '2022 – 2025', bullets: ['Obsługa zgłoszeń klientów.'] }],
    education: [{ degree: 'Administracja', school: 'Example University', period: '2021' }],
    skills: ['Dokumentowanie zgłoszeń'], languages: [{ name: 'Angielski', level: 'B2' }],
  };
  const facts = [{ id: 'source-role-0', text: 'Obsługa zgłoszeń klientów.', kind: 'fact',
    path: '/experience/0/bullets/0', source: 'document:41' }];
  const question = { id: QUESTION_ID, topic: 'responsibilities', entry_id: '/experience/0', angle: 'overview',
    text: 'Jakie czynności wykonywałaś przy obsłudze zgłoszeń?',
    reason: 'Doprecyzujemy zakres obowiązków w Example Services.', context: 'Example Services',
    ...(eligible ? { answer_help_available: true } : {}),
  };
  const help = { id: HELP_ID, question_id: QUESTION_ID, mode,
    based_on_draft: '',
    draft: mode === 'draft' ? suggestedDraft : '',
    options: mode === 'options' ? [{ id: 'task-1', text: selectedTask }, { id: 'task-2', text: uncheckedTask }] : [],
    ...(mode === 'guidance' ? { guidance: 'Opisz jedną czynność, którą rzeczywiście pamiętasz z tej pracy.' } : {}),
  };
  let session = { id: ID, evidence_scope: 'session', revision: 1, profile_revision: 1,
    evidence_profile: { revision: 1, facts: structuredClone(facts) }, mode: 'enrich', language: 'pl',
    source_document_id: 41, source_revision: 3, source_cv_data: structuredClone(source), template_id: 'regent',
    phase: 'question', question, answers: [], proposed_facts: [], requirements: [], confirmed: true,
    question_limit: 10, planned_question_count: 8, ...(cached ? { answer_help: help } : {}),
  };
  const posts = [];
  const profileRequests = [];
  let attempts = 0;
  let charges = cached ? mode === 'guidance' ? 3 : 5 : 0;
  let releaseHelp;
  const helpReady = holdHelp ? new Promise(resolve => { releaseHelp = resolve; }) : Promise.resolve();
  await page.route('**/api/career-profile**', async route => {
    profileRequests.push(route.request().method());
    await route.fulfill({ json: { revision: 99, facts: [
      { id: 'foreign-account-marker', text: 'FOREIGN ACCOUNT EVIDENCE', kind: 'fact' },
    ] } });
  });
  await page.route('**/api/ai/interviews**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/credits')) {
      await route.fulfill({ json: { credits_charged: charges, requests: charges ? [{
        id: 'receipt-help', operation: 'answer-help', credits_charged: charges,
        created_at: '2026-09-13T12:00:00Z', pending: false,
        stages: [{ operation: 'answer-help', status: 'settled', credits_charged: 3 },
          ...(mode === 'guidance' ? [] : [{ operation: 'answer-help-verify', status: 'settled', credits_charged: 2 }])],
      }] : [] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      posts.push({ path, body });
      if (path.endsWith('/answer-help')) {
        attempts += 1;
        await helpReady;
        if (failFirst && attempts === 1) {
          await route.fulfill({ status: 503, json: { detail: 'Suggestion temporarily unavailable. Please retry.' } });
          return;
        }
        charges = mode === 'guidance' ? 3 : 5;
        session = { ...session, revision: session.revision + 1,
          answer_help: { ...structuredClone(help), based_on_draft: body.draft } };
      } else if (path.endsWith('/answers')) {
        const answered = body.status === 'answered';
        session = { ...session, revision: session.revision + 1, profile_revision: answered ? 2 : session.profile_revision,
          phase: 'review', question: null,
          discovery_round_complete: true,
          answers: [...session.answers, { question, answer: body.answer, status: body.status }],
          evidence_profile: answered ? { revision: 2, facts: [...facts,
            { id: 'answer-0', text: body.answer, kind: 'fact', source: 'interview:saved', question: question.text },
          ] } : session.evidence_profile,
        };
      } else throw new Error(`Unexpected interview write: ${path}`);
    }
    await route.fulfill({ json: session });
  });
  await page.goto(`/app/interview/${ID}`);
  if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const answer = page.getByRole('textbox', { name: copy[language].answer, exact: true });
  await expect(answer).toBeVisible();
  return {
    api, posts, profileRequests, answer, source, facts, question,
    current: () => structuredClone(session), releaseHelp: () => releaseHelp?.(),
    saves: () => posts.filter(call => call.path.endsWith('/answers')),
    helps: () => posts.filter(call => call.path.endsWith('/answer-help')),
  };
}

function expectSourceIsolation(flow) {
  expect(flow.current().source_cv_data).toEqual(flow.source);
  expect(flow.profileRequests).toEqual([]);
  expect(flow.api.productionRequests).toEqual([]);
  expect(flow.api.calls.filter(call => /\/pdf\//.test(call.path) && call.method !== 'GET')).toEqual([]);
  for (const { body } of flow.posts) {
    expect(body.evidence_scope).toBe('session');
    expect(body).not.toHaveProperty('cv_data');
    expect(JSON.stringify(body)).not.toContain('FOREIGN ACCOUNT EVIDENCE');
  }
}

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`answer help stays a draft until explicit confirmation ${language} ${width}`, async ({ page }) => {
    const labels = copy[language];
    const flow = await openInterview(page, { language, width, holdHelp: true });
    const suggest = page.getByRole('button', { name: labels.suggest, exact: true });
    const credits = page.getByRole('region', { name: labels.credits, exact: true });
    await expect(suggest).toBeEnabled();
    expect(flow.posts).toEqual([]);
    await suggest.focus();
    await expect(suggest).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => flow.helps().length).toBe(1);
    // Opening help replaces its trigger with the pending review. Neither a
    // second generation nor an answer save is available while it settles.
    await expect(suggest).toHaveCount(0);
    await expect(flow.answer).toBeVisible();
    await expect(flow.answer).toBeDisabled();
    await expect(credits).toBeVisible();
    expect(flow.helps()[0].body).toMatchObject({ revision: 1, profile_revision: 1,
      evidence_scope: 'session', question_id: QUESTION_ID, draft: '' });
    flow.releaseHelp();
    const use = page.getByRole('button', { name: labels.use, exact: true });
    await expect(use).toBeVisible();
    await expect(flow.answer).toHaveValue('');
    expect(flow.current().question).toEqual(flow.question);
    expect(flow.current().evidence_profile.facts).toEqual(flow.facts);
    expect(flow.saves()).toEqual([]);
    await expect(credits).toContainText(language === 'pl' ? '5 kredytów' : '5 credits');
    await use.focus();
    await page.keyboard.press('Enter');
    await expect(flow.answer).toHaveValue(suggestedDraft);
    expect(flow.saves()).toEqual([]);
    const confirm = page.getByRole('button', { name: labels.confirm, exact: true });
    await expect(confirm).toBeEnabled();
    expect((await confirm.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-answer-help-${language}-${width}.png`, fullPage: true });
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => flow.saves().length).toBe(1);
    expect(flow.saves()[0].body).toMatchObject({ question_id: QUESTION_ID, answer: suggestedDraft,
      status: 'answered', suggestion_id: HELP_ID, confirm_suggestion: true });
    await expect(flow.answer).toHaveCount(0);
    expectSourceIsolation(flow);
  });
}

for (const language of ['pl', 'en']) {
  test(`task suggestions are unchecked and append only selected text ${language}`, async ({ page }) => {
    const labels = copy[language];
    const flow = await openInterview(page, { language, mode: 'options', width: 390 });
    const original = 'Pracowałam w zespole obsługi zgłoszeń.';
    await flow.answer.fill(original);
    await page.getByRole('button', { name: labels.suggest, exact: true }).click();
    const first = page.getByRole('checkbox', { name: selectedTask, exact: true });
    const second = page.getByRole('checkbox', { name: uncheckedTask, exact: true });
    await expect(first).not.toBeChecked();
    await expect(second).not.toBeChecked();
    const use = page.getByRole('button', { name: labels.tasks, exact: true });
    await expect(use).toBeDisabled();
    await expect(flow.answer).toHaveValue(original);
    await first.focus();
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();
    await use.click();
    await expect(flow.answer).toHaveValue(new RegExp(`${original}[\\s\\S]*${selectedTask}`));
    expect(await flow.answer.inputValue()).not.toContain(uncheckedTask);
    expect(flow.saves()).toEqual([]);
    expect(flow.current().evidence_profile.facts).toEqual(flow.facts);
    await page.getByRole('button', { name: labels.confirm, exact: true }).click();
    await expect.poll(() => flow.saves().length).toBe(1);
    expect(flow.saves()[0].body).toMatchObject({ suggestion_id: HELP_ID, confirm_suggestion: true });
    expect(flow.saves()[0].body.answer).toContain(original);
    expect(flow.saves()[0].body.answer).toContain(selectedTask);
    expect(flow.saves()[0].body.answer).not.toContain(uncheckedTask);
    expectSourceIsolation(flow);
  });
}

test('failed suggestion can be retried without clearing the answer or saving it', async ({ page }) => {
  const flow = await openInterview(page, { failFirst: true });
  const original = 'Dokumentowałam zgłoszenia klientów.';
  await flow.answer.fill(original);
  const suggest = page.getByRole('button', { name: copy.pl.suggest, exact: true });
  await suggest.click();
  await expect(page.getByRole('alert')).toContainText(copy.pl.error);
  await expect(flow.answer).toHaveValue(original);
  const retry = page.getByRole('button', { name: copy.pl.retry, exact: true });
  await expect(retry).toBeEnabled();
  expect(flow.helps()).toHaveLength(1);
  expect(flow.saves()).toEqual([]);
  await retry.click();
  await expect(page.getByRole('button', { name: copy.pl.use, exact: true })).toBeVisible();
  await expect(flow.answer).toHaveValue(original);
  expect(flow.helps()).toHaveLength(2);
  expect(flow.helps().map(call => call.body.draft)).toEqual([original, original]);
  expect(flow.saves()).toEqual([]);
  expectSourceIsolation(flow);
});

test('reopening saved help neither generates it again nor applies it', async ({ page }) => {
  const flow = await openInterview(page, { cached: true });
  await expect(page.getByRole('button', { name: copy.pl.use, exact: true })).toBeVisible();
  await expect(flow.answer).toHaveValue('');
  expect(flow.posts).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: copy.pl.use, exact: true })).toBeVisible();
  await expect(flow.answer).toHaveValue('');
  expect(flow.posts).toEqual([]);
  expectSourceIsolation(flow);
});

test('hiding pending help keeps the request locked and caches its late response without reopening', async ({ page }) => {
  const flow = await openInterview(page, { holdHelp: true });
  await page.getByRole('button', { name: copy.pl.suggest, exact: true }).click();
  await expect.poll(() => flow.helps().length).toBe(1);
  const hide = page.getByRole('button', { name: copy.pl.cancel, exact: true });
  await hide.focus();
  await page.keyboard.press('Enter');
  await expect(hide).toHaveCount(0);
  await expect(flow.answer).toBeDisabled();
  await expect(page.getByRole('button', { name: copy.pl.suggest, exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: copy.pl.credits, exact: true })).toBeVisible();
  expect(flow.saves()).toEqual([]);
  flow.releaseHelp();
  const reopen = page.getByRole('button', { name: copy.pl.reopen, exact: true });
  await expect(reopen).toBeEnabled();
  await expect(flow.answer).toBeEnabled();
  await expect(flow.answer).toHaveValue('');
  await expect(page.getByRole('button', { name: copy.pl.use, exact: true })).toHaveCount(0);
  expect(flow.helps()).toHaveLength(1);
  expect(flow.saves()).toEqual([]);
  await expect(page.getByRole('region', { name: copy.pl.credits, exact: true })).toContainText('5 kredytów');
  await reopen.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: copy.pl.use, exact: true })).toBeVisible();
  expect(flow.helps()).toHaveLength(1);
  expect(flow.saves()).toEqual([]);
  expectSourceIsolation(flow);
});

test('questions without explicit eligibility do not expose answer generation', async ({ page }) => {
  const flow = await openInterview(page, { eligible: false });
  await expect(page.getByRole('button', { name: copy.pl.suggest, exact: true })).toHaveCount(0);
  expect(flow.posts).toEqual([]);
  expectSourceIsolation(flow);
});

test('guidance stays readable without becoming applicable answer text', async ({ page }) => {
  const flow = await openInterview(page, { mode: 'guidance' });
  const original = 'Pamiętam, że pracowałam ze zgłoszeniami.';
  await flow.answer.fill(original);
  await page.getByRole('button', { name: copy.pl.suggest, exact: true }).click();
  await expect(page.getByText('Opisz jedną czynność, którą rzeczywiście pamiętasz z tej pracy.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.pl.use, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: copy.pl.tasks, exact: true })).toHaveCount(0);
  await expect(flow.answer).toHaveValue(original);
  expect(flow.saves()).toEqual([]);
  expect(flow.current().evidence_profile.facts).toEqual(flow.facts);
  expectSourceIsolation(flow);
});

test('oversized suggestion preserves the full draft and displays a recoverable error', async ({ page }) => {
  const flow = await openInterview(page);
  const original = 'A'.repeat(3990);
  await flow.answer.fill(original);
  await page.getByRole('button', { name: copy.pl.suggest, exact: true }).click();
  const use = page.getByRole('button', { name: copy.pl.use, exact: true });
  await use.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(flow.answer).toHaveValue(original);
  expect(flow.saves()).toEqual([]);
  expect(flow.current().evidence_profile.facts).toEqual(flow.facts);
  expectSourceIsolation(flow);
});

for (const [button, status] of [['unknown', 'unknown'], ['skip', 'skipped']]) {
  test(`${status} answers never generate or adopt a suggestion`, async ({ page }) => {
    const flow = await openInterview(page);
    await page.getByText(copy.pl.other, { exact: true }).click();
    await page.getByRole('button', { name: copy.pl[button], exact: true }).click();
    await expect.poll(() => flow.saves().length).toBe(1);
    expect(flow.saves()[0].body).toMatchObject({ status, question_id: QUESTION_ID });
    expect(flow.saves()[0].body.confirm_suggestion).not.toBe(true);
    expect(flow.helps()).toEqual([]);
    expect(flow.current().evidence_profile.facts).toEqual(flow.facts);
    expectSourceIsolation(flow);
  });
}
