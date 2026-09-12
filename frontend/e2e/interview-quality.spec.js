import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const ID = 'a71056d4-534b-4c15-a8c7-ce5b65be56ae';
for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`preview decisions preserve drafts and reflow ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMockApi(page);
    await page.addInitScript((lng) => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('cvstudio.uiLanguage', lng);
    }, language);
    const english = language === 'en';
    const profile = { revision: 1, facts: [{ id: 'answer-q', text: 'Zbieranie uwag bez przygotowywania stanowiska.', kind: 'fact', path: '', source: 'interview' }] };
    let session = { id: ID, evidence_scope: 'session', evidence_profile: profile, profile_revision: 1, revision: 1,
      mode: 'enrich', language: 'pl', phase: 'preview', template_id: 'linden', question: null, answers: [],
      confirmed: true, proposed_facts: [], requirements: [], question_limit: 10, planned_question_count: 10,
      source_cv_data: { name: 'Anna Nowak', summary: 'Praca administracyjna.' },
      preview: { pages: 1, profile_revision: 1, cv_data: { name: 'Anna Nowak', summary: 'Zbieranie uwag.' },
        changes: [{ path: '/summary', value: 'Zbieranie uwag.', evidence_refs: ['answer-q'] }], remaining_gaps: [] } };
    const posts = [];
    let fail = true;
    await page.route('**/api/ai/interviews**', async (route) => {
      if (route.request().url().endsWith('/credits')) { await route.fulfill({ json: { requests: [], credits_charged: 0 } }); return; }
      if (route.request().method() === 'POST') {
        posts.push(route.request().postDataJSON());
        expect(route.request().url()).toContain('/preview-review');
        if (fail) { fail = false; await route.fulfill({ status: 503, json: { detail: 'Retry preview review.' } }); return; }
        const { value } = posts.at(-1);
        session = { ...session, revision: session.revision + 1, preview: { ...session.preview,
          cv_data: { ...session.preview.cv_data, summary: value ?? 'Praca administracyjna.' },
          changes: value === null ? [] : [{ ...session.preview.changes[0], value }] } };
      }
      await route.fulfill({ json: session });
    });
    await page.goto(`/app/interview/${ID}`);
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await page.getByRole('button', { name: english ? /^Changes/ : /^Zmiany/ }).click();
    const edit = page.getByRole('button', { name: english ? 'Edit this suggestion' : 'Popraw tę propozycję' });
    await edit.focus(); await page.keyboard.press('Enter');
    const input = page.getByLabel(english ? 'Full corrected description' : 'Pełny poprawiony opis', { exact: true });
    await expect(input).toBeFocused();
    await input.fill('Zbieranie uwag bez przygotowywania stanowiska merytorycznego.');
    await expect(page.getByRole('button', { name: english ? 'Save as a new CV' : 'Zapisz jako nowe CV', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-quality-${language}-${width}.png`, fullPage: true });
    const submit = page.getByRole('button', { name: english ? 'Confirm corrected text' : 'Zatwierdź poprawiony tekst' });
    expect((await submit.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await submit.click();
    await expect(page.getByText('Retry preview review.')).toBeVisible();
    await expect(input).toHaveValue('Zbieranie uwag bez przygotowywania stanowiska merytorycznego.');
    await input.focus(); await page.keyboard.press('Escape');
    await expect(edit).toBeFocused();
    await edit.click();
    await input.fill('Zbieranie uwag bez przygotowywania stanowiska merytorycznego.');
    await submit.click();
    await expect(page.getByText(english ? 'The preview has been updated. No AI credits were charged.' : 'Podgląd został zaktualizowany. Nie naliczono kredytów AI.')).toBeVisible();
    await page.getByRole('button', { name: english ? /^Changes/ : /^Zmiany/ }).click();
    await page.getByRole('button', { name: english ? 'Reject this suggestion' : 'Odrzuć tę propozycję' }).click();
    await page.getByLabel(english ? 'CV entry' : 'Wpis CV', { exact: true }).selectOption('/summary');
    await expect(page.getByText('Praca administracyjna.', { exact: true })).toBeVisible();
    expect(posts).toHaveLength(3);
    expect(posts.at(-1).value).toBeNull();
  });
}
