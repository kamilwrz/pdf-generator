import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Keep the account holder visibly different from the selected candidate.
for (const width of [390, 834, 1280, 1920]) {
  test(`selected candidate stays separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const base = await installMockApi(page, { documents: [{ id: 30, title: 'CV30.pdf' }], imports: [] });
    await page.addInitScript(() => localStorage.setItem('token', 'local-playwright-token'));
    const owner = { revision: 7, facts: [{ id: 'owner', path: '/name', text: 'Kamil Owner', kind: 'fact' }] };
    const candidate = { id: 'candidate', path: '/name', text: 'Anna Candidate', kind: 'fact', context: '', source: 'document:30' };
    let profileReads = 0;
    let session;
    const writes = [];
    await page.route('**/api/career-profile', async (route) => {
      expect(route.request().method()).toBe('GET'); profileReads++;
      await route.fulfill({ json: { ...owner, sources: { documents: [{ id: 30, title: 'CV30.pdf' }], imports: [{ id: 40, filename: 'Anna-import.pdf' }] } } });
    });
    await page.route('**/api/ai/imports*', (route) => route.fulfill({ json: { items: [{ id: 40, status: 'succeeded', source_filename: 'Anna-import.pdf' }] } }));
    await page.route('**/api/ai/interviews**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/credits')) return route.fulfill({ json: { credits_charged: 0, requests: [] } });
      if (route.request().method() === 'GET') return route.fulfill({ json: session });
      const body = route.request().postDataJSON(); writes.push({ path, body });
      if (path.endsWith('/interviews')) {
        expect(body.include_profile).toBe(false);
        expect(body.cv_data).toEqual({});
        session = { id: 'separate', revision: 1, evidence_scope: 'session', evidence_profile: { revision: 0, facts: [] },
          mode: 'create', phase: 'intake', answers: [], requirements: [], proposed_facts: [candidate],
          language: 'pl', template_id: 'linden', question: null, question_limit: 8, planned_question_count: 8, preview: null };
      } else if (path.endsWith('/next')) {
        session = { ...session, revision: 3, phase: 'question', confirmed: true, question: { id: 'q1', text: 'Jakie zadania wykonywałaś?', topic: 'experience' } };
      } else {
        expect(path).toMatch(/\/confirm$/);
        expect(body.facts).toEqual([candidate]); expect(body.evidence_scope).toBe('session');
        session = { ...session, phase: 'ready', revision: 2, evidence_profile: { revision: 1, facts: body.facts }, proposed_facts: [] };
      }
      await route.fulfill({ json: session });
    });
    await page.goto('/app/interview');
    await page.getByRole('button', { name: width === 834 ? 'Anna-import.pdf' : 'CV30.pdf', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Twoja odpowiedź' })).toBeVisible();
    await page.getByRole('button', { name: 'Treść CV', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Otwórz wpis: Anna Candidate' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Kamil Owner');
    expect(writes).toHaveLength(3);
    const beforeResume = profileReads;
    await page.goto('/app/interview/separate');
    await expect(page.getByRole('textbox', { name: 'Twoja odpowiedź' })).toBeVisible();
    expect(profileReads).toBe(beforeResume);
    base.assertHermetic();
  });
}
