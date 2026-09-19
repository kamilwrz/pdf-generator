import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) {
  test(`getting-started FAQ preserves the chosen route: ${language}`, async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const question = language === 'pl' ? 'Od czego zacząć?' : 'Where should I start?';
    const guide = page.locator('details').filter({ has: page.locator('summary', { hasText: question }) });
    await expect(guide).not.toHaveAttribute('open');
    await guide.locator('summary').focus();
    await page.keyboard.press('Enter');
    const links = guide.getByRole('link');
    await expect(links).toHaveCount(4);
    await expect(links.nth(1)).toHaveAttribute('href', '/register?start=import&plan=free');
    await expect(links.nth(2)).toHaveAttribute('href', '#wywiad');
    await expect(links.nth(3)).toHaveAttribute('href', '#dopasowanie');
    await page.keyboard.press('Tab');
    await expect(links.first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#top$/);
    await expect(page.locator('#top')).toBeFocused();
    await links.nth(1).click();
    await expect(page).toHaveURL(/\/register\?start=import&plan=free$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  for (const signedIn of [false, true]) {
    test(`landing Pro entry retains account context: ${language} ${signedIn ? 'account' : 'guest'}`, async ({ page }) => {
      await installMockApi(page);
      await page.addInitScript(({ lang, authenticated }) => {
        localStorage.setItem('cvstudio.uiLanguage', lang);
        if (authenticated) {
          localStorage.setItem('token', 'mock-token');
          localStorage.setItem('username', 'Kamil');
        }
      }, { lang: language, authenticated: signedIn });
      await page.goto('/');
      const pro = page.locator('#cennik article').last().getByRole('link', { name: language === 'pl' ? 'Wybierz Pro na 30 dni' : 'Choose Pro for 30 days', exact: true });
      await expect(pro).toHaveAttribute('href', signedIn ? '/app/account' : '/register?plan=pro');
      await pro.click();
      await expect(page).toHaveURL(signedIn ? /\/app\/account$/ : /\/register\?plan=pro$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  for (const width of [390, 834, 1280, 1920]) {
    test(`hero content paths stack with keyboard access: ${language} ${width}`, async ({ page }) => {
      await installMockApi(page);
      await page.addInitScript(language => localStorage.setItem('cvstudio.uiLanguage', language), language);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      // Creation is one action; template choices belong to onboarding. The
      // skip link reaches it before the three grouped product tools.
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: language === 'pl' ? 'Przejdź do treści' : 'Skip to content', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      await page.keyboard.press('Tab');
      const hero = page.locator('#top');
      const start = hero.getByRole('link', { name: language === 'pl' ? 'Stwórz CV za darmo' : 'Create a CV for free', exact: true });
      await expect(start).toBeFocused();
      await expect(start).toHaveCount(1);
      await expect(start).toHaveAttribute('href', '/app/new');
      await expect(hero.getByRole('radio')).toHaveCount(0);
      await expect(hero.getByRole('button')).toHaveCount(0);
      const gallery = page.locator('#landing-template-gallery');
      for (const name of ['Sterling', 'Meridian', 'Linden']) await expect(gallery.getByRole('link', { name: `${name} Free`, exact: true })).toHaveCount(1);
      for (const name of ['Monument', 'Slate', 'Aurelia', 'Regent', 'Cadenza', 'Vellum', 'Atrium']) await expect(gallery.getByRole('link', { name: `${name} Pro`, exact: true })).toHaveCount(1);
      const paths = page.locator('#top nav');
      const links = paths.getByRole('link');
      await expect(links).toHaveCount(4);
      await expect(links.nth(0)).toHaveAttribute('href', '/cvstudio/guest?start=demo');
      await expect(links.nth(1)).toHaveAttribute('href', '/register?start=import&plan=free');
      await expect(links.nth(2)).toHaveAttribute('href', '#wywiad');
      await expect(links.nth(3)).toHaveAttribute('href', '#dopasowanie');
      await expect(paths).toContainText(language === 'pl' ? 'Asystent CV Pro' : 'CV Assistant Pro');
      await expect.poll(() => hero.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
      await hero.screenshot({ path: 'test-results/hero-distill-' + language + '-' + width + '.png' });
      for (const enlarged of [false, true]) {
        if (enlarged) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        for (const link of await links.all()) {
          const box = await link.boundingBox();
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await links.first().focus();
      for (let index = 0; index < 4; index += 1) {
        await expect(links.nth(index)).toBeFocused();
        expect(await links.nth(index).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
        if (index < 3) await page.keyboard.press('Tab');
      }
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#dopasowanie$/);
      await expect(page.locator('#dopasowanie')).toBeFocused();
      await links.nth(2).click();
      await expect(page).toHaveURL(/#wywiad$/);
      await expect(page.locator('#wywiad')).toBeFocused();
    });
  }


  for (const signedIn of [false, true]) {
    test('hero editor and import entries: ' + language + ' ' + signedIn, async ({ page }) => {
      const api = await installMockApi(page);
      await page.addInitScript(({ lang, authenticated }) => {
        localStorage.setItem('cvstudio.uiLanguage', lang);
        if (authenticated) { localStorage.setItem('token', 'mock-token'); localStorage.setItem('username', 'Kamil'); }
      }, { lang: language, authenticated: signedIn });
      await page.goto('/');
      const paths = page.locator('#top nav');
      await paths.getByRole('link').first().click();
      await expect(page).toHaveURL(signedIn ? /\/cvstudio\/Kamil$/ : /\/cvstudio\/guest$/);
      await expect(page.getByRole('button', { name: language === 'pl' ? 'Utwórz moje CV na A4' : 'Create my A4 CV', exact: true })).toBeVisible();
      await page.goto('/');
      await paths.getByRole('link').nth(1).click();
      if (signedIn) {
        await expect(page).toHaveURL(/\/cvstudio\/Kamil$/);
        await expect(page.getByRole('heading', { name: language === 'pl' ? 'Od którego CV zaczynamy?' : 'Which CV shall we start with?', exact: true })).toBeVisible();
      } else {
        await expect(page).toHaveURL(/\/register\?start=import&plan=free$/);
      }
      expect(api.calls.some(call => call.method === 'POST' && call.path.includes('/ai/'))).toBe(false);
    });
  }

  test(`credit links reveal the explanation without starting AI: ${language}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.goto('/');
    const links = page.getByRole('link', { name: language === 'pl' ? 'Jak działają kredyty AI?' : 'How do AI credits work?', exact: true });
    await expect(links).toHaveCount(3);
    await expect(page.locator('#cennik')).toContainText(language === 'pl' ? 'Sam zapis odpowiedzi jest bezpłatny' : 'Saving an answer is free');
    await links.last().click();
    await expect(page).toHaveURL(/\/help#kredyty-ai$/);
    const summary = page.locator('#kredyty-ai');
    await expect(summary).toBeFocused();
    await expect(summary.locator('..')).toHaveAttribute('open', '');
    await expect(summary.locator('..')).toContainText(language === 'pl' ? 'Nie ma stałej ceny całej rozmowy' : 'There is no fixed conversation price');
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).not.toHaveAttribute('open');
    await page.reload();
    await expect(summary.locator('..')).toHaveAttribute('open', '');
    expect(api.calls.some(call => call.method === 'POST' && call.path.includes('/ai/'))).toBe(false);
  });
}
