import { expect, test } from '@playwright/test';
import { installMockApi, login, SAVED_DOCUMENT } from './support/mockApi.js';

// The first editor navigation compiles the large Vite development graph.
test.setTimeout(60_000);

const dialog = page => page.getByRole('dialog', { name: 'CV STUDIO', exact: true });
const blank = page => page.getByRole('button', { name: /^(Zaczynam od zera|Start from scratch)$/ }).click();
const create = page => page.getByRole('button', { name: /^(Otwórz CV w edytorze|Open CV in the editor)$/ }).click();
const noAi = api => expect(api.calls.filter(call => /extract_cv|interviews.*(confirm|next)|generate/.test(call.path))).toEqual([]);

for (const language of ['pl', 'en']) {
  for (const width of [390, 834, 1280, 1920]) {
    test(`onboarding ${language} at ${width}px, keyboard, reflow and print isolation`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
      const api = await installMockApi(page);
      await page.goto('/app/new?template=linden');
      const setup = dialog(page);
      await expect(setup).toBeVisible({ timeout: 25_000 });
      await expect(setup.locator('h1')).toBeFocused();
      await expect(page.locator('.right-pane')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Nowe CV', exact: true })).toHaveCount(0);
      expect(api.calls.filter(call => /fill_template/.test(call.path))).toHaveLength(0);
      await page.screenshot({ path: info.outputPath(`welcome-${language}-${width}.png`) });
      await blank(page);
      await expect(setup.getByRole('radio', { name: /Linden/ })).toBeChecked();
      await expect(setup.locator('h1')).toBeFocused();
      await page.screenshot({ path: info.outputPath(`templates-${language}-${width}.png`) });
      expect(await setup.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      if (width === 834) {
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await setup.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
      const submit = setup.getByRole('button', { name: /^(Otwórz CV w edytorze|Open CV in the editor)$/ });
      await submit.focus(); await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
      await page.emulateMedia({ media: 'print' });
      await expect(setup).not.toBeVisible();
      await page.emulateMedia({ media: 'screen' });
      await create(page);
      await expect(setup).toHaveCount(0);
      await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
      expect(api.calls.filter(call => call.path === '/ai/fill_template')).toHaveLength(1);
      await page.reload();
      await expect(setup).toHaveCount(0);
      noAi(api); api.assertHermetic();
    });
  }
}

test('guest login resumes import, preserves template, and never submits a file automatically', async ({ page }) => {
  const api = await installMockApi(page);
  await page.goto('/app/new?template=linden');
  await page.getByRole('button', { name: 'Mam CV', exact: true }).click();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Zaloguj się', exact: true }).last().click();
  await page.getByLabel('Nazwa użytkownika').fill('Kamil');
  await page.getByLabel('Hasło', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page.getByLabel('Upuść tutaj CV lub wybierz plik')).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Od którego CV zaczynamy?' })).toBeFocused();
  await page.reload();
  await expect(page.getByLabel('Upuść tutaj CV lub wybierz plik')).toBeEnabled();
  await blank(page);
  await expect(page.getByRole('radio', { name: /Linden/ })).toBeChecked();
  noAi(api); api.assertHermetic();
});

test('saved documents bypass onboarding and cancellation/fill errors preserve the active CV', async ({ page }) => {
  const api = await installMockApi(page);
  await login(page);
  await page.goto('/app/documents/41');
  const title = page.getByRole('textbox', { name: 'Nazwa bieżącego dokumentu' });
  await expect(title).toHaveValue('CV Smoke');
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Nowe CV', exact: true }).click();
  await blank(page); await create(page);
  const confirm = page.getByRole('dialog', { name: 'Utworzyć nowe CV?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Wróć do wyboru' }).click();
  await page.keyboard.press('Escape');
  await expect(title).toHaveValue('CV Smoke');
  await page.getByRole('button', { name: 'Nowe CV', exact: true }).click();
  await blank(page);
  await page.route('**/api/ai/fill_template', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: 'Fill failed' }) }));
  await create(page);
  await confirm.getByRole('button', { name: 'Utwórz nowe CV', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(title).toHaveValue('CV Smoke');
  noAi(api); api.assertHermetic();
});

test('manual import history path recovers a source and creates only after the template action', async ({ page }) => {
  const api = await installMockApi(page);
  await login(page);
  await page.goto('/app/import');
  await page.getByText('Moje CV i wcześniejsze importy', { exact: true }).click();
  await page.getByRole('button', { name: /CV-Kamil-Frontend-2026.pdf/ }).click();
  await expect(page.getByText('Wybrane CV:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Wybierz szablon', exact: true }).click();
  await create(page);
  await expect(dialog(page)).toHaveCount(0);
  const fill = api.calls.find(call => call.path === '/ai/fill_template');
  expect(JSON.parse(fill.body).cv_data.name).toBe(SAVED_DOCUMENT.cv_data.name);
  noAi(api); api.assertHermetic();
});

