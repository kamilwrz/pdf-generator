import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Synthetic read-only sessions keep visual and keyboard checks free of paid AI.
for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`requirement context ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMockApi(page);
    await page.addInitScript(lang => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('cvstudio.uiLanguage', lang);
    }, language);
    const requirements = [
      { id: 'requirement:law', status: 'matched', text: 'Wykształcenie wyższe.' },
      { id: 'requirement:compliance', status: 'partial', text: 'Znajomość zasad compliance, w tym AML, sankcji, tajemnicy zawodowej oraz przeciwdziałania korupcji i łapownictwu.' },
      { id: 'requirement:research', status: 'unknown', text: 'Prowadzenie researchu z wykorzystaniem właściwych źródeł informacji.' },
      { id: 'requirement:management', status: 'gap', text: 'Zarządzanie zespołem.' },
    ];
    const session = { id: 'requirements', evidence_scope: 'profile', revision: 2, phase: 'question', mode: 'tailor', language, profile_revision: 2, template_id: 'linden', source_cv_data: { name: 'Anna Nowak' }, answers: [], question_limit: 8, planned_question_count: 8, requirements, proposed_facts: [], confirmed: true, question: { id: 'q1', entry_id: 'requirement:compliance', text: 'Jak stosujesz zasady poufności danych?', reason: 'Opisz praktyczny przykład.' }, preview: null };
    await page.route('**/api/career-profile*', route => route.fulfill({ json: { revision: 2, facts: [] } }));
    await page.route('**/api/ai/interviews**', route => route.fulfill({ json: route.request().url().endsWith('/credits') ? { credits_charged: 0, requests: [] } : session }));
    await page.goto('/app/interview/requirements');
    const context = page.getByRole('complementary', { name: language === 'pl' ? 'Teraz omawiamy' : 'Discussing now' });
    await expect(context).toContainText(requirements[1].text);
    const overview = page.getByRole('region', { name: language === 'pl' ? 'Wymagania oferty' : 'Job requirements', exact: true });
    const disclosure = overview.locator('details');
    await expect(disclosure).not.toHaveAttribute('open', '');
    await overview.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(overview.locator('[aria-current="true"]')).toContainText(requirements[1].text);
    await page.keyboard.press('Space');
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(context).toBeVisible();
    await expect(overview.locator('summary')).toBeFocused();
    if (width === 390) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/requirements-${language}-${width}.png`, fullPage: true });
  });
}
