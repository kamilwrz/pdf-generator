import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mockApi.js";

for (const width of [390, 834, 960, 1280, 1366, 1920]) {
  test(`template navigation stays centered and reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await page.goto("/cvstudio/guest?start=new");
    await page.getByRole("button", { name: "Utwórz A4", exact: true }).click();
    const group = page.getByRole("group", { name: "Szablon CV", exact: true });
    const change = group.getByRole("button", { name: "Zmień szablon", exact: true });
    await expect(change).toBeEnabled();
    const geometry = await group.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const canvas = document.querySelector(".canvas-area");
      const viewport = canvas.getBoundingClientRect();
      const a4 = document.querySelector(".page-canvas").getBoundingClientRect();
      const header = element.closest("header");
      const groups = [...header.children].map((child) => child.getBoundingClientRect());
      return {
        center: box.x + box.width / 2,
        canvasCenter: viewport.x + canvas.clientWidth / 2,
        pageCenter: a4.x + a4.width / 2,
        pageFits: a4.width <= canvas.clientWidth,
        overflow: header.scrollWidth > header.clientWidth,
        overlaps: groups.some((a, i) => groups.some((b, j) => i !== j && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)),
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.overlaps).toBe(false);
    expect(Math.abs(geometry.center - geometry.canvasCenter)).toBeLessThanOrEqual(1);
    if (geometry.pageFits) expect(Math.abs(geometry.center - geometry.pageCenter)).toBeLessThanOrEqual(1);
    await change.focus();
    await expect(change).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(change).toBeFocused();
    await page.screenshot({ path: `test-results/topbar-${width}.png` });
    api.assertHermetic();
  });
}
