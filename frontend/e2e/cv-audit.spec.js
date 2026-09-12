import { expect, test } from '@playwright/test';
import { installMockApi, login, SAVED_DOCUMENT, SAVED_ELEMENTS } from './support/mockApi.js';

const SOURCE_TEXT = 'Tworze interfejsy w Figma.';
const AUDIT_DOCUMENT = {
  ...SAVED_DOCUMENT,
  cv_data: { ...SAVED_DOCUMENT.cv_data, skills: [
    { category: 'Narzędzia', items: [SOURCE_TEXT] },
    { category: 'Technologie', items: ['React', 'TypeScript'] },
  ] },
};
const AUDIT_ELEMENTS = SAVED_ELEMENTS.map((element) => element.element_id === 'skills-tools-body'
  ? { ...element, content: SOURCE_TEXT } : element);

/** A short factual report exercises distinct issue kinds without a paid provider call. */
function auditResponse() {
  return {
    message: 'Audyt gotowy.', rating: null, categories: [], tips: [], strengths: [], priorities: [],
    // Analysis must discard unsolicited write proposals even if an older server
    // accidentally returns them alongside the additive audit response.
    corrections: [{ element_id: 'saved-name', content: 'Unrequested replacement' }],
    updated_cv_data: { ...AUDIT_DOCUMENT.cv_data, name: 'Unrequested replacement' },
    audit: {
      version: 1,
      summary: 'Popraw pisownię i uzupełnij opis pracy o sprawdzalne rezultaty.',
      total_findings: 3, error_count: 1, improvement_count: 1, missing_count: 1, verification_count: 0,
      categories: [
        {
          id: 'grammar', label: 'Pisownia i gramatyka',
          description: 'Pisownia, odmiana i interpunkcja w istniejącym tekście.',
          status: 'needs_attention', summary: 'Jedno słowo wymaga polskiego znaku.',
          issue_count: 1, error_count: 1, improvement_count: 0, missing_count: 0, verification_count: 0,
          recommended_action: 'grammar',
          findings: [{ id: 'spelling-1', severity: 'medium', kind: 'error',
            title: 'Brak znaku diakrytycznego', description: 'W pierwszej osobie napisz „Tworzę”.',
            evidence: [{ element_id: 'skills-tools-body', quote: 'Tworze' }],
            recommendation: 'Uruchom korektę gramatyki i sprawdź proponowaną zmianę.',
            question: null, action: 'grammar' }],
        },
        {
          id: 'achievements', label: 'Rezultaty i osiągnięcia',
          description: 'Zakres pracy, jej efekty i poparte faktami przykłady.',
          status: 'needs_attention', summary: 'Opis narzędzia nie wyjaśnia jeszcze rezultatu pracy.',
          issue_count: 2, error_count: 0, improvement_count: 1, missing_count: 1, verification_count: 0,
          recommended_action: 'interview',
          findings: [
            { id: 'result-1', severity: 'high', kind: 'missing',
              title: 'Brakuje konkretnego rezultatu', description: 'CV nie podaje efektu stworzenia interfejsu.',
              evidence: [], recommendation: 'Dodaj potwierdzony rezultat. Jeśli nie masz liczby, opisz efekt jakościowo.',
              question: 'Co zmieniło się dla użytkowników po wdrożeniu interfejsu?', action: 'interview' },
            { id: 'scope-1', severity: 'low', kind: 'improvement',
              title: 'Doprecyzuj zakres pracy', description: 'Opis nie wskazuje rodzaju interfejsu ani Twojej odpowiedzialności.',
              evidence: [{ element_id: 'skills-tools-body', quote: SOURCE_TEXT }],
              recommendation: 'Nazwij produkt i własny wkład, zachowując zgodność z doświadczeniem.',
              question: 'Za który fragment interfejsu odpowiadasz?', action: 'interview' },
          ],
        },
        {
          id: 'structure', label: 'Podział na sekcje', description: 'Czytelne nagłówki i grupowanie treści.',
          status: 'clear', summary: 'Umiejętności mają jednoznaczny nagłówek i dwie nazwane grupy.',
          issue_count: 0, error_count: 0, improvement_count: 0, missing_count: 0, verification_count: 0,
          recommended_action: null, findings: [],
        },
        {
          id: 'job_fit', label: 'Dopasowanie do oferty', description: 'Porównanie z wymaganiami konkretnej oferty.',
          status: 'not_assessed', summary: 'Nie podano oferty pracy. Nie można ocenić dopasowania.',
          issue_count: 0, error_count: 0, improvement_count: 0, missing_count: 0, verification_count: 0,
          recommended_action: 'match_job', findings: [],
        },
      ],
      strengths: ['Umiejętności są pogrupowane i nazwane.'],
      limitations: ['Audyt nie potwierdza prawdziwości deklaracji ani wyglądu wyeksportowanego PDF.'],
    },
  };
}

