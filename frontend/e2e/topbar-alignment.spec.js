import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

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
    // New-CV entry focuses the name and may auto-zoom; establish the actual
    // 100% reference before checking the fixed header against page geometry.
    const zoom = page.locator('[data-anchor="topbar-zoom"]');
    while ((await zoom.innerText()).trim() !== "100%") {
      const value = parseInt(await zoom.innerText(), 10);
      await page.getByRole("button", { name: value > 100 ? "Pomniejsz" : "Powiększ", exact: true }).click();
    }
    const geometry = await group.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const canvas = document.querySelector(".canvas-area");
      const viewport = canvas.getBoundingClientRect();
      const a4 = document.querySelector(".page-canvas").getBoundingClientRect();
      const header = element.closest("header");
      const rail = header.querySelector('[data-anchor="topbar-canvas-controls"]');
      const groups = [...header.children].map((child) => child.getBoundingClientRect());
      const railGroups = [...rail.children].map((child) => child.getBoundingClientRect());
      const overlaps = (rects) => rects.some((a, i) => rects.some((b, j) => i !== j && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
      const history = header.querySelector('[aria-label="Historia zmian"]').getBoundingClientRect();
      const view = header.querySelector('[aria-label="Widok dokumentu"]').getBoundingClientRect();
      return {
        center: box.x + box.width / 2,
        canvasCenter: viewport.x + canvas.clientWidth / 2,
        pageCenter: a4.x + a4.width / 2,
        pageFits: a4.width <= canvas.clientWidth,
        overflow: header.scrollWidth > header.clientWidth,
        overlaps: overlaps(groups) || overlaps(railGroups),
        historyLeft: history.left,
        pageLeft: a4.left,
        pageRight: a4.right,
        viewLeft: view.left,
        viewRight: view.right,
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.overlaps).toBe(false);
    expect(Math.abs(geometry.center - geometry.canvasCenter)).toBeLessThanOrEqual(1);
    if (geometry.pageFits) {
      expect(Math.abs(geometry.center - geometry.pageCenter)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.historyLeft - geometry.pageLeft)).toBeLessThanOrEqual(1);
      expect(geometry.viewLeft).toBeGreaterThanOrEqual(geometry.pageLeft);
      expect(geometry.viewRight).toBeLessThanOrEqual(geometry.pageRight + 1);
    }
    const fixedControls = page.locator('[data-anchor="topbar-canvas-controls"]');
    const positions = () => fixedControls.evaluate((rail) => [...rail.children].map((child) => {
      const { x, y, width, height } = child.getBoundingClientRect();
      return { x, y, width, height };
    }));
    const beforeZoom = await positions();
    await page.getByRole("button", { name: "Powiększ", exact: true }).click();
    await expect(zoom).toHaveText("110%");
    expect(await positions()).toEqual(beforeZoom);
    await page.getByRole("button", { name: "Pomniejsz", exact: true }).click();
    expect(await positions()).toEqual(beforeZoom);
    const output = page.getByRole("group", { name: "Operacje dokumentu" });
    const order = await output.locator('button,input').evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")));
    expect(order).toEqual(["Wyczyść zawartość CV", "Nazwa bieżącego dokumentu", "Zmień nazwę dokumentu", "Zapisz dokument", "Pobierz PDF"]);
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


test("renaming and saving use the relocated field; spread keeps rail positions", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await installMockApi(page, {
    savedDocument: { ...SAVED_DOCUMENT, editor_mode: "freeform" },
  });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  const name = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
  await page.getByRole("button", { name: "Zmień nazwę dokumentu" }).click();
  await expect(name).toBeFocused();
  await name.fill("Nowa nazwa CV");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Zapisz dokument", exact: true })).toBeFocused();
  const updateRequest = page.waitForRequest((request) => request.method() === "PUT" && request.url().endsWith("/api/pdf/update_pdf"));
  await page.keyboard.press("Enter");
  expect((await updateRequest).postDataJSON()).toMatchObject({ pdf_title: "Nowa nazwa CV.pdf" });
  await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dodaj stronę", exact: true }).click();
  await expect(page.getByRole("button", { name: "Włącz widok dwóch stron", exact: true })).toBeEnabled();
  const rail = page.locator('[data-anchor="topbar-canvas-controls"]');
  const before = await rail.boundingBox();
  const spread = page.getByRole("button", { name: "Włącz widok dwóch stron", exact: true });
  await spread.click();
  await expect(page.getByRole("button", { name: "Wyłącz widok dwóch stron", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Powiększ", exact: true })).toBeDisabled();
  expect(await rail.boundingBox()).toEqual(before);
  await page.getByRole("button", { name: "Wyłącz widok dwóch stron", exact: true }).click();
  expect(await rail.boundingBox()).toEqual(before);
  api.assertHermetic();
});
