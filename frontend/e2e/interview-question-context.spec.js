import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Both evidence scopes use synthetic reads; viewing context must not start AI.
for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`CV question context ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMockApi(page);
    await page.addInitScript(lang => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('cvstudio.uiLanguage', lang);
    }, language);
    const profile = { revision: 2, facts: [
      { id: 'first', path: '/experience/0/title', text: 'Junior Analyst', kind: 'fact' },
      { id: 'role', path: '/experience/1/title', text: 'Senior AML Analyst', kind: 'fact' },
      { id: 'company', path: '/experience/1/company', text: 'Example Consulting', kind: 'fact' },
      { id: 'period', path: '/experience/1/period', text: '2022–2026', kind: 'fact' },
    ] };
    const session = { id: 'context', evidence_scope: width === 390 ? 'isolated' : 'profile', evidence_profile: profile, revision: 2, phase: 'question', mode: 'enrich', language, profile_revision: 2, template_id: 'linden', source_cv_data: { name: 'Anna Nowak' }, answers: [], question_limit: 10, planned_question_count: 10, requirements: [], proposed_facts: [], confirmed: true, question: { id: 'q1', entry_id: '/experience/1', context: 'Senior AML Analyst', text: 'Jak przebiega analiza alertu AML w tej roli?', reason: 'Opisz praktyczny przykład.' }, preview: null };
    let writes = 0;
    await page.route('**/api/career-profile*', route => route.fulfill({ json: profile }));
    await page.route('**/api/ai/interviews**', route => {
      if (route.request().method() === 'POST') writes++;
      return route.fulfill({ json: route.request().url().endsWith('/credits') ? { credits_charged: 0, requests: [] } : session });
    });
    await page.goto('/app/interview/context');
    const context = page.getByRole('complementary', { name: language === 'pl' ? 'Teraz omawiamy' : 'Discussing now' });
    await expect(context).toContainText('Senior AML Analyst');
    await expect(context).toContainText('Example Consulting · 2022–2026');
    await expect(context).not.toContainText('Junior Analyst');
    await expect(context).not.toContainText('/experience/1');
    await expect(context.locator('details, button, a')).toHaveCount(0);
    const input = page.getByRole('textbox', { name: language === 'pl' ? 'Twoja odpowiedź' : 'Your answer', exact: true });
    await input.focus();
    await page.keyboard.type('Analysed transaction alerts.');
    await expect(input).toHaveValue('Analysed transaction alerts.');
    await expect(context).toBeVisible();
    if (width === 390) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toBe(0);
    await context.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/question-context-${language}-${width}.png`, fullPage: true });
  });
}