async function openAssistant(page, language = 'pl') {
  if (language === 'en') await page.addInitScript(() => localStorage.setItem('cvstudio.uiLanguage', 'en'));
  await login(page);
  await page.getByText(language === 'en' ? 'Continue latest CV' : 'Kontynuuj ostatnie CV', { exact: true }).click();
  await page.getByRole('button', { name: language === 'en' ? 'Open AI assistant' : 'Otwórz asystenta AI' }).click();
  return page.getByRole('button', { name: language === 'en' ? 'Check CV' : 'Sprawdź CV', exact: true });
}

async function openAudit(page, api, language = 'pl') {
  const check = await openAssistant(page, language);
  await check.click();
  await expect.poll(() => assistantCalls(api).length).toBe(1);
  return page.getByRole('region', { name: language === 'en' ? 'CV audit' : 'Audyt CV', exact: true });
}

function assistantCalls(api) {
  return api.calls.filter((call) => call.path === '/ai/assistant').map((call) => JSON.parse(call.body));
}

async function installAuditApi(page, responses = [auditResponse()]) {
  return installMockApi(page, { savedDocument: AUDIT_DOCUMENT, documents: [AUDIT_DOCUMENT],
    savedElements: AUDIT_ELEMENTS, assistantResponses: responses });
}

/** Check the reading surface and its interactive rows, excluding the intentionally zoomable A4. */
async function expectAuditReflow(panel, page) {
  expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const control of await panel.locator('button:visible, summary:visible').all()) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
}

async function expandCategory(panel, id) {
  const all = panel.locator('details').first();
  if (await all.getAttribute('open') === null) await all.locator(':scope > summary').click();
  const category = panel.locator(`details[data-audit-category="${id}"]`);
  const summary = category.locator('summary');
  if (await category.getAttribute('open') === null) {
    await summary.focus();
    await summary.press('Enter');
  }
  await expect(category).toHaveAttribute('open', '');
  return category;
}

