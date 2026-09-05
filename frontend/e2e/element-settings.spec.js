import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT, SAVED_ELEMENTS } from "./support/mockApi.js";

// Screenshots cover this visual contract without recording redundant videos.
test.use({ video: "off", trace: "off" });

test("record actions and settings never overlap the cog or edited field at 280%", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 864 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await installMockApi(page, {
    // A left-aligned single-column record reproduces the user's screenshot:
    // insufficient room for the old fixed-width inspector on the left.
    savedElements: SAVED_ELEMENTS.map((element) => ({ ...element, left: 80 })),
  });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  const field = page.locator("#skills-tools-title");
  await field.click();
  await field.dispatchEvent("pointerenter");
  const record = page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]');
  await expect(record.getByRole("button").first()).toBeVisible();
  const cog = page.getByRole("button", { name: /Otwórz parametry elementu:/ });
  // Portal anchors are intentionally zero-size. Compare actual button boxes,
  // not elementFromPoint after the hover toolbar has already disappeared.
  await expect.poll(async () => {
    const cogBox = await cog.boundingBox();
    const buttons = await record.getByRole("button").all();
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box && cogBox && box.x < cogBox.x + cogBox.width && box.x + box.width > cogBox.x
        && box.y < cogBox.y + cogBox.height && box.y + box.height > cogBox.y) return false;
    }
    return true;
  }).toBe(true);
  await cog.click();
  const panel = page.getByRole("dialog", { name: "Ustawienia · Pole tekstowe" });
  await expect(panel).toBeVisible();
  const isClear = async () => {
    const a = await field.boundingBox();
    const b = await panel.boundingBox();
    return a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x
      || a.y + a.height <= b.y || b.y + b.height <= a.y);
  };
  await expect.poll(isClear).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("record-settings-clear.png") });
  await field.hover();
  await page.mouse.wheel(0, 160);
  await expect.poll(isClear).toBe(true);
  await expect(field).toHaveAttribute("contenteditable", "true");
  await panel.getByRole("button", { name: "Zamknij ustawienia elementu" }).click();
  api.assertHermetic();
});

for (const width of [390, 834, 1280, 1920]) {
  test(`element settings follow selection and preserve editing at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
    const field = page.locator("#skills-tools-body");
    await field.click();
    const cog = page.getByRole("button", { name: /Otwórz parametry elementu:/ });
    await expect(cog).toBeVisible();
    await expect(page.locator('[data-editor-inspector-state="open"]')).toHaveCount(0);
    const geometry = () => field.boundingBox();
    const before = await geometry();
    const cogBox = await cog.boundingBox();
    expect(cogBox.width).toBe(36);
    expect(cogBox.height).toBe(36);
    // At a clipped left edge, the cog is pinned inside the visible canvas.
    if (before.x > 108) expect(cogBox.x + 36).toBeCloseTo(before.x - 8, 0);
    await cog.click();
    const panel = page.getByRole("dialog", { name: "Ustawienia · Pole tekstowe" });
    await expect(panel).toBeVisible();
    await expect(field).toHaveAttribute("contenteditable", "true");
    await expect(panel.getByRole("group", { name: "Typografia", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Pogrubienie", exact: true })).toBeVisible();
    await expect(panel.getByRole("spinbutton", { name: "Odstęp między wierszami" })).toBeVisible();
    const after = await geometry();
    expect(after.width).toEqual(before.width);
    expect(after.height).toEqual(before.height);
    if (width > 720) expect(after).toEqual(before);
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(1000);
    if (width <= 720) expect(after.y + after.height).toBeLessThan(box.y);
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`) });
    await panel.getByRole("spinbutton", { name: "Odstęp między wierszami" }).focus();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(cog).toBeFocused();
    await cog.press("Enter");
    await expect(panel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel.getByRole("button", { name: "Zamknij ustawienia elementu" })).toBeFocused();
    await panel.getByRole("button", { name: "Zamknij ustawienia elementu" }).click();
    await expect(cog).toBeFocused();
    await page.locator("#skills-technologies-body").click();
    await expect(page.locator('[data-editor-inspector-state="open"]')).toHaveCount(0);
    await page.locator("#skills-tools-title").click();
    await expect(cog).toBeVisible();
    await expect.poll(() => cog.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    api.assertHermetic();
  });
}

test("freeform shape keeps geometry, colour, position, layer and actions", async ({ page }) => {
  const document = { ...SAVED_DOCUMENT, editor_mode: "freeform", template_id: null };
  const api = await installMockApi(page, {
    documents: [document], savedDocument: document,
    savedElements: [{
      element_id: "settings-rectangle", category: "rectangle", page: 1,
      left: 250, top: 150, width: 120, height: 100,
      backgroundColor: "#674E3E", filled: true, borderRadius: 0,
      extra_properties: { filled: true, borderRadius: 0 },
    }, {
      element_id: "settings-second-rectangle", category: "rectangle", page: 1,
      left: 250, top: 300, width: 100, height: 80,
      backgroundColor: "#674E3E", filled: true,
      extra_properties: { filled: true },
    }],
  });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  await page.locator("#settings-rectangle").click();
  await page.getByRole("button", { name: /Otwórz parametry elementu:/ }).click();
  const panel = page.getByRole("dialog", { name: "Ustawienia · Prostokąt" });
  await expect(panel.getByRole("spinbutton", { name: "Szerokość", exact: true })).toBeVisible();
  await expect(panel.getByRole("spinbutton", { name: "Wysokość", exact: true })).toBeVisible();
  await expect(panel.getByRole("spinbutton", { name: "Od lewej krawędzi" })).toHaveCount(1);
  await expect(panel.getByRole("spinbutton", { name: "Kolejność na stronie" })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Duplikuj", exact: true })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Usuń", exact: true })).toHaveCount(1);
  await panel.getByRole("spinbutton", { name: "Szerokość", exact: true }).fill("150");
  await expect(panel.getByRole("spinbutton", { name: "Szerokość", exact: true })).toHaveValue("150");
  await panel.getByRole("button", { name: "Zamknij ustawienia elementu" }).click();
  await page.locator("#settings-second-rectangle").click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: /Otwórz parametry elementu:/ }).click();
  const bulk = page.getByRole("dialog", { name: "Ustawienia · 2 elementy" });
  await expect(bulk).toBeVisible();
  await expect(bulk.getByRole("button", { name: "Duplikuj zaznaczone (2)" })).toHaveCount(1);
  await expect(bulk.getByRole("spinbutton", { name: "Przesuń w bok" })).toHaveCount(1);
  api.assertHermetic();
});

test("settings remain usable in a 200-percent-equivalent compact viewport", async ({ page }) => {
  // 1280 × 1000 at browser zoom 200% has a 640 × 500 CSS-pixel layout.
  await page.setViewportSize({ width: 640, height: 500 });
  const api = await installMockApi(page);
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  await page.locator("#skills-tools-body").click();
  await page.getByRole("button", { name: /Otwórz parametry elementu:/ }).click();
  const panel = page.getByRole("dialog", { name: "Ustawienia · Pole tekstowe" });
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox()).height).toBeLessThanOrEqual(230);
  const spacing = panel.getByRole("spinbutton", { name: "Odstęp między wierszami" });
  await spacing.scrollIntoViewIfNeeded();
  await spacing.focus();
  await expect(spacing).toBeFocused();
  expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  api.assertHermetic();
});
