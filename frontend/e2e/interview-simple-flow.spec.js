import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';
import polish from '../src/i18n/locales/pl-workspace.json' with { type: 'json' };
import english from '../src/i18n/locales/en-workspace.json' with { type: 'json' };

const ID = '353521e7-0e3c-4b7d-8cce-b765cd653d84';
const QUESTION_ID = 'clarification-report';
const proposed = 'Samodzielne przygotowywanie cotygodniowych raportów sprzedaży w Excelu.';
const correction = 'Współpraca przy przygotowywaniu raportów sprzedaży w Excelu.';
const messages = { pl: polish.interview, en: english.interview };

/**
 * Keep the confirmation boundary local and observable. Opening, closing and
 * typing in disclosures never calls the API; only answer submission updates
 * this isolated interview's evidence, leaving the source CV unchanged.
 */
async function installClarification(page, language) {
  const api = await installMockApi(page);
  await page.addInitScript((lng) => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('cvstudio.uiLanguage', lng);
  }, language);
  const source = { name: 'Anna Example', summary: 'Przygotowywanie raportów w Excelu.' };
  const question = {
    id: QUESTION_ID, clarification: true, text: 'Czy raporty przygotowywałaś samodzielnie?',
    reason: 'Sprawdzamy zakres odpowiedzialności.', record_label: 'Raporty sprzedaży',
    suggested_text: proposed, fact_id: 'source-summary', path: '/summary',
  };
  const fact = { id: 'source-summary', text: source.summary, path: '/summary', kind: 'fact', source: 'document:41' };
  let session = {
    id: ID, evidence_scope: 'session', revision: 1, profile_revision: 1,
    evidence_profile: { revision: 1, facts: [fact] }, source_cv_data: structuredClone(source),
    source_document_id: 41, mode: 'enrich', language: 'pl', phase: 'clarification',
    template_id: 'linden', question, answers: [], pending_clarifications: [], requirements: [],
    proposed_facts: [], confirmed: true, question_limit: 10, planned_question_count: 10,
  };
  const writes = [];
  const profileReads = [];
  await page.route('**/api/career-profile**', async (route) => {
    profileReads.push(route.request().method());
    await route.fulfill({ json: { revision: 99, facts: [] } });
  });
  await page.route('**/api/ai/interviews**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/credits')) {
      await route.fulfill({ json: { credits_charged: 0, requests: [] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      expect(path).toBe(`/api/ai/interviews/${ID}/answers`);
      session = {
        ...session, revision: 2, profile_revision: 2, question: null, phase: 'review',
        discovery_complete: true, answers: [{ question, answer: body.answer, status: body.status }],
        evidence_profile: { revision: 2, facts: [{ ...fact, text: body.answer, source: 'interview:saved', question: question.text }] },
      };
    }
    await route.fulfill({ json: session });
  });
  return { api, writes, profileReads, source, current: () => structuredClone(session) };
}

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`clarification opens one task at a time and retains drafts ${language} ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const flow = await installClarification(page, language);
    const label = (key) => messages[language][`interviewFlow.${key}`];
    await page.goto(`/app/interview/${ID}`);
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

    const quote = page.getByRole('blockquote');
    const confirm = page.getByRole('button', { name: label('yesConfirmThisDescription'), exact: true });
    const correct = page.getByRole('button', { name: label('correctDescription'), exact: true });
    const input = page.getByLabel(label('fullCorrectedDescription'), { exact: true });
    const alternatives = page.locator('summary').filter({ hasText: label('ifNeitherAnswerFits') });
    const noExperience = page.getByRole('button', { name: label('iDidNotHaveThisExperience'), exact: true });
    await expect(quote).toHaveText(proposed);
    await expect(quote).toBeVisible();
    await expect(input).toBeHidden();
    await expect(noExperience).toBeHidden();
    await expect(correct).toHaveAttribute('aria-expanded', 'false');
    await expect(confirm).toBeEnabled();

    // Both responsive controls enforce the same unresolved-question guard.
    const stages = page.getByRole('navigation', { name: label('interviewStages'), exact: true });
    const prepareStage = stages.getByRole('button', { name: `03 ${label('prepareCv')}`, exact: true });
    if (await stages.isVisible()) await expect(prepareStage).toBeDisabled();
    else {
      const selector = page.locator('select').filter({ has: page.locator('option[value="prepare"]') });
      // Playwright's actionability matcher resolves an option through its
      // enabled select. Check the option's native disabled property directly.
      await expect(selector.locator('option[value="prepare"]')).toHaveJSProperty('disabled', true);
    }
    await expect(page.getByRole('button', { name: label('continueToCvPreparation'), exact: true })).toHaveCount(0);

    await correct.focus();
    await page.keyboard.press('Enter');
    await expect(correct).toHaveAttribute('aria-expanded', 'true');
    await expect(input).toBeFocused();
    await input.fill(correction);
    await expect(confirm).toBeDisabled();
    await correct.focus();
    await page.keyboard.press('Enter');
    await expect(input).toBeHidden();
    // A hidden label is absent from the accessibility tree; inspect the
    // retained DOM value, then use the labelled field again after reopening.
    await expect(page.locator(`#correction-${QUESTION_ID} textarea`)).toHaveValue(correction);
    await expect(confirm).toBeDisabled();
    await expect(quote).toBeVisible();
    await expect(page.getByText(label('correctionDraftRetained'), { exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(correction);
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden();
    await expect(correct).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(correction);

    await alternatives.focus();
    await page.keyboard.press('Enter');
    await expect(noExperience).toBeVisible();
    await expect(noExperience).toBeDisabled();
    await expect(page.getByRole('button', { name: label('iCannotRememberICannotConfirm'), exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: label('finishClarificationWithoutSavingTheSuggestion'), exact: true })).toBeDisabled();
    expect(flow.writes).toEqual([]);
    expect(flow.current().evidence_profile.facts[0].text).toBe(flow.source.summary);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const control of [correct, alternatives, confirm]) {
      const bounds = await control.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    }
    await page.screenshot({ path: `../tmp/interview-simple-flow-${language}-${width}.png`, fullPage: true });

    // Cover both explicit confirmation paths across the viewport matrix.
    const submitCorrection = width === 834 || width === 1920;
    if (submitCorrection) {
      const save = page.getByRole('button', { name: label('saveFullCorrectedDescription'), exact: true });
      await save.focus();
      await page.keyboard.press('Enter');
    } else {
      await input.fill('');
      await correct.click();
      await expect(confirm).toBeEnabled();
      await confirm.focus();
      await page.keyboard.press('Enter');
    }
    await expect.poll(() => flow.writes.length).toBe(1);
    expect(flow.writes[0].body).toMatchObject({
      question_id: QUESTION_ID, answer: submitCorrection ? correction : proposed,
      status: 'answered', evidence_scope: 'session',
    });
    await expect(page.getByRole('button', { name: label('continueToCvPreparation'), exact: true })).toBeVisible();
    expect(flow.current().source_cv_data).toEqual(flow.source);
    expect(flow.profileReads).toEqual([]);
    expect(flow.api.calls.filter((call) => call.method !== 'GET')).toEqual([]);
    flow.api.assertHermetic();
  });
}