test('audit reports grounded categories without editing and only runs grammar after explicit activation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await installAuditApi(page, [auditResponse(), {
    message: 'Sprawdzono pisownię. Zapoznaj się z propozycjami.', tips: [], corrections: [],
  }]);
  const panel = await openAudit(page, api);
  await expect(panel.getByRole('heading', { name: 'Audyt CV', exact: true })).toBeFocused();
  await expect(panel).toContainText('3 wskazówki do Twojego CV');
  await expect(panel).toContainText('Ocenione kategorie: 3 z 4.');
  const totals = panel.locator('dl').first();
  await expect(totals.locator('dt')).toHaveText(['Błędy', 'Do ulepszenia', 'Brakujące informacje', 'Do potwierdzenia']);
  await expect(totals.locator('dd')).toHaveText(['1', '1', '1', '0']);
  await expect(page.locator('#saved-name')).toHaveText('Kamil Smoke');
  await expect(page.locator('#skills-tools-body')).toHaveText(SOURCE_TEXT);
  await expect(panel).not.toContainText('Unrequested replacement');
  await expect(page.getByRole('button', { name: /Zastosuj wszystkie|Akceptuj wszystkie/ })).toHaveCount(0);

  const grammar = await expandCategory(panel, 'grammar');
  await expect(grammar.locator('summary')).toContainText('1 do poprawienia');
  await expect(grammar.getByText('Brak znaku diakrytycznego', { exact: true })).toBeVisible();
  await expect(grammar.locator('blockquote')).toContainText('Tworze');
  await expect(panel).not.toContainText('skills-tools-body');
  const achievement = await expandCategory(panel, 'achievements');
  await expect(achievement.locator('summary')).toContainText('2 do poprawienia');
  await expect(achievement).toContainText('Co zmieniło się dla użytkowników po wdrożeniu interfejsu?');
  await expect(panel.locator('[data-audit-category="structure"] summary')).toContainText('0');
  await expandCategory(panel, 'job_fit');
  await expect(panel).toContainText('Nie podano oferty pracy. Nie można ocenić dopasowania.');
  await expect(panel).toContainText('Audyt nie potwierdza prawdziwości deklaracji');
  expect(assistantCalls(api).map((call) => call.action)).toEqual(['rating']);
  expect(api.calls.some((call) => ['/pdf/update_pdf', '/pdf/create_pdf'].includes(call.path))).toBe(false);

  const grammarAction = grammar.getByRole('button', { name: 'Popraw gramatykę', exact: true }).first();
  await grammarAction.focus();
  await grammarAction.press('Enter');
  await expect.poll(() => assistantCalls(api).map((call) => call.action)).toEqual(['rating', 'grammar']);
  await expect(page.getByText('Sprawdzono pisownię. Zapoznaj się z propozycjami.')).toBeVisible();
  const [rating, correction] = assistantCalls(api);
  expect(correction.elements).toEqual(rating.elements);
  expect(correction.cv_data).toEqual(AUDIT_DOCUMENT.cv_data);
  expect(correction.message).toBe('');
  expect(correction.history).toEqual([]);
  await expect(page.locator('#skills-tools-body')).toHaveText(SOURCE_TEXT);
  api.assertHermetic();
});

test('an audit missing-facts recommendation opens the existing interview without starting paid AI', async ({ page }) => {
  const api = await installAuditApi(page);
  await page.route('**/api/career-profile', (route) => route.fulfill({ json: { revision: 0, facts: [] } }));
  const interviewWrites = [];
  await page.route('**/api/ai/interviews**', async (route) => {
    if (route.request().method() !== 'GET') interviewWrites.push(route.request().postDataJSON());
    await route.fulfill({ json: { items: [], next_offset: null } });
  });
  const panel = await openAudit(page, api);
  const category = await expandCategory(panel, 'achievements');
  const interview = category.getByRole('button', { name: 'Otwórz wywiad', exact: true }).first();
  await interview.focus();
  await interview.press('Enter');
  await expect(page.getByRole('button', { name: 'Rozpocznij wywiad', exact: true })).toBeEnabled();
  await expect(page.getByLabel('To moje CV — dołącz mój profil zawodowy')).not.toBeChecked();
  expect(assistantCalls(api).map((call) => call.action)).toEqual(['rating']);
  expect(interviewWrites).toEqual([]);
  await page.getByRole('button', { name: 'Wróć do asystenta', exact: true }).click();
  await expect(interview).toBeFocused();
  await expect(page.locator('#saved-name')).toHaveText('Kamil Smoke');
  api.assertHermetic();
});

