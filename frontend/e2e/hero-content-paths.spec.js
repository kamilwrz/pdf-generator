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
      // The first Tab bypasses the shared navigation and reaches the named
      // template start. Plan names are available without opening each preview.
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: language === 'pl' ? 'Przejdź do treści' : 'Skip to content', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      await page.keyboard.press('Tab');
      const templateName = name => language === 'pl' ? `Zacznij z szablonem ${name}` : `Start with the ${name} template`;
      const hero = page.locator('#top');
      await expect(hero.getByRole('link', { name: templateName('Linden'), exact: true }).first()).toBeFocused();
      await hero.getByRole('radio', { name: 'Linden', exact: true }).focus();
      await page.keyboard.press('ArrowLeft');
      const starts = hero.getByRole('link', { name: templateName('Meridian'), exact: true });
      await expect(starts).toHaveCount(width < 768 ? 2 : 1);
      for (const start of await starts.all()) await expect(start).toHaveAttribute('href', '/cvstudio/guest?start=new&template=meridian');
      const gallery = page.locator('#landing-template-gallery');
      for (const name of ['Sterling', 'Meridian', 'Linden']) await expect(gallery.getByRole('link', { name: `${name} Free`, exact: true })).toHaveCount(1);
      for (const name of ['Monument', 'Slate', 'Aurelia', 'Regent', 'Cadenza', 'Vellum', 'Atrium']) await expect(gallery.getByRole('link', { name: `${name} Pro`, exact: true })).toHaveCount(1);
      const paths = page.locator('#top nav');
      const links = paths.getByRole('link');
      await expect(links).toHaveCount(2);
      await expect(links.nth(0)).toHaveAttribute('href', '#wywiad');
      await expect(links.nth(1)).toHaveAttribute('href', '#dopasowanie');
      for (const enlarged of [false, true]) {
        if (enlarged) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        const first = await links.nth(0).boundingBox();
        const second = await links.nth(1).boundingBox();
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
        expect(second.x).toBeCloseTo(first.x, 0);
        expect(first.height).toBeGreaterThanOrEqual(44);
        expect(first.x + first.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await links.nth(0).focus();
      await expect(links.nth(0)).toBeFocused();
      expect(await links.nth(0).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
      await page.keyboard.press('Tab');
      await expect(links.nth(1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#dopasowanie$/);
      await page.goto('/');
      await paths.scrollIntoViewIfNeeded();
      await paths.screenshot({ path: `test-results/hero-content-paths-${language}-${width}.png` });
      await links.nth(0).click();
      await expect(page).toHaveURL(/#wywiad$/);
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
