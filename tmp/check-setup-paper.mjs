import { chromium, expect } from '../frontend/node_modules/@playwright/test/index.mjs';
import { installMockApi } from '../frontend/e2e/support/mockApi.js';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  await installMockApi(page);
  await page.goto('http://127.0.0.1:4173/cvstudio/guest?start=new');
  const dialog = page.getByRole('dialog', { name: 'Skonfiguruj nowe CV' });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const surface = await dialog.evaluate(node => {
    const templates = node.querySelector('section');
    const footer = node.lastElementChild;
    const close = node.querySelector('button[aria-label^="Zamknij"]');
    return { templates: getComputedStyle(templates).backgroundColor,
      footer: getComputedStyle(footer).backgroundColor,
      close: getComputedStyle(close).backgroundColor,
      backdrop: getComputedStyle(node.parentElement).backgroundColor };
  });
  for (const key of ['templates', 'footer', 'close']) assert.equal(surface[key], 'rgb(255, 255, 255)');
  console.log(surface);
  await dialog.getByRole('radio', { name: /Linden/ }).click();
  await expect(dialog.getByRole('radio', { name: /Linden/ })).toBeChecked();
  await dialog.getByRole('radio', { name: /Meridian/ }).click();
  await expect(dialog.getByRole('checkbox', { name: /Zdjęcie/ })).toBeDisabled();
  await page.mouse.move(10, 10);
  await page.screenshot({ path: '../tmp/setup-paper-desktop.png' });
  const title = dialog.getByRole('textbox', { name: 'Własna sekcja' });
  await title.fill('Podsumowanie');
  await dialog.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Sekcja o tej nazwie już istnieje.');
  await title.fill('Konferencje');
  await dialog.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Konferencje' })).toBeChecked();
  for (const width of [390, 834, 1366, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(dialog).toBeVisible();
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `Dialog overflow at ${width}px`);
    if (width === 390) await page.screenshot({ path: '../tmp/setup-paper-mobile.png' });
  }
  await page.setViewportSize({ width: 683, height: 450 });
  await expect(dialog.getByRole('button', { name: 'Utwórz A4', exact: true })).toBeInViewport();
  const cancel = dialog.getByRole('button', { name: 'Anuluj', exact: true });
  await cancel.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Utwórz A4', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: /^Zamknij/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  console.log('White surfaces, selections, disabled photo, validation, keyboard trap and responsive bounds verified.');
} finally { await browser.close(); }
