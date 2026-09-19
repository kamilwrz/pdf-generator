import { test, expect } from '@playwright/test';
import { installMockApi, PRO_ENTITLEMENTS } from './support/mockApi.js';

const ID = 'ea800ad5-54e4-43d9-a537-c8b537d76cf4';
const SESSION = 'a7000ad5-54e4-43d9-a537-c8b537d76cf4';
const cv = { name: 'Anna Example', title: 'Analyst', summary: 'I prepare reports.', experience: [], education: [], skills: [] };

/** Synthetic APIs exercise navigation and orchestration without provider calls. */
async function setup(page, { pro = true, language = 'en', completed = false } = {}) {
  const entitlements = structuredClone(PRO_ENTITLEMENTS);
  entitlements.ai_assistant = pro;
  entitlements.plan_slug = pro ? 'pro' : 'free';
  await installMockApi(page, { entitlements });
  await page.addInitScript(({ language }) => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('username', 'Kamil');
    localStorage.setItem('cvstudio.uiLanguage', language);
  }, { language });
  let flow = { id: ID, revision: 1, source_kind: null, source_id: null, offer_kind: 'text', job_description: '', job_offer_url: '', language,
    step: 'source', source_cv_data: null, session_id: null, document_id: completed ? 41 : null };
  let session;
  let writes = 0;
  let failSave = false;
  let failDownload = false;
  const calls = [];
  await page.route('**/api/tailoring**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const body = ['POST', 'PUT'].includes(method) ? route.request().postDataJSON() : null;
    calls.push({ path: url.pathname, method, body });
    if (url.pathname.endsWith('/sources')) return route.fulfill({ json: { documents: [{ id: 41, title: 'Anna CV' }], imports: [{ id: 7, filename: 'import.pdf' }] } });
    if (url.pathname.endsWith('/tailoring')) return route.fulfill({ json: { items: [{ id: ID, updated_at: '2026-09-16T12:00:00Z' }] } });
    if (method === 'PUT') {
      writes++;
      if (failSave) return route.fulfill({ status: 503, json: { detail: 'Save unavailable' } });
      flow = { ...flow, ...body, revision: flow.revision + 1, source_cv_data: body.source_id ? cv : null };
    }
    if (url.pathname.endsWith('/start')) {
      flow = { ...flow, session_id: SESSION, locked: true };
      session = { id: SESSION, revision: 1, mode: 'tailor', evidence_scope: 'session', evidence_profile: { revision: 1, facts: [] },
        phase: 'ready', language, template_id: 'linden', profile_revision: 1, answers: [], proposed_facts: [],
        question: null, requirements: [], confirmed: true, preview: null, source_cv_data: cv, planned_question_count: 1, question_limit: 1 };
    }
    return route.fulfill({ json: flow });
  });
  await page.route('**/api/ai/extract_cv', route => route.fulfill({ json: { import: { id: 7 }, cv_data: cv } }));
  await page.route('**/api/ai/interviews/**', async route => {
    const url = new URL(route.request().url());
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    calls.push({ path: url.pathname, method: route.request().method(), body });
    if (url.pathname.endsWith('/credits')) return route.fulfill({ json: { credits_charged: 0, requests: [] } });
    if (url.pathname.endsWith('/next')) session = { ...session, revision: 2, phase: 'question', question: { id: 'q1', text: 'Which reports do you prepare?', reason: 'Describe your experience.', context: 'Reports' } };
    if (url.pathname.endsWith('/answers')) session = { ...session, revision: 3, phase: 'review', discovery_complete: true, discovery_round_complete: true, answers: [{ question: session.question, answer: body.answer, status: 'answered' }], question: null };
    if (url.pathname.endsWith('/preview')) session = { ...session, revision: 4, phase: 'preview', preview: { cv_data: cv, pages: 1, changes: [], remaining_gaps: [], profile_revision: 1 } };
    if (url.pathname.endsWith('/document')) { flow.document_id = 41; return route.fulfill({ json: { document_id: 41 } }); }
    return route.fulfill({ json: session });
  });
  await page.route('**/api/billing/select-plan', async route => {
    calls.push({ path: '/billing/select-plan', body: route.request().postDataJSON() });
    return route.fulfill({ json: { checkout_url: `/billing/cancel?returnTo=${encodeURIComponent(`/app/tailor/${ID}`)}` } });
  });
  await page.route('**/api/pdf/download_pdf', route => failDownload
    ? route.fulfill({ status: 503, json: { detail: 'Download unavailable' } })
    : route.fulfill({ contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="tailored.pdf"' }, body: '%PDF-1.4\nsynthetic test download' }));
  return { calls, get flow() { return flow; }, get writes() { return writes; }, failSave: value => { failSave = value; }, failDownload: value => { failDownload = value; } };
}

for (const width of [390, 834, 1280, 1920]) {
  test(`guided intake and complete PDF flow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await setup(page);
    await page.goto(`/app/tailor/${ID}`);
    const row = page.getByRole('button', { name: 'Anna CV', exact: true });
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    // Selecting a CV never renders its content in the tailoring flow.
    await expect(page.getByText('Anna Example', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `test-results/tailoring-source-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Continue to the advert', exact: true }).click();
    // The finished CV step is marked completed on the persistent rail.
    await expect(page.getByRole('list', { name: 'CV tailoring steps' }).locator('li[data-complete]')).toHaveCount(1);
    await page.getByLabel('Job description (required)').fill('Reporting analyst: SQL and dashboards.');
    await expect(page.getByText('Progress saved', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/tailoring-offer-${width}.png`, fullPage: true });
    await page.reload();
    await expect(page.getByLabel('Job description (required)')).toHaveValue('Reporting analyst: SQL and dashboards.');
    await page.getByRole('button', { name: 'Continue to questions', exact: true }).click();
    const progress = page.getByRole('list', { name: 'CV tailoring steps' });
    await expect(progress).toBeVisible();
    await expect(progress.locator('li[aria-current="step"]')).toContainText('03');
    await expect(progress.locator('li[data-complete]')).toHaveCount(2);
    // The guided conversation requests its first question immediately, the
    // same way an ordinary CV Assistant conversation never waits for a
    // separate manual "next question" click on the very first question.
    await expect(page.getByText('Which reports do you prepare?')).toBeVisible();
    expect(api.calls.filter(call => call.path.endsWith('/next'))).toHaveLength(1);
    await page.screenshot({ path: `test-results/tailoring-conversation-${width}.png`, fullPage: true });
    await page.locator('textarea').fill('Weekly SQL reports for the operations team.');
    await page.getByRole('button', { name: 'Send answer', exact: true }).click();
    await page.getByRole('button', { name: /Create CV · Linden/i }).click();
    await page.getByRole('button', { name: 'Save and continue to download', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your CV is saved and ready to download' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('tailored.pdf');
    expect(page.url()).toContain(`/app/tailor/${ID}`);
    expect(api.calls.filter(call => call.path.endsWith('/document'))).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/tailoring-${width}.png`, fullPage: true });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeVisible();
  });
}

test('opening tailoring without a saved flow id skips straight to the first step', async ({ page }) => {
  const api = await setup(page);
  await page.goto('/app/tailor');
  await expect(page).toHaveURL(new RegExp(`/app/tailor/${ID}$`));
  await expect(page.getByRole('heading', { name: 'CV', exact: true })).toBeVisible();
  // The removed intro screen ("Start with your CV", its price paragraph and the
  // saved-history list) and the removed source-step hints must never appear.
  await expect(page.getByRole('heading', { name: 'Start with your CV' })).toHaveCount(0);
  await expect(page.getByText('Check the extracted content before continuing', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Free includes one successful import per month', { exact: false })).toHaveCount(0);
  expect(api.calls.some(call => call.method === 'PUT' && call.body.revision === 0)).toBe(true);
});

test('Free intake retains advert after checkout cancellation and never calls interview', async ({ page }) => {
  const api = await setup(page, { pro: false });
  await page.goto(`/app/tailor/${ID}`);
  await page.getByLabel('CV as PDF (up to 10 MB)').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic') });
  await page.getByRole('button', { name: 'Upload and read CV' }).click();
  await page.getByRole('button', { name: 'Continue to the advert', exact: true }).click();
  await page.getByLabel('Job description (required)').fill('A reporting role requiring SQL.');
  await page.getByRole('button', { name: 'Choose Pro: PLN 59 / 30 days' }).click();
  await page.getByRole('link', { name: 'Return to CV tailoring', exact: true }).click();
  await expect(page.getByLabel('Job description (required)')).toHaveValue('A reporting role requiring SQL.');
  expect(api.calls.some(call => call.path.includes('/interviews'))).toBe(false);
  expect(api.calls.find(call => call.path === '/billing/select-plan').body.tailoring_flow_id).toBe(ID);
});

test('autosave failure preserves text, blocks navigation and supports retry', async ({ page }) => {
  const api = await setup(page);
  await page.goto(`/app/tailor/${ID}`);
  await page.getByRole('button', { name: 'Anna CV', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to the advert', exact: true }).click();
  api.failSave(true);
  await page.getByLabel('Job description (required)').fill('Unsaved important advert');
  await expect(page.getByRole('alert').first()).toContainText('Save unavailable');
  await page.getByRole('link', { name: 'My documents', exact: true }).first().click();
  await page.getByRole('button', { name: 'Stay and finish saving' }).click();
  await expect(page.getByLabel('Job description (required)')).toHaveValue('Unsaved important advert');
  api.failSave(false);
  await page.getByRole('button', { name: 'Retry saving changes' }).click();
  await expect(page.getByText('Progress saved', { exact: true })).toBeVisible();
});

test('Polish keyboard intake, enlarged text and download retry', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 900 });
  const api = await setup(page, { language: 'pl', completed: true });
  await page.goto(`/app/tailor/${ID}`);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  api.failDownload(true);
  const button = page.getByRole('button', { name: 'Pobierz PDF', exact: true });
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Download unavailable');
  api.failDownload(false);
  const download = page.waitForEvent('download');
  await button.focus(); await page.keyboard.press('Enter');
  await download;
  expect(api.calls.some(call => call.path.endsWith('/preview'))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const status of ['succeeded', 'pending']) {
  test(`checkout ${status} keeps the saved task and does not start AI`, async ({ page }) => {
    const api = await setup(page, { pro: false });
    await page.route('**/api/billing/checkout-session/**', route => route.fulfill({ json: { status } }));
    await page.goto(`/billing/success?session_id=cs_test&returnTo=${encodeURIComponent(`/app/tailor/${ID}`)}`);
    if (status === 'succeeded') await expect(page.getByRole('heading', { name: 'Pro is active' })).toBeVisible();
    await page.getByRole('link', { name: 'Return to CV tailoring', exact: true }).click();
    await expect(page.getByLabel('CV as PDF (up to 10 MB)')).toBeVisible();
    expect(api.calls.some(call => call.path.includes('/interviews') || call.path.endsWith('/start'))).toBe(false);
  });
}
