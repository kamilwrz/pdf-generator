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
      if (route.request().method() === 'GET') return route.fulfill({ json: session });
      const body = route.request().postDataJSON(); writes.push({ path, body });
      if (path.endsWith('/interviews')) {
        expect(body.include_profile).toBe(false);
        expect(body.cv_data).toEqual({});
        session = { id: 'separate', revision: 1, evidence_scope: 'session', evidence_profile: { revision: 0, facts: [] },
          mode: 'create', phase: 'intake', answers: [], requirements: [], proposed_facts: [candidate],
          language: 'pl', template_id: 'linden', question: null, question_limit: 8, preview: null };
      } else {
        expect(path).toMatch(/\/confirm$/);
        expect(body.facts).toEqual([candidate]); expect(body.evidence_scope).toBe('session');
        session = { ...session, phase: 'ready', revision: 2, evidence_profile: { revision: 1, facts: body.facts }, proposed_facts: [] };
      }
      await route.fulfill({ json: session });
    });
    await page.goto('/app/interview');
    const source = page.getByLabel('Źródło informacji');
    await source.selectOption(width === 834 ? 'import:40' : 'document:30');
    const optIn = page.getByLabel('To moje CV — dołącz mój profil zawodowy');
    await expect(optIn).not.toBeChecked();
    await optIn.focus(); await page.keyboard.press('Space'); await expect(optIn).toBeChecked();
    await page.keyboard.press('Space'); await expect(optIn).not.toBeChecked();
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-source-choice-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Rozpocznij wywiad', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Otwórz wpis: Anna Candidate' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Kamil Owner');
    await expect(page.getByRole('heading', { name: 'Informacje do tego CV', exact: true })).toBeVisible();
    await page.screenshot({ path: `../tmp/interview-source-review-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Przejdź do rozmowy' }).click();
    await expect(page.getByText('Informacje zapisane tylko w tym wywiadzie. Profil konta pozostaje bez zmian.', { exact: true })).toBeVisible();
    expect(writes).toHaveLength(2);
    const beforeResume = profileReads;
    await page.goto('/app/interview/separate');
    await expect(page.getByText(/Tylko to CV — profil konta wyłączony/)).toBeVisible();
    expect(profileReads).toBe(beforeResume);
    base.assertHermetic();
  });
}
