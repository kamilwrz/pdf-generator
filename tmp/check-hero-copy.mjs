import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#top h1').waitFor();
  assert.equal(await page.locator('#top h1').innerText(), 'Stwórz CV gotowe do wysłania w kilka minut.');
  for (const width of [320, 390, 834, 1366, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const fits = await page.locator('#top').evaluate((hero) => {
      const nodes = [hero.querySelector('h1'), hero.querySelector('h1 + p')];
      return document.documentElement.scrollWidth <= window.innerWidth
        && nodes.every((node) => node.scrollWidth <= node.clientWidth + 1
          && node.getBoundingClientRect().left >= 0
          && node.getBoundingClientRect().right <= window.innerWidth);
    });
    if (!fits) console.log(await page.locator("#top").evaluate(hero => ({viewport: innerWidth, scroll: document.documentElement.scrollWidth, nodes: [...hero.querySelectorAll("h1, h1 + p")].map(n => ({width: n.clientWidth, scroll: n.scrollWidth, box: n.getBoundingClientRect().toJSON()}))})));
    if (width === 390 || width === 1366) await page.locator('#top').screenshot({ path: `../tmp/hero-copy-${width}.png` });
  }
  await page.setViewportSize({ width: 683, height: 600 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Enlarged text must wrap without horizontal overflow');
  console.log('Hero copy fits 320/390/834/1366/1920px and enlarged text.');
} finally {
  await browser.close();
}
