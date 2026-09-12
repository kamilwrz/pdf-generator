import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const storedFixture = JSON.parse(readFileSync(new URL('./fixtures/interview-templates.json', import.meta.url), 'utf8'));
const fixture = { ...storedFixture.response, cv_data: storedFixture.cv_data,
  candidates: storedFixture.response.candidates.filter(candidate => candidate.template_id !== 'regent') };
const ID = 'b71056d4-534b-4c15-a8c7-ce5b65be56ae';
const spacing = { stack: 4, record: 10, section: 21, after_rule: 8 };

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`offers measured alternate templates and saves an explicit choice ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMockApi(page);
    await page.addInitScript(lng => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('cvstudio.uiLanguage', lng);
    }, language);
    const english = language === 'en';
    const profile = { revision: 1, facts: [{ id: 'name', path: '/name', text: 'Test Candidate', kind: 'fact' }] };
    const preview = { cv_data: fixture.cv_data, elements: [], pages: 2, profile_revision: 1,
      changes: [], remaining_gaps: [], fit: { status: 'complete', original_pages: 2, can_restore: false } };
    let session = { id: ID, revision: 4, profile_revision: 1, evidence_scope: 'session', evidence_profile: profile,
      mode: 'enrich', language: 'pl', phase: 'preview', template_id: 'regent', question: null, answers: [],
      confirmed: true, proposed_facts: [], requirements: [], question_limit: 10, planned_question_count: 10,
      source_cv_data: fixture.cv_data, spacing_px: spacing, preview };
    const posts = [];
    let failSelection = true;
    await page.route('**/api/ai/interviews**', async route => {
      const url = route.request().url();
      if (url.endsWith('/credits')) { await route.fulfill({ json: { requests: [], credits_charged: 0 } }); return; }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON(); posts.push({ url, body });
        if (url.endsWith('/preview-templates')) { await route.fulfill({ json: fixture }); return; }
        if (url.endsWith('/preview-template')) {
          expect(body.revision).toBe(4);
          const original = fixture.candidates.find(candidate => candidate.template_id === body.template_id);
          expect(original).toBeTruthy();
          expect(Math.max(...body.elements.map(element => element.page || 1))).toBe(1);
          for (const element of original.elements.filter(element => !element.fixedToPage && element.content)) {
            expect(body.elements.find(item => item.element_id === element.element_id)?.content).toBe(element.content);
          }
          if (failSelection) { failSelection = false; await route.fulfill({ status: 503, json: { detail: 'Retry template selection.' } }); return; }
          if (language === 'pl') writeFileSync(`../tmp/interview-template-selected-${body.template_id}.json`, JSON.stringify(body));
          session = { ...session, revision: 5, template_id: body.template_id, spacing_px: body.spacing_px,
            fit_original: { preview, template_id: 'regent', spacing_px: spacing },
            preview: { ...preview, pages: 1, elements: body.elements, fit: { ...preview.fit, can_restore: true } } };
        } else if (url.endsWith('/preview-fit') && body.action === 'restore') {
          session = { ...session, revision: 6, template_id: 'regent', spacing_px: spacing, preview };
        } else throw new Error(`Unexpected write ${url}`);
      }
      await route.fulfill({ json: session });
    });
    await page.goto(`/app/interview/${ID}`);
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const check = page.getByRole('button', { name: english ? 'Check other templates' : 'Sprawdź inne szablony', exact: true });
    await expect(check).toBeVisible();
    expect(posts).toHaveLength(0);
    await check.focus(); await page.keyboard.press('Enter');
    const choose = page.getByRole('button', { name: english ? /Use this template/ : /Użyj tego szablonu/ });
    await expect(choose).toBeVisible({ timeout: 30000 });
    const matching = page.getByRole('combobox', { name: english ? 'Matching template' : 'Pasujący szablon' });
    await expect(matching.locator('option')).toHaveCount(4);
    await matching.selectOption({ 390: 'linden', 834: 'cadenza', 1280: 'sterling', 1920: 'meridian' }[width]);
    expect((await choose.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../tmp/interview-templates-${language}-${width}.png`, fullPage: true });
    expect(posts.every(item => item.url.endsWith('/preview-templates'))).toBe(true);
    await choose.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Retry template selection.')).toBeVisible();
    await expect(choose).toBeEnabled();
    await choose.click();
    await expect(page.getByText(english ? 'Template changed. Your CV fits on one page; its content is unchanged.' : 'Zmieniono szablon. CV mieści się na jednej stronie; treść pozostała bez zmian.')).toBeVisible();
    await expect(page.getByRole('button', { name: english ? 'Save as a new CV' : 'Zapisz jako nowe CV', exact: true })).toBeEnabled();
    await expect(check).toHaveCount(0);
    await page.getByRole('button', { name: english ? 'Restore version before fitting' : 'Przywróć wersję sprzed dopasowania' }).click();
    await expect(check).toBeVisible();
    expect(session.template_id).toBe('regent');
  });
}

test('automatically compares after generation and never changes the selected template itself', async ({ page }) => {
  // The UI integration is exercised with real browser measurement, while the
  // provider generation is an existing verified two-page server snapshot.
  await installMockApi(page);
  await page.addInitScript(() => localStorage.setItem('token', 'local-playwright-token'));
  const profile = { revision: 1, facts: [] };
  let current = { id: ID, revision: 3, profile_revision: 1, evidence_scope: 'session', evidence_profile: profile,
    mode: 'enrich', phase: 'review', language: 'pl', template_id: 'regent', question: null, answers: [],
    confirmed: true, proposed_facts: [], requirements: [], question_limit: 10, planned_question_count: 10,
    source_cv_data: fixture.cv_data, spacing_px: spacing };
  let scans = 0;
  await page.route('**/api/ai/interviews**', async route => {
    const url = route.request().url();
    if (url.endsWith('/credits')) { await route.fulfill({ json: { requests: [], credits_charged: 0 } }); return; }
    if (url.endsWith('/preview-templates')) { scans++; await route.fulfill({ json: fixture }); return; }
    if (url.endsWith('/preview') && route.request().method() === 'POST') current = { ...current, revision: 4, phase: 'preview',
      preview: { cv_data: fixture.cv_data, elements: [], pages: 2, changes: [], remaining_gaps: [], profile_revision: 1,
        fit: { status: 'complete', original_pages: 2 } } };
    await route.fulfill({ json: current });
  });
  await page.goto(`/app/interview/${ID}`);
  await page.getByRole('button', { name: 'Przejdź do przygotowania CV' }).click();
  await page.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' }).click();
  await expect(page.getByRole('button', { name: /Użyj tego szablonu/ })).toBeVisible({ timeout: 30000 });
  expect(scans).toBe(1);
  expect(current.template_id).toBe('regent');
});
