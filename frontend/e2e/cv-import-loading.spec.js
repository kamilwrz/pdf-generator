import { expect, test } from '@playwright/test';
import { installMockApi, login, SAVED_DOCUMENT } from './support/mockApi.js';

test.setTimeout(60_000);

for (const language of ['pl', 'en']) {
  for (const width of [390, 834, 1280, 1920]) {
    test(`PDF import loading ${language} at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 720 });
      await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
      const api = await installMockApi(page);
      // Hold a local response to inspect the real pending UI without calling AI.
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      let requests = 0;
      await page.route('**/api/ai/extract_cv', async route => {
        requests++;
        await pending;
        await route.fulfill({ json: { import: { id: 8 }, cv_data: SAVED_DOCUMENT.cv_data } });
      });
      await login(page);
      await page.goto('/app/import');
      const setup = page.getByRole('dialog', { name: 'CV STUDIO', exact: true });
      const file = setup.locator('input[type="file"]');
      await file.setInputFiles({ name: 'CV-Anna-Kowalska.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-local-test') });
      await setup.getByRole('button', { name: language === 'pl' ? 'Odczytaj CV z PDF' : 'Read CV from PDF' }).click();
      const title = setup.getByRole('heading', { name: language === 'pl' ? 'Odczytujemy Twoje CV' : 'Reading your CV' });
      await expect(title).toBeFocused();
      await expect(file).toBeHidden();
      const progress = setup.getByRole('progressbar');
      await expect(progress).toBeVisible();
      await expect(progress).not.toHaveAttribute('aria-valuenow');
      await expect.poll(() => requests).toBe(1);
      const fits = () => setup.evaluate(node => [node, ...node.querySelectorAll('*')].filter(element => {
        const style = getComputedStyle(element);
        return ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      }).length);
      await expect.poll(fits).toBe(0);
      expect(await setup.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`import-${language}-${width}.png`) });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await progress.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
      if (width === 834) {
        await page.setViewportSize({ width: 640, height: 360 });
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await setup.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
      await page.emulateMedia({ media: 'print' });
      await expect(setup).toBeHidden();
      await page.emulateMedia({ media: 'screen' });
      release();
      await expect(title).toHaveCount(0);
      await expect(setup.locator('h1')).toBeFocused();
      await expect(progress).toHaveCount(0);
      api.assertHermetic();
    });
  }
}
