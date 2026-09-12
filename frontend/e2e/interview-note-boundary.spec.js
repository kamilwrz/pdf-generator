import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Exercise the actual standalone route in both evidence scopes. The shared
// assistant entry is additionally covered by the controller's runtime tests.
for (const lang of ['pl', 'en']) {
  for (const width of [390, 834, 1280, 1920]) {
    test(`interview edits only notes (${lang}, ${width}px)`, async ({ page }) => {
      const base = await installMockApi(page);
      await page.addInitScript(() => localStorage.setItem('token', 'local-playwright-token'));
      await page.addInitScript((language) => localStorage.setItem('cvstudio.uiLanguage', language), lang);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const isolated = width === 834 || width === 1920;
      const imported = width === 834;
      const source = imported ? 'import:40' : 'document:30';
      const cvFacts = [
        { id: 'src-name', path: '/name', text: 'Anna Nowak', kind: 'fact', source },
        { id: 'src-role', path: '/experience/0/title', text: 'Senior Analyst', kind: 'fact', source },
        { id: 'src-company', path: '/experience/0/company', text: 'Example Company', kind: 'fact', source },
      ];
      let profile = { revision: 1, facts: [
        ...cvFacts.map((fact) => fact.id === 'src-role' ? { ...fact, text: 'Obsolete role' } : fact),
        { id: 'src-deleted', path: '/skills/0', text: 'Obsolete skill', kind: 'fact', source },
        { id: 'intake-note', path: '', text: 'Original note', context: 'Notes', kind: 'fact', source },
      ] };
      let session = { id: 'note-review', revision: 1, evidence_scope: isolated ? 'session' : 'profile', phase: 'intake',
        source_document_id: imported ? null : 30, source_import_id: imported ? 40 : null,
        source_cv_data: { name: 'Anna Nowak' }, review_source_facts: cvFacts, language: 'pl', mode: 'create', template_id: 'linden',
        proposed_facts: [], answers: [], requirements: [], question: null, question_limit: 8, planned_question_count: 8, confirmed: false };
      const calls = [];
      const payload = () => ({ ...session, evidence_profile: isolated ? profile : null });
      await page.route('**/api/career-profile', (route) => route.fulfill({ json: profile }));
      await page.route('**/api/ai/interviews**', async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          calls.push({ url: route.request().url(), body });
          expect(route.request().url()).toMatch(/\/confirm$/);
          profile = { revision: profile.revision + 1, facts: body.facts };
          session = { ...session, revision: session.revision + 1, phase: 'ready', confirmed: true };
          return route.fulfill({ json: { session: payload(), profile } });
        }
        await route.fulfill({ json: payload() });
      });
      await page.goto('/app/interview/note-review');
      if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      const open = lang === 'pl' ? 'Otwórz wpis: ' : 'Open entry: ';
      await page.getByRole('button', { name: `${open}Senior Analyst` }).click();
      await expect(page.getByRole('heading', { name: 'Senior Analyst' })).toBeFocused();
      await expect(page.getByRole('button', { name: /^(Edytuj:|Edit:|Usuń informację:|Delete information:|\+ Dodaj informację|\+ Add information)/ })).toHaveCount(0);
      await expect(page.getByLabel(/^(Dodaj do tego wpisu|Add to this entry)$/)).toHaveCount(0);
      const editLink = page.getByRole('link', { name: imported ? /^(Otwórz historię importów|Open import history)/ : /^(Edytuj źródłowe CV|Edit the source CV)/ });
      await expect(editLink).toHaveAttribute('href', imported ? '/app/import' : '/app/documents/30');
      await expect(editLink).toHaveAttribute('target', '_blank');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `../tmp/interview-read-only-${lang}-${width}.png`, fullPage: true });
      const search = page.getByRole('searchbox');
      await search.fill('Original note');
      await page.getByRole('button', { name: `${open}Notes` }).click();
      await page.getByRole('button', { name: /^(Edytuj:|Edit:)/ }).focus();
      await page.keyboard.press('Enter');
      const input = page.getByLabel(lang === 'pl' ? 'Treść' : 'Content', { exact: true });
      await expect(input).toBeFocused();
      await page.getByText(lang === 'pl' ? 'Kontekst i sposób wykorzystania' : 'Context and use', { exact: true }).click();
      await expect(page.getByLabel(/^(Rodzaj informacji|Information type|Przeznaczenie|Purpose)$/)).toHaveCount(0);
      await input.fill('Updated note');
      if (!imported) await expect(page.getByRole('button', { name: /^(Wczytaj aktualne CV|Load current CV)/ })).toBeDisabled();
      await page.screenshot({ path: `../tmp/interview-note-${lang}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: lang === 'pl' ? 'Zastosuj zmianę' : 'Apply change', exact: true }).click();
      await page.getByRole('button', { name: lang === 'pl' ? '← Lista wpisów' : '← Entry list', exact: true }).click();
      await page.getByRole('button', { name: lang === 'pl' ? '+ Dodaj informację' : '+ Add information', exact: true }).click();
      await expect(page.getByLabel(/^(Rodzaj informacji|Information type|Przeznaczenie|Purpose)$/)).toHaveCount(0);
      await input.fill('New note');
      await page.getByRole('button', { name: lang === 'pl' ? 'Zastosuj zmianę' : 'Apply change', exact: true }).click();
      await page.getByRole('button', { name: lang === 'pl' ? 'Przejdź do rozmowy' : 'Continue to interview', exact: true }).click();
      await expect(page.getByRole('button', { name: /^01 / })).toBeEnabled();
      expect(calls).toHaveLength(1);
      expect(profile.facts.slice(0, 3)).toEqual(cvFacts);
      expect(profile.facts.find((fact) => fact.id === 'intake-note').text).toBe('Updated note');
      expect(profile.facts.at(-1)).toMatchObject({ text: 'New note', path: '', source: 'manual', kind: 'fact' });
      await page.reload();
      await page.getByRole('button', { name: /^01 / }).click();
      await search.fill('Updated note');
      await expect(page.getByRole('button', { name: `${open}Notes` })).toBeVisible();
      base.assertHermetic();
    });
  }
}
