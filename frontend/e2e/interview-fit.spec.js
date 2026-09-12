import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/interview-fit.json', import.meta.url), 'utf8'));
const ID = 'a71056d4-534b-4c15-a8c7-ce5b65be56ae';
const spacing = { stack: 4, record: 10, section: 21, after_rule: 8 };

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`fits before revealing the result and restores the baseline ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installMockApi(page);
    await page.addInitScript((lng) => {
      localStorage.setItem('token', 'local-playwright-token');
      localStorage.setItem('cvstudio.uiLanguage', lng);
    }, language);
    const english = language === 'en';
    const profile = { revision: 1, facts: fixture.changes.map(f => ({ id: f.evidence_refs[0], text: f.value, path: f.path, kind: 'fact' })) };
    const baseline = { ...structuredClone(fixture), profile_revision: 1, remaining_gaps: [] };
    let session = { id: ID, evidence_scope: 'session', evidence_profile: profile, profile_revision: 1, revision: 1,
      mode: 'enrich', language: 'pl', phase: 'preview', template_id: 'linden', question: null, answers: [],
      confirmed: true, proposed_facts: [], requirements: [], question_limit: 10, planned_question_count: 10,
      spacing_px: spacing, source_cv_data: fixture.cv_data, fit_original: { spacing_px: spacing },
      preview: { ...structuredClone(baseline), fit: { status: 'pending', allow_shorten: false, original_pages: 2, attempts: 0 } } };
    const posts = [];
    let fail = true;
    await page.route('**/api/ai/interviews**', async route => {
      if (route.request().url().endsWith('/credits')) { await route.fulfill({ json: { requests: [], credits_charged: 0 } }); return; }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        posts.push(body);
        if (route.request().url().endsWith('/preview-fit')) {
          if (body.action === 'finish') {
            if (fail) { fail = false; await route.fulfill({ status: 503, json: { detail: 'Retry layout persistence.' } }); return; }
            session = { ...session, revision: session.revision + 1, spacing_px: body.spacing_px,
              preview: { ...session.preview, elements: body.elements, pages: Math.max(...body.elements.map(e => e.page || 1)),
                fit: { ...session.preview.fit, status: 'complete', can_restore: true } } };
            // The browser must never rewrite or lose a flowing element while
            // fitting. The server tests independently enforce this boundary.
            for (const original of fixture.elements.filter(e => !e.fixedToPage)) {
              expect(body.elements.find(e => e.element_id === original.element_id)?.content).toEqual(original.content);
            }
            if (language === 'pl' && width === 1280) writeFileSync('../tmp/interview-fit-measured.json', JSON.stringify(body));
          } else if (body.action === 'restore') {
            session = { ...session, revision: session.revision + 1, spacing_px: spacing,
              preview: { ...structuredClone(baseline), fit: { status: 'restored', can_restore: false } } };
          } else throw new Error('Layout-only review must not spend AI credits');
        }
      }
      await route.fulfill({ json: session });
    });
    await page.goto(`/app/interview/${ID}`);
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const resume = page.getByRole('button', { name: english ? 'Resume CV fitting' : 'Wznów dopasowanie CV' });
    await expect(resume).toBeVisible();
    expect(posts).toHaveLength(0);
    await resume.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Retry layout persistence.')).toBeVisible();
    await expect(resume).toBeVisible();
    await resume.click();
    const save = page.getByRole('button', { name: english ? 'Save as a new CV' : 'Zapisz jako nowe CV', exact: true });
    await expect(save).toBeVisible();
    await expect(save).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const restore = page.getByRole('button', { name: english ? 'Restore version before fitting' : 'Przywróć wersję sprzed dopasowania' });
    expect((await restore.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `../tmp/interview-fit-${language}-${width}.png`, fullPage: true });
    await restore.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText(english ? 'Restored the version before fitting.' : 'Przywrócono wersję sprzed dopasowania.')).toBeVisible();
    expect(posts.filter(body => body.action === 'shorten')).toHaveLength(0);
  });
}

test('real template fit measures overflow and preserves content', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/');
  const result = await page.evaluate(async (data) => {
    const { prepareInterviewFit } = await import('/src/utils/interviewFit.js');
    return prepareInterviewFit({ template_id: 'linden', spacing_px: { stack: 4, record: 10, section: 21, after_rule: 8 },
      preview: { ...data, fit: { allow_shorten: true } } });
  }, fixture);
  expect(result.elements.length).toBeGreaterThan(0);
  expect(Math.max(...result.elements.map(el => el.page || 1))).toBeLessThanOrEqual(fixture.pages);
  expect(result.required_reduction).toBeGreaterThanOrEqual(0);
  expect(result.required_reduction).toBeLessThanOrEqual(1);
});

test('after shorter verified prose, the same template collapses two pages to one', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/');
  const data = structuredClone(fixture);
  // Simulate a verified server rewrite while retaining the old measured boxes.
  // The browser must remeasure the new text before selecting its final layout.
  for (const el of data.elements) {
    if (el.category === 'textarea' && el.bulletList) el.content = 'Przygotowywanie raportów i kontrola dokumentacji.';
  }
  const result = await page.evaluate(async (preview) => {
    const { prepareInterviewFit } = await import('/src/utils/interviewFit.js');
    return prepareInterviewFit({ template_id: 'linden', spacing_px: { stack: 4, record: 10, section: 21, after_rule: 8 },
      preview: { ...preview, fit: { allow_shorten: true } } });
  }, data);
  expect(result.action).toBe('finish');
  expect(Math.max(...result.elements.map(el => el.page || 1))).toBe(1);
  for (const original of data.elements.filter(el => !el.fixedToPage)) {
    expect(result.elements.find(el => el.element_id === original.element_id)?.content).toBe(original.content);
  }
});
