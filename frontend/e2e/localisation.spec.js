import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

// Vite compiles the editor graph lazily on the first development navigation.
test.setTimeout(60_000);

for (const width of [390, 834, 1280, 1920]) {
  test(`language switch preserves public navigation and setup at ${width}px`, async ({ page }) => {
    page.on("pageerror", (error) => console.error("Localisation browser error:", error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await installMockApi(page);
    await page.goto('/');
    const select = page.getByRole('combobox', { name: /Język aplikacji|Application language/ });
    await select.focus();
    await select.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 25_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(select).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto('/login');
    await expect(page.getByRole('combobox', { name: 'Application language' })).toHaveValue('en');
    await page.getByLabel('Username', { exact: true }).fill('Unsubmitted name');
    await page.getByRole('combobox', { name: 'Application language' }).selectOption('pl');
    await expect(page.getByLabel('Nazwa użytkownika', { exact: true })).toHaveValue('Unsubmitted name');
    await page.getByRole('combobox', { name: 'Język aplikacji' }).selectOption('en');
    await page.goto('/cvstudio/guest?start=new');
    const setup = page.getByRole('dialog', { name: /^(Create CV|Utwórz CV)$/ });
    await expect(setup).toBeVisible({ timeout: 25_000 });
    const language = setup.getByRole('combobox', { name: /^(CV language|Język CV)$/ });
    await expect(language).toHaveValue('en');
    await language.selectOption('pl');
    const ui = setup.getByRole('combobox', { name: /Język aplikacji|Application language/ });
    await ui.focus();
    await ui.selectOption('pl');
    await expect(language).toHaveValue('pl');
    await expect(ui).toBeFocused();
    await ui.selectOption('en');
    await expect(language).toHaveValue('pl');
    expect(await setup.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/localisation-${width}.png`, fullPage: true });
    api.assertHermetic();
  });
}

test('a saved English choice survives refresh and verification context selects EN', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/verify-email?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Application language' })).toHaveValue('en');
});


test('English guest CV survives registration, verification and one PDF download', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem('cvstudio.uiLanguage', 'en'));
  const api = await installMockApi(page);
  await page.goto('/');
  await page.locator('#top').getByRole('link', { name: 'Create a CV with this template', exact: true }).click();
  const name = page.locator('[contenteditable="true"][data-placeholder="Full name"]');
  await expect(name).toBeFocused();
  await name.fill('Anna Nowak');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await page.getByRole('dialog', { name: 'Download your CV as a PDF' }).getByRole('button', { name: 'Create a free account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('Kamil');
  await page.getByLabel('Email', { exact: true }).fill('anna@example.com');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Create account and continue to PDF' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.goto('/verify-email?token=playwright-proof&lang=en');
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Username', { exact: true }).fill('Kamil');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const claim = page.getByRole('dialog', { name: 'Does this draft belong to you?' });
  await expect(claim).toBeVisible();
  const download = page.waitForEvent('download');
  await claim.getByRole('button', { name: 'This is my CV — download PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
  expect(api.calls.filter((call) => call.path.includes('render_pdf'))).toHaveLength(1);
  for (const call of api.calls.filter((call) => call.method === 'POST')) expect(call.headers['accept-language']).toBe('en');
  expect(await page.evaluate(() => localStorage.getItem('cvstudio.uiLanguage'))).toBe('en');
  api.assertHermetic();
});

test('English account preserves a Polish CV, selection and request count across UI switches', async ({ page }) => {
  const { SAVED_DOCUMENT, SAVED_ELEMENTS } = await import('./support/mockApi.js');
  await page.addInitScript(() => {
    localStorage.setItem('cvstudio.uiLanguage', 'en');
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('username', 'Kamil');
  });
  const api = await installMockApi(page, { savedDocument: { ...SAVED_DOCUMENT, editor_mode: 'freeform', template_id: null, cv_data: null }, savedElements: [SAVED_ELEMENTS[0]] });
  await page.goto('/app/documents/41');
  await expect(page.getByRole('textbox', { name: 'Current document name' })).toHaveValue('CV Smoke', { timeout: 25_000 });
  const content = page.locator(`[id="${SAVED_ELEMENTS[0].element_id}"]`);
  await expect(content).toHaveText(SAVED_ELEMENTS[0].content);
  const before = await content.textContent();
  // Canvas text uses a zero-height baseline box; target its painted glyphs.
  const glyph = await content.evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    const box = range.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(glyph.x, glyph.y);
  const writes = () => api.calls.filter((call) => ['POST', 'PUT', 'DELETE'].includes(call.method) && !call.path.includes('/events/'));
  const count = writes().length;
  const selector = page.getByRole('combobox', { name: /Application language|Język aplikacji/ });
  await selector.focus();
  await selector.selectOption('pl');
  await expect(content).toHaveText(before);
  await selector.selectOption('en');
  await expect(content).toHaveText(before);
  await expect(selector).toBeFocused();
  expect(writes()).toHaveLength(count);
  await page.getByRole('link', { name: 'My documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My documents', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Current document name' })).toHaveValue('CV Smoke', { timeout: 25_000 });
  api.assertHermetic();
});

test('English public pages fit at 200 percent text zoom and reduced motion', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cvstudio.uiLanguage', 'en'));
  const api = await installMockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/', '/templates', '/pricing', '/help', '/privacy']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator('body')).not.toContainText(/(?:public|editor|common):[a-zA-Z]/);
  }
  api.assertHermetic();
});

test('English AI controls correct Polish content once and preserve undo across a UI switch', async ({ page }) => {
  const { SAVED_DOCUMENT, SAVED_ELEMENTS } = await import('./support/mockApi.js');
  const before = 'Projektuję interfejsy w React dla 30 klientów.';
  const after = 'Tworzę interfejsy React dla 30 klientów.';
  await page.addInitScript(() => {
    localStorage.setItem('cvstudio.uiLanguage', 'en');
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('username', 'Kamil');
  });
  const summary = [
    { element_id: 'summary-heading', category: 'text', content: 'PODSUMOWANIE', top: 370, height: 14, flowRole: 'section-chrome', editorSectionType: 'summary', bold: true },
    { element_id: 'summary-body', category: 'textarea', content: before, top: 400, height: 48, flowRole: 'content', autoHeight: true, cvDataBindings: [{ path: ['summary'] }] },
  ].map((element) => ({ ...element, left: 250, width: 280, fontSize: 10, lineHeight: 14, page: 1, extra_properties: { ...element, lineHeight: 14 } }));
  const api = await installMockApi(page, {
    savedElements: [...SAVED_ELEMENTS, ...summary],
    savedDocument: { ...SAVED_DOCUMENT, cv_data: { ...SAVED_DOCUMENT.cv_data, language: 'Polish', summary: before } },
    assistantResponses: [{ message: 'Shortened without changing facts.', scoped_corrections: [{ fragment_id: 'summary-body:0', before, content: after }], achievement_templates: [] }],
  });
  await page.goto('/app/documents/41');
  await expect(page.locator('#summary-body')).toContainText(before, { timeout: 25_000 });
  await page.locator('#summary-heading').scrollIntoViewIfNeeded();
  await page.locator('#summary-heading').dispatchEvent('pointerenter');
  await page.locator('[data-canvas-toolbar-key="heading:summary-heading"]').getByRole('button', { name: 'AI for the selected scope' }).click();
  await page.getByRole('menuitem', { name: 'Shorten', exact: true }).click();
  const panel = page.locator('#ai-assistant-panel');
  await expect(panel.getByRole('button', { name: 'Apply all', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Apply all', exact: true }).click();
  await expect(page.locator('#summary-body')).toContainText(after);
  await panel.getByRole('button', { name: 'Close AI assistant', exact: true }).click();
  await page.getByRole('combobox', { name: 'Application language' }).selectOption('pl');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#summary-body')).toContainText(before);
  const calls = api.calls.filter((call) => call.path === '/ai/assistant');
  expect(calls).toHaveLength(1);
  expect(calls[0].headers['accept-language']).toBe('en');
  api.assertHermetic();
});

test('English resumed interview preserves historical Polish questions and an unsent answer', async ({ page }) => {
  const id = 'f1fc439c-84f1-45ad-b23c-a3e384a81d3a';
  await page.addInitScript(() => {
    localStorage.setItem('cvstudio.uiLanguage', 'en');
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('username', 'Kamil');
  });
  const api = await installMockApi(page);
  const question = 'Jaki projekt ukończyłaś samodzielnie?';
  const session = { id, revision: 1, evidence_scope: 'session', evidence_profile: { revision: 0, facts: [] }, mode: 'create', phase: 'question', language: 'pl', profile_revision: 0, template_id: 'linden', question_limit: 8, planned_question_count: 8, answers: [], question: { id: 'q1', topic: 'project', text: question, reason: 'Pokażemy Twój wkład.', context: 'Projekt' }, requirements: [], proposed_facts: [], confirmed: true, preview: null, source_cv_data: { name: 'Anna Nowak' } };
  const writes = [];
  await page.route('**/api/career-profile*', (route) => route.fulfill({ json: { revision: 0, facts: [], sources: { documents: [], imports: [] } } }));
  await page.route('**/api/ai/interviews**', (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request());
    return route.fulfill({ json: session });
  });
  await page.goto(`/app/interview/${id}`);
  await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 25_000 });
  const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
  await answer.fill('Zbudowałam raport miesięczny.');
  const select = page.getByRole('combobox', { name: /Application language|Język aplikacji/ });
  await select.focus();
  await select.selectOption('pl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl', { timeout: 25_000 });
  await expect(page.getByRole('textbox', { name: 'Twoja odpowiedź', exact: true })).toHaveValue('Zbudowałam raport miesięczny.');
  await select.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 25_000 });
  await expect(answer).toHaveValue('Zbudowałam raport miesięczny.');
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  api.assertHermetic();
});


test('English Slate repairs legacy contact chrome and switches legacy hints without translating CV headings', async ({ page }) => {
  const { SAVED_DOCUMENT } = await import('./support/mockApi.js');
  const { slateTemplate } = await import('../src/templates/slate.js');
  await page.addInitScript(() => {
    localStorage.setItem('cvstudio.uiLanguage', 'en');
    localStorage.setItem('token', 'local-playwright-token');
    localStorage.setItem('username', 'Kamil');
  });
  const fixtures = slateTemplate.map((element, index) => ({
    ...element, element_id: `slate-${index}`,
    ...(element.photoSlot ? { photoSlotHidden: true } : {}),
  }));
  fixtures.push(
    { element_id: 'legacy-contact', category: 'text', content: 'DANE KONTAKTOWE', left: 49, top: 63, fontSize: 7.6, fontFamily: 'Montserrat', bold: true, page: 1, locked: true, fixedToPage: true, flowRole: 'photo-contact-header' },
    ...['badge', 'icon', 'rule'].map((part) => ({ element_id: `legacy-${part}`, category: 'line', left: 25, top: 60, width: 1, height: 1, page: 1, locked: true, fixedToPage: true, flowRole: 'photo-contact-header' })),
    { element_id: 'legacy-location', category: 'text', content: '', placeholder: 'City, country', left: 250, top: 125, fontSize: 10, page: 1, starterPlaceholder: true },
    { element_id: 'english-heading', category: 'text', content: 'EDUCATION', left: 250, top: 145, fontSize: 10, page: 1 },
    { element_id: 'custom-heading', category: 'text', content: 'Moja własna sekcja', left: 250, top: 165, fontSize: 10, page: 1 },
  );
  const api = await installMockApi(page, {
    savedDocument: { ...SAVED_DOCUMENT, template_id: 'slate', cv_data: { ...SAVED_DOCUMENT.cv_data, language: 'English' } },
    savedElements: fixtures.map((element) => ({ ...element, extra_properties: { ...element } })),
  });
  // Serve the real Slate icons locally; the API fixture intentionally rejects
  // any unregistered request rather than falling through to production.
  await page.route(/\/template-assets\/iconic\/slate(?:-accent)?\/[a-z]+\.png$/, async (route) => {
    const { fileURLToPath } = await import('node:url');
    const relative = new URL(route.request().url()).pathname.split('/template-assets/')[1];
    await route.fulfill({ path: fileURLToPath(new URL(`../../backend/template_assets/${relative}`, import.meta.url)), contentType: 'image/png' });
  });
  await page.goto('/app/documents/41');
  await expect(page.locator('#legacy-contact')).toHaveText('CONTACT DETAILS', { timeout: 25_000 });
  const writes = () => api.calls.filter((call) => ['POST', 'PUT', 'DELETE'].includes(call.method) && !call.path.includes('/events/'));
  const count = writes().length;
  const selector = page.getByRole('combobox', { name: /Application language|Język aplikacji/ });
  for (const language of ['pl', 'en', 'pl']) {
    await selector.focus();
    await selector.selectOption(language);
    await expect(page.locator('#legacy-location')).toHaveAttribute('data-placeholder', language === 'en' ? 'City, country' : 'Miasto, kraj');
    await expect(page.locator('#legacy-location')).toHaveText('');
    await expect(page.locator('#legacy-contact')).toHaveText('CONTACT DETAILS');
    await expect(page.locator('#english-heading')).toHaveText('EDUCATION');
    await expect(page.locator('#custom-heading')).toHaveText('Moja własna sekcja');
    await expect(selector).toBeFocused();
    expect(writes()).toHaveLength(count);
  }
  api.assertHermetic();
});
