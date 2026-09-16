import { test, expect } from '@playwright/test';
import { installMockApi } from './support/mockApi.js';

for (const language of ['pl', 'en']) for (const width of [390, 834, 1280, 1920]) {
  test(`landing shares section edges and column alignment: ${language} ${width}`, async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(lang => localStorage.setItem('cvstudio.uiLanguage', lang), language);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const sections = page.locator('main > section');
    await expect(sections).toHaveCount(8);
    const metrics = await sections.evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { x: rect.x, width: rect.width, gutter: style.paddingLeft, top: style.paddingTop, bottom: style.paddingBottom };
    }));
    expect(metrics).toHaveLength(8);
    for (const metric of metrics) expect(metric).toEqual(metrics[0]);
    if (width > 1024) {
      const interview = page.locator('#wywiad');
      const tailoring = page.locator('#dopasowanie');
      const interviewCopy = await interview.locator(':scope > div').boundingBox();
      const interviewDemo = await interview.locator('figure').boundingBox();
      const tailoringCopy = await tailoring.locator(':scope > div').boundingBox();
      const tailoringDemo = await tailoring.locator('figure').boundingBox();
      expect(Math.abs(interviewCopy.width - interviewDemo.width)).toBeLessThan(1);
      expect(Math.abs(interviewDemo.x - tailoringCopy.x)).toBeLessThan(1);
      expect(Math.abs(interviewCopy.x - tailoringDemo.x)).toBeLessThan(1);
      expect(Math.abs(interviewCopy.y - interviewDemo.y)).toBeLessThan(1);
      expect(Math.abs(tailoringCopy.y - tailoringDemo.y)).toBeLessThan(1);
      const priceCard = await page.locator('#cennik article').first().boundingBox();
      expect(Math.abs(priceCard.x - interviewCopy.x)).toBeLessThan(1);
      expect(Math.abs(priceCard.width - interviewCopy.width)).toBeLessThan(1);
    }
    // Exercise the complete lower page rather than only the first feature pair.
    const faq = page.locator('main > section').nth(6);
    await faq.locator('summary').last().focus();
    await page.keyboard.press('Enter');
    await expect(faq.locator('details').last()).toHaveAttribute('open', '');
    await page.screenshot({ path: `test-results/landing-grid-${language}-${width}.png`, fullPage: true });
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(faq.locator('summary').last()).toBeFocused();
  });
}
