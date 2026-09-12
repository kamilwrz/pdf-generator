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
          language: 'pl', template_id: 'linden', question: null, question_limit: 8, planned_question_count: 8, preview: null };
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

for (const lang of ['pl', 'en']) {
  for (const width of [390, 834, 1280, 1920]) {
    test(`bound career profile starts an interview (${lang}, ${width}px)`, async ({ page }) => {
      const base = await installMockApi(page);
      await page.addInitScript(() => localStorage.setItem('token', 'local-playwright-token'));
      await page.addInitScript((language) => localStorage.setItem('cvstudio.uiLanguage', language), lang);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const kind = width === 834 || width === 1920 ? 'import' : 'document';
      const profile = { revision: 3, source_binding: { kind, id: 30 }, source_available: true,
        facts: [{ id: 'src-name', text: 'Anna Profile', path: '/name', kind: 'fact', source: `${kind}:30` },
          { id: 'note', text: 'Saved profile note', path: '', kind: 'fact', source: 'manual' }],
        sources: { documents: [{ id: 31, title: 'Other CV' }], imports: [] } };
      const calls = [];
      await page.route('**/api/career-profile', (route) => route.fulfill({ json: profile }));
      await page.route('**/api/ai/interviews**', (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON(); calls.push(body);
          expect(body).toMatchObject({ use_profile_source: true, include_profile: true, cv_data: {} });
          expect(body.source_document_id).toBeUndefined(); expect(body.source_import_id).toBeUndefined();
        }
        return route.fulfill({ json: { id: 'bound-profile', revision: 1, evidence_scope: 'profile', phase: 'intake',
          source_document_id: kind === 'document' ? 30 : null, source_import_id: kind === 'import' ? 30 : null,
          source_cv_data: { name: 'Anna Profile' }, answers: [], proposed_facts: [], requirements: [], language: 'pl', confirmed: false } });
      });
      await page.goto('/app/interview');
      const select = page.getByRole('combobox', { name: lang === 'pl' ? 'Źródło informacji' : 'Information source', exact: true });
      await select.selectOption('profile');
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(select.locator('option:checked')).toHaveText(lang === 'pl' ? 'Profil zawodowy' : 'Career profile');
      if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const start = page.getByRole('button', { name: lang === 'pl' ? 'Rozpocznij wywiad' : 'Start interview', exact: true });
      await start.focus();
      await page.screenshot({ path: `../tmp/interview-profile-source-${lang}-${width}.png`, fullPage: true });
      expect(calls).toEqual([]);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: /^(Otwórz wpis:|Open entry:) Anna Profile/ })).toBeVisible();
      await page.getByRole('searchbox').fill('Saved profile note');
      await expect(page.getByRole('button', { name: /^(Otwórz wpis:|Open entry:)/ })).toHaveCount(1);
      expect(calls).toHaveLength(1);
      base.assertHermetic();
    });
  }
}