test('editing the CV disables historical audit tools and permits a fresh audit of the new content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await installAuditApi(page);
  const panel = await openAudit(page, api);
  const category = await expandCategory(panel, 'grammar');
  await expect(category.getByRole('button', { name: 'Popraw gramatykę', exact: true }).first()).toBeEnabled();

  // The saved fixture exposes a zero-height text baseline; dispatch the same
  // semantic activation used by the existing editor regressions before typing.
  await page.getByRole('button', { name: 'Zamknij asystenta AI' }).last().click();
  const name = page.locator('#saved-name');
  await name.dispatchEvent('click');
  await expect(name).toHaveAttribute('contenteditable', 'true');
  await name.focus();
  await name.press('ControlOrMeta+A');
  await page.keyboard.insertText('Kamil Updated');
  await page.getByRole('button', { name: 'Otwórz asystenta AI' }).click();
  await expect(panel.getByRole('status')).toContainText('CV zmieniło się od tego audytu.');
  await expandCategory(panel, 'grammar');
  await expect(category.getByRole('button', { name: 'Popraw gramatykę', exact: true }).first()).toBeDisabled();
  expect(assistantCalls(api)).toHaveLength(1);
  await panel.getByRole('button', { name: 'Uruchom audyt ponownie', exact: true }).click();
  await expect.poll(() => assistantCalls(api).length).toBe(2);
  expect(assistantCalls(api)[1].elements.find((element) => element.id === 'saved-name' || element.element_id === 'saved-name').content).toBe('Kamil Updated');
  const freshPanel = page.getByRole('region', { name: 'Audyt CV', exact: true }).last();
  await expect(freshPanel.getByRole('heading', { name: 'Audyt CV', exact: true })).toBeFocused();
  const freshCategory = await expandCategory(freshPanel, 'grammar');
  await expect(freshCategory.getByRole('button', { name: 'Popraw gramatykę', exact: true }).first()).toBeEnabled();
  api.assertHermetic();
});

