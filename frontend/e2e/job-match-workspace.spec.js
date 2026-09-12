import { expect, test } from '@playwright/test';
import { installMockApi, login } from './support/mockApi.js';

const analysis = {
  message: 'Analiza gotowa.', analysis_key: 'owned-analysis', corrections: [{ element_id: 'saved-name', content: 'Wrong' }],
  job_requirements: [
    { id: 'a', text: 'SQL', match_status: 'matched' },
    { id: 'b', text: 'Raportowanie', match_status: 'partial' },
    { id: 'c', text: 'Python', match_status: 'missing' },
  ],
};

async function open(page) {
  await login(page);
  await page.getByText('Kontynuuj ostatnie CV', { exact: true }).click();
  await page.getByRole('button', { name: 'Otwórz asystenta AI' }).click();
  await page.getByRole('button', { name: 'Dopasuj do oferty', exact: true }).click();
}

test('job workspace fills assistant, analyses without edits and preserves drafts across navigation', async ({ page }, testInfo) => {
  const api = await installMockApi(page, { assistantResponses: [analysis] });
  await open(page);
  const assistant = page.getByRole('complementary', { name: 'Asystent AI' });
  const workspace = assistant.getByRole('region', { name: 'Dopasuj do oferty' });
  await expect(workspace.getByRole('heading', { name: 'Dopasuj do oferty', exact: true })).toBeFocused();
  await expect(assistant.getByRole('button', { name: 'Sprawdź CV', exact: true })).toHaveCount(0);
  await workspace.screenshot({ path: testInfo.outputPath('job-workspace-initial.png') });
  await page.getByLabel('Lub wklej treść oferty').fill('SQL, raportowanie oraz Python.');
  await page.getByRole('button', { name: 'Tylko analiza' }).click();
  await expect(workspace.getByRole('heading', { name: 'Jak Twoje CV pasuje do oferty', exact: true })).toBeFocused();
  await expect(workspace.getByText('Python', { exact: true })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /Zastosuj|Akceptuj/ })).toHaveCount(0);
  await expect(page.locator('#saved-name')).toHaveText('Kamil Smoke');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 834, 1280, 1920, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    const dimensions = await workspace.evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth,
      font: parseFloat(getComputedStyle(node.querySelector('textarea')).fontSize), height: node.getBoundingClientRect().height,
      parentHeight: node.parentElement.getBoundingClientRect().height, headerHeight: node.previousElementSibling.getBoundingClientRect().height }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
    expect(dimensions.font).toBeGreaterThanOrEqual(16);
    expect(dimensions.height).toBeGreaterThan(dimensions.parentHeight - dimensions.headerHeight - 5);
    await workspace.screenshot({ path: testInfo.outputPath(`job-workspace-${width}.png`) });
  }
  await workspace.getByRole('button', { name: 'Wróć do działań asystenta' }).click();
  await expect(assistant.getByRole('button', { name: 'Dopasuj do oferty', exact: true })).toBeFocused();
  await assistant.getByRole('button', { name: 'Dopasuj do oferty', exact: true }).click();
  await expect(page.getByLabel('Lub wklej treść oferty')).toHaveValue('SQL, raportowanie oraz Python.');
  await expect(workspace.getByText('Python', { exact: true })).toBeVisible();
  await page.getByLabel('Lub wklej treść oferty').fill('Inna oferta');
  await expect(workspace.getByRole('status')).toContainText('CV lub oferta się zmieniły');
  await expect(page.getByRole('combobox', { name: 'Język aplikacji' })).toHaveCount(0);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await page.locator('section[aria-labelledby="job-match-heading"]').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  api.assertHermetic();
});

test('analysis key enters interview with optional profile; no second analysis request', async ({ page }) => {
  const api = await installMockApi(page, { assistantResponses: [analysis] });
  await page.route('**/api/career-profile', (route) => route.fulfill({ json: { revision: 0, facts: [] } }));
  await page.route('**/api/ai/interviews/*/credits', (route) => route.fulfill({ json: { credits_charged: 0, requests: [] } }));
  let created;
  await page.route('**/api/ai/interviews', async (route) => {
    created = route.request().postDataJSON();
    await route.fulfill({ json: { id: 'tailor-one', mode: 'tailor', phase: 'intake', revision: 1,
      evidence_scope: 'session', evidence_profile: { revision: 0, facts: [] }, proposed_facts: [],
      answers: [], requirements: [], question: null, question_limit: 4, planned_question_count: 4, source_cv_data: created.cv_data,
      language: 'pl', template_id: 'linden', job_analysis_ready: true } });
  });
  await open(page);
  await page.getByLabel('Lub wklej treść oferty').fill('SQL oraz Python');
  await page.getByRole('button', { name: 'Tylko analiza' }).click();
  await expect(page.getByText('Python', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dopasuj z wywiadem', exact: true }).click();
  await expect(page.getByText('Wykorzystamy Twoją analizę oferty.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('To moje CV — dołącz mój profil zawodowy')).not.toBeChecked();
  await page.getByRole('button', { name: 'Rozpocznij wywiad', exact: true }).click();
  await expect(page.getByText(/Plan: do 4 pytań · Zapisane odpowiedzi: 0/)).toBeVisible();
  await expect.poll(() => created?.analysis_key).toBe('owned-analysis');
  expect(created.include_profile).toBe(false);
  expect(created.cv_data.name).toBe('Kamil Smoke');
  expect(api.calls.filter((call) => call.path === '/ai/assistant')).toHaveLength(1);
  api.assertHermetic();
});


test('job analysis validates the link, disables duplicate requests and recovers from errors', async ({ page }) => {
  const api = await installMockApi(page);
  let finish;
  let requests = 0;
  await page.route('**/api/ai/assistant', async (route) => {
    requests += 1;
    await new Promise((resolve) => { finish = resolve; });
    await route.fulfill({ status: 422, json: { detail: 'Nie udało się odczytać oferty. Wklej jej treść.' } });
  });
  await open(page);
  const workspace = page.locator('section[aria-labelledby="job-match-heading"]');
  const url = page.locator('#ai-job-offer-url');
  await expect(page.getByRole('button', { name: 'Tylko analiza' })).toBeDisabled();
  await url.fill('http://example.com/job');
  await page.getByRole('button', { name: 'Tylko analiza' }).click();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(workspace.getByRole('alert')).toBeVisible();
  expect(requests).toBe(0);
  await url.fill('');
  await page.getByLabel('Lub wklej treść oferty').fill('SQL and Python');
  await page.getByRole('button', { name: 'Tylko analiza' }).click();
  await expect.poll(() => requests).toBe(1);
  await expect(workspace.getByRole('button', { name: 'Tylko analiza' })).toBeDisabled();
  await expect(workspace.getByRole('button', { name: 'Dopasuj z wywiadem', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Lub wklej treść oferty')).toBeDisabled();
  finish();
  await expect(workspace.getByRole('alert')).toContainText('Nie udało się odczytać oferty');
  await expect(page.getByLabel('Lub wklej treść oferty')).toHaveValue('SQL and Python');
  await expect(workspace.getByRole('button', { name: 'Tylko analiza' })).toBeEnabled();
  api.assertHermetic();
});
