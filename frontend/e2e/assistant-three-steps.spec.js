import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

const copy = {
  pl: { source: 'Które CV chcesz ulepszyć?', content: 'Treść CV', answer: 'Twoja odpowiedź', finish: 'Zapisz odpowiedź i wybierz szablon', template: 'Utwórz CV · Linden', history: 'Zapisane rozmowy' },
  en: { source: 'Which CV would you like to improve?', content: 'CV content', answer: 'Your answer', finish: 'Save answer and choose a template', template: 'Create CV · Linden', history: 'Saved conversations' },
};

/** Synthetic API observes the complete source → answer → template path without paid requests. */
async function fixture(page, language) {
  await installMockApi(page);
  await page.addInitScript(lang => {
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('cvstudio.uiLanguage', lang);
  }, language);
  const fact = { id: 'name', text: 'Anna Example', kind: 'fact', source: 'document:41', path: '/name' };
  let session = { id: 'three-step', evidence_scope: 'session', revision: 1, profile_revision: 0,
    evidence_profile: { revision: 0, facts: [] }, review_source_facts: [fact],
    source_cv_data: { name: fact.text }, source_document_id: 41, template_id: 'linden',
    mode: 'create', phase: 'intake', language: 'pl', confirmed: false,
    question: null, answers: [], requirements: [], proposed_facts: [], question_limit: 10 };
  const writes = [];
  await page.route('**/api/career-profile**', route => route.fulfill({ json: {
    revision: 0, facts: [], sources: { documents: [{ id: 41, title: 'Anna — CV' }], imports: [{ id: 9, filename: 'Anna.pdf' }] },
  } }));
  await page.route('**/api/ai/interviews**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/credits')) return route.fulfill({ json: { credits_charged: 1, requests: [] } });
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push({ path, body });
      if (!path.endsWith('/interviews')) {
        expect(body.revision).toBe(session.revision);
        expect(body.profile_revision).toBe(session.profile_revision);
        session.revision++;
      }
      if (path.endsWith('/confirm')) {
        session = { ...session, phase: 'ready', confirmed: true, profile_revision: 1, evidence_profile: { revision: 1, facts: body.facts } };
        return route.fulfill({ json: { session, profile: session.evidence_profile } });
      }
      if (path.endsWith('/next')) session = { ...session, phase: 'question', question: { id: 'q1', text: 'Jakie zadania wykonywałaś?', reason: '', topic: 'experience' } };
      if (path.endsWith('/answers')) session = { ...session, phase: 'ready', question: null, answers: [{ question: session.question, answer: body.answer, status: body.status }] };
      if (path.endsWith('/preview')) session = { ...session, phase: 'preview', preview: { pages: 1, profile_revision: 1, cv_data: { name: fact.text }, changes: [], remaining_gaps: [] } };
      if (path.endsWith('/document')) return route.fulfill({ json: { document_id: 41 } });
    }
    return route.fulfill({ json: session });
  });
  return writes;
}

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`three numbered steps, keyboard and reflow ${language} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: width === 834 ? 'reduce' : 'no-preference' });
    const writes = await fixture(page, language);
    const t = copy[language];
    await page.goto('/app/interview');
    if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.getByText(t.source, { exact: true })).toBeVisible();
    await expect(page.locator('li[aria-current="step"]')).toContainText('01');
    await expect(page.getByRole('link', { name: /Profil zawodowy|Career profile/ })).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await page.screenshot({ path: `../tmp/assistant-source-${language}-${width}.png`, fullPage: true });

    const source = page.getByRole('button', { name: 'Anna — CV', exact: true });
    await source.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: t.answer, exact: true })).toBeVisible();
    await expect(page.locator('li[aria-current="step"]')).toContainText('02');
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    expect(writes.map(item => item.path.split('/').at(-1))).toEqual(['interviews', 'confirm', 'next']);
    await page.screenshot({ path: `../tmp/assistant-question-${language}-${width}.png`, fullPage: true });
    await page.getByRole('textbox', { name: t.answer, exact: true }).fill('Przygotowywałam raporty sprzedaży w Excelu.');
    const finish = page.getByRole('button', { name: t.finish, exact: true });
    await finish.focus(); await page.keyboard.press('Enter');
    const template = page.getByRole('button', { name: t.template, exact: true });
    await expect(template).toBeVisible();
    await expect(page.locator('li[aria-current="step"]')).toContainText('03');
    expect(writes.map(item => item.path.split('/').at(-1))).toEqual(['interviews', 'confirm', 'next', 'answers']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const stage = page.locator('[data-stage="prepare"]');
    if (width === 834) await expect(stage).toHaveCSS('animation-name', 'none');
    else expect(await stage.evaluate(el => getComputedStyle(el).animationDuration)).toBe('0.32s');
    for (const control of [template, page.getByRole('button', { name: t.content, exact: true })]) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `../tmp/assistant-templates-${language}-${width}.png`, fullPage: true });
    await template.focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/documents\/41$/);
    expect(writes.slice(-2).map(item => item.path.split('/').at(-1))).toEqual(['preview', 'document']);
  });
}