test('improvement hands off the owned source and waits for explicit conversation start', async ({ page }) => {
  const api = await installMockApi(page);
  await page.route('**/api/career-profile', route => route.fulfill({ json: { revision: 1, facts: [] } }));
  await page.route('**/api/interviews/sources', route => route.fulfill({ json: { documents: [], imports: [] } }));
  await login(page);
  await page.getByRole('button', { name: 'Mam CV', exact: true }).click();
  await page.getByText('Moje CV i wcześniejsze importy', { exact: true }).click();
  await page.getByRole('button', { name: 'CV Smoke.pdf', exact: true }).click();
  await page.getByRole('radio', { name: /Poprawić treść/ }).check();
  await page.getByRole('button', { name: 'Otwórz Asystenta CV' }).click();
  await expect(page).toHaveURL(/app\/interview\?source=document&sourceId=41/);
  await expect(page.getByText('CV Smoke.pdf', { exact: true })).toBeVisible();
  noAi(api);
  await page.reload();
  await expect(page.getByText('CV Smoke.pdf', { exact: true })).toBeVisible();
  noAi(api); api.assertHermetic();
});

for (const pro of [false, true]) test(`tailoring handoff opens advert and survives refresh, Pro=${pro}`, async ({ page }) => {
  const api = await installMockApi(page, { entitlements: { ai_assistant: pro, plan_slug: pro ? 'pro' : 'free' } });
  let flow; let writes = 0;
  await page.route(/\/api\/tailoring\/[0-9a-f-]+$/, async route => {
    if (route.request().method() === 'PUT') {
      writes++;
      flow = { ...route.request().postDataJSON(), id: new URL(route.request().url()).pathname.split('/').at(-1), revision: 1, source_cv_data: SAVED_DOCUMENT.cv_data };
    }
    await route.fulfill({ json: flow });
  });
  await login(page);
  await page.getByRole('button', { name: 'Mam CV', exact: true }).click();
  await page.getByText('Moje CV i wcześniejsze importy', { exact: true }).click();
  await page.getByRole('button', { name: 'CV Smoke.pdf', exact: true }).click();
  await page.getByRole('radio', { name: /Dopasować do ogłoszenia/ }).check();
  await page.getByRole('button', { name: 'Przejdź do ogłoszenia' }).click();
  await expect(page).toHaveURL(/app\/tailor\/[0-9a-f-]+$/);
  await expect(page.locator('textarea')).toBeVisible();
  expect(flow).toMatchObject({ step: 'offer', source_kind: 'document', source_id: 41 });
  expect(writes).toBe(1);
  await page.reload();
  await expect(page.locator('textarea')).toBeVisible();
  expect(writes).toBe(1); noAi(api); api.assertHermetic();
});

test('cancelling an in-flight fill rejects its late result and retains the active document', async ({ page }) => {
  const api = await installMockApi(page);
  await login(page); await page.goto('/app/documents/41');
  await expect(page.getByRole('textbox', { name: 'Nazwa bieżącego dokumentu' })).toHaveValue('CV Smoke');
  let complete;
  const hold = new Promise(resolve => { complete = resolve; });
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  await page.route('**/api/ai/fill_template', async route => { started(); await hold; await route.fallback(); });
  await page.getByRole('button', { name: 'Nowe CV', exact: true }).click();
  await blank(page); await create(page);
  await page.getByRole('dialog', { name: 'Utworzyć nowe CV?' }).getByRole('button', { name: 'Utwórz nowe CV', exact: true }).click();
  await requested;
  await dialog(page).getByRole('button', { name: 'Zamknij: CV STUDIO' }).click();
  const response = page.waitForResponse('**/api/ai/fill_template');
  complete(); await response;
  await expect(page.getByRole('textbox', { name: 'Nazwa bieżącego dokumentu' })).toHaveValue('CV Smoke');
  await expect(page).toHaveURL('/app/documents/41');
  expect(await page.evaluate(() => localStorage.getItem('cvstudio.onboarding.v1'))).toBeNull();
  api.assertHermetic();
});

test('account return resumes the selected source after Pro activation without starting AI', async ({ page }) => {
  const access = { ai_assistant: false, plan_slug: 'free' };
  const api = await installMockApi(page, { entitlements: access });
  await login(page);
  await page.getByRole('button', { name: 'Mam CV', exact: true }).click();
  await page.getByText('Moje CV i wcześniejsze importy', { exact: true }).click();
  await page.getByRole('button', { name: 'CV Smoke.pdf', exact: true }).click();
  await page.getByRole('radio', { name: /Poprawić treść/ }).check();
  await page.getByRole('button', { name: 'Poznaj Pro', exact: true }).click();
  await expect(page).toHaveURL('/app/account?purchase=pro');
  await expect(page.getByRole('dialog', { name: 'Twój plan', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  // The existing billing flow owns payment. This fixture models its confirmed entitlement.
  access.ai_assistant = true; access.plan_slug = 'pro';
  await page.getByRole('link', { name: 'Wróć do tworzenia CV', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Poprawić treść/ })).toBeChecked();
  await expect(page.getByText('CV Smoke.pdf', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Otwórz Asystenta CV' })).toBeEnabled();
  noAi(api); api.assertHermetic();
});
