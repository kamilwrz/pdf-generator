import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) {
  for (const width of [390, 834, 1280, 1920]) {
    test(`source prerequisite in interview and profile: ${language} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const api = await installMockApi(page, { documents: [], imports: [] });
      await page.addInitScript((language) => {
        localStorage.setItem('token', 'local-playwright-token');
        localStorage.setItem('cvstudio.uiLanguage', language);
      }, language);
      let ready = false;
      const writes = [];
      await page.route('**/api/career-profile*', async (route) => {
        expect(route.request().method()).toBe('GET');
        await route.fulfill({ json: { revision: 1,
          facts: [{ id: 'owner', path: '/name', text: 'Existing Owner', kind: 'fact', context: '', source: 'manual' }],
          sources: { documents: ready ? [{ id: 30, title: 'Candidate CV' }] : [], imports: [] },
        } });
      });
      await page.route('**/api/ai/interviews**', async (route) => {
        if (route.request().method() !== 'GET') writes.push(route.request().postDataJSON());
        await route.fulfill({ json: { items: [], next_offset: null } });
      });
      const en = language === 'en';
      const heading = en ? 'Add a CV with your details first' : 'Najpierw dodaj CV z danymi';
      for (const path of ['/app/interview', '/app/career-profile']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        await expect(page.getByRole('button', { name: en ? 'Start interview' : 'Rozpocznij wywiad', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Dodaj informację|Add information/ })).toHaveCount(0);
        const recovery = page.getByRole('region', { name: heading });
        const importLink = recovery.getByRole('link', { name: en ? 'Import PDF' : 'Importuj PDF' });
        await expect(importLink).toHaveAttribute('href', '/app/import');
        await expect(recovery.getByRole('link', { name: en ? 'Create a CV manually' : 'Utwórz CV ręcznie' })).toHaveAttribute('href', '/app/new');
        await importLink.focus();
        await page.keyboard.press('Tab');
        await expect(recovery.getByRole('link').last()).toBeFocused();
        if (width === 834) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        for (const link of await recovery.getByRole('link').all()) {
          const box = await link.boundingBox();
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        }
        await page.screenshot({ path: `../tmp/source-gate-${path.split('/').at(-1)}-${language}-${width}.png`, fullPage: true });
      }
      expect(writes).toHaveLength(0);
      ready = true;
      await page.goto('/app/interview');
      const selector = page.getByLabel(en ? 'Information source' : 'Źródło informacji');
      await selector.selectOption('document:30');
      await expect(page.getByRole('button', { name: en ? 'Start interview' : 'Rozpocznij wywiad', exact: true })).toBeEnabled();
      await expect(page.getByLabel(en ? 'This is my CV — include my career profile' : 'To moje CV — dołącz mój profil zawodowy')).not.toBeChecked();
      await page.goto('/app/career-profile');
      await expect(page.getByRole('button', { name: /Dodaj informację|Add information/ })).toBeVisible();
      expect(writes).toHaveLength(0);
      api.assertHermetic();
    });
  }
}