test('an audit from the previous template keeps its reading shortcuts and rerun available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await installAuditApi(page);
  const panel = await openAudit(page, api);
  await expect(panel.getByRole('heading', { name: 'Audyt CV', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Zamknij asystenta AI' }).last().click();
  await page.getByRole('button', { name: /^Następny szablon:/ }).click();
  // Template application deliberately assigns a fresh element identity graph.
  // Observe the old graph leaving the canvas, rather than relying on server IDs.
  await expect(page.locator('#saved-name')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Poprzedni szablon: Sterling' })).toBeVisible();
  await page.getByRole('button', { name: 'Otwórz asystenta AI' }).click();
  await page.getByRole('button', { name: 'Historia wyników', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('CV zmieniło się od tego audytu.');
  const priority = panel.getByRole('navigation').getByRole('button', { name: /Brakuje konkretnego rezultatu/ });
  await expect(priority).toBeEnabled();
  await priority.focus();
  await priority.press('Enter');
  const category = panel.locator('[data-audit-category="achievements"]');
  await expect(category.getByRole('heading', { name: 'Brakuje konkretnego rezultatu', exact: true })).toBeFocused();
  await expect(category.getByRole('button', { name: 'Otwórz wywiad', exact: true }).first()).toBeDisabled();
  const rerun = panel.getByRole('button', { name: 'Uruchom audyt ponownie', exact: true });
  await expect(rerun).toBeEnabled();
  await rerun.click();
  await expect.poll(() => assistantCalls(api).length).toBe(2);
  expect(assistantCalls(api)[1].elements).not.toEqual(assistantCalls(api)[0].elements);
  expect(assistantCalls(api)[1].elements.some((element) => element.content === 'Kamil Smoke')).toBe(true);
  await expect(page.getByRole('region', { name: 'Audyt CV', exact: true }).last()
    .getByRole('heading', { name: 'Audyt CV', exact: true })).toBeFocused();
  api.assertHermetic();
});

for (const language of ['pl', 'en']) {
  test(`audit disclosures, keyboard and responsive reading in ${language}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const api = await installAuditApi(page);
    const panel = await openAudit(page, api, language);
    const heading = panel.getByRole('heading', { name: language === 'en' ? 'CV audit' : 'Audyt CV', exact: true });
    await expect(heading).toBeFocused();
    const category = await expandCategory(panel, 'grammar');
    const summary = category.locator('summary');
    await summary.focus();
    await summary.press('Space');
    await expect(category).not.toHaveAttribute('open', '');
    await summary.press('Enter');
    await expect(category).toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
    expect(await summary.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');
    await expect(category.getByRole('button', { name: language === 'en' ? 'Fix grammar' : 'Popraw gramatykę', exact: true }).first()).toBeEnabled();

    for (const width of [390, 834, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectAuditReflow(panel, page);
      await heading.scrollIntoViewIfNeeded();
      await page.getByRole('complementary', { name: language === 'en' ? 'AI assistant' : 'Asystent AI' })
        .screenshot({ path: testInfo.outputPath(`audit-${language}-${width}.png`) });
      if (width === 390 || width === 1280) {
        await category.getByRole('heading', { name: 'Brak znaku diakrytycznego', exact: true }).scrollIntoViewIfNeeded();
        await page.getByRole('complementary', { name: language === 'en' ? 'AI assistant' : 'Asystent AI' })
          .screenshot({ path: testInfo.outputPath(`audit-finding-${language}-${width}.png`) });
      }
    }
    // 640 × 500 CSS pixels is the reflow viewport of a 1280 × 1000 browser
    // at 200% zoom. Doubling root text also checks independent text enlargement.
    await page.setViewportSize({ width: 640, height: 500 });
    await expectAuditReflow(panel, page);
    await page.setViewportSize({ width: 834, height: 1000 });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expectAuditReflow(panel, page);
    expect(assistantCalls(api).map((call) => call.action)).toEqual(['rating']);
    api.assertHermetic();
  });
}

test('audit loading blocks duplicates, preserves the CV on error and recovers to an explicit clear result', async ({ page }) => {
  const api = await installAuditApi(page);
  let requests = 0;
  let finishFailure;
  const clearResult = auditResponse();
  clearResult.audit.categories = [clearResult.audit.categories[2]];
  Object.assign(clearResult.audit, { total_findings: 0, error_count: 0, improvement_count: 0, missing_count: 0,
    summary: 'W ocenionej kategorii nie znaleziono uwag.' });
  await page.route('**/api/ai/assistant', async (route) => {
    requests += 1;
    if (requests === 1) {
      await new Promise((resolve) => { finishFailure = resolve; });
      await route.fulfill({ status: 422, json: { detail: 'Audyt chwilowo niedostępny. Spróbuj ponownie.' } });
    } else await route.fulfill({ json: clearResult });
  });
  const check = await openAssistant(page);
  await check.click();
  await expect.poll(() => requests).toBe(1);
  await expect(check).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Wywiad', exact: true })).toHaveCount(0);
  await expect(page.locator('#saved-name')).toHaveText('Kamil Smoke');
  finishFailure();
  await expect(page.getByText(/Audyt chwilowo niedostępny\. Spróbuj ponownie\./)).toBeVisible();
  await page.getByRole('button', { name: '← Narzędzia' }).click();
  await expect(check).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Audyt CV', exact: true })).toHaveCount(0);
  await check.click();
  const panel = page.getByRole('region', { name: 'Audyt CV', exact: true });
  await expect(panel.getByRole('heading', { name: 'Audyt CV', exact: true })).toBeFocused();
  await expect(panel.locator('dl').first().locator('dd')).toHaveText(['0', '0', '0', '0']);
  await expect(panel).toContainText('W ocenionej kategorii nie znaleziono uwag.');
  await expect(panel).toContainText('Ocenione kategorie: 1 z 1.');
  await expect(panel.locator('[data-audit-category="structure"] summary')).toContainText('0');
  await expect(page.locator('#saved-name')).toHaveText('Kamil Smoke');
  expect(requests).toBe(2);
  api.assertHermetic();
});
