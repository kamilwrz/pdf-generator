import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

for (const style of ["W linii", "Lista", "Pigułka z wypełnieniem", "Pigułka bez wypełnienia",
  "Prostokąt z wypełnieniem", "Prostokąt bez wypełnienia", "Zaokrąglony bez wypełnienia",
  "Zaokrąglony z wypełnieniem", "Kreska na dole"]) {
  test(`deletes one skill and restores it with undo: ${style}`, async ({ page, isMobile }) => {
    const api = await installMockApi(page);
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    if (style !== "W linii") {
      await page.locator("#skills-heading").dispatchEvent("pointerenter");
      await page.getByRole("button", { name: /^Styl umiejętności:/ }).click();
      const dialog = page.getByRole("dialog", { name: "Styl umiejętności" });
      if (style === "Lista") await dialog.getByRole("button", { name: /^Lista/ }).click();
      else {
        await dialog.getByRole("group", { name: "Wariant chipsów" })
          .getByRole("button", { name: new RegExp(style) }).click();
        await dialog.getByRole("button", { name: /^Chipsy/ }).click();
      }
    }
    // Find a real glyph range so pointer targeting also exercises split styled
    // spans, bullet rows and the zero-height text node used by chip labels.
    const target = page.locator('[id]').filter({ hasText: /^(?:•\s*)?Figma/ }).last();
    await target.scrollIntoViewIfNeeded();
    const point = await target.evaluate((node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const start = text.textContent.indexOf("Figma");
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + 5);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      throw new Error("Skill glyphs missing");
    });
    if (isMobile) {
      // Touch devices expose the same action through focus and the context
      // shortcut; no synthetic mouse hover is required on a touch-only screen.
      await target.focus();
      await page.keyboard.press("Shift+F10");
    } else await page.mouse.move(point.x, point.y);
    const trash = page.getByRole("button", { name: "Usuń umiejętność: Figma", exact: true });
    await expect(trash).toBeVisible();
    const box = await trash.boundingBox();
    expect(box.width).toBeCloseTo(24, 0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    await trash.click();
    await expect(page.locator('[id]').filter({ hasText: /^(?:•\s*)?Figma/ }).last()).toHaveCount(0);
    const toast = page.getByRole("status").filter({ hasText: "Usunięto umiejętność „Figma”" });
    await expect(toast).toBeVisible();
    await expect(page.getByText("Narzędzia", { exact: true })).toHaveCount(1);
    await toast.getByRole("button", { name: "Cofnij" }).click();
    await expect(page.locator('[id]').filter({ hasText: /^(?:•\s*)?Figma/ }).last()).toHaveCount(1);
    api.assertHermetic();
  });
}

for (const width of [390, 834, 1280, 1920]) {
  test(`keyboard deletion keeps the last skill addable and saves cleanly at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    const body = page.locator("#skills-tools-body");
    await body.focus();
    await page.keyboard.press("Shift+F10");
    await page.keyboard.press("ArrowRight");
    const trash = page.getByRole("button", { name: "Usuń umiejętność: Miro", exact: true });
    await expect(trash).toBeVisible();
    await trash.focus();
    await page.screenshot({ path: `../tmp/skills-delete-${width}.png` });
    await page.keyboard.press("Enter");
    await expect(body).toHaveText("Figma");
    await expect(body).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("button", { name: "Usuń umiejętność: Figma", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(body).toHaveText("");
    await page.keyboard.press("Shift+F10");
    await page.getByRole("button", { name: "Dodaj umiejętność do kategorii Narzędzia" }).click();
    await page.getByRole("textbox", { name: "Dodaj umiejętność" }).fill("Nowa");
    await page.getByRole("button", { name: "Dodaj umiejętność", exact: true }).click();
    await expect(body).toHaveText("Nowa");
    const savedRequest = page.waitForRequest((request) => request.method() === "PUT"
      && new URL(request.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const payload = (await savedRequest).postDataJSON();
    expect(JSON.stringify(payload)).toContain("Nowa");
    expect(JSON.stringify(payload)).not.toContain("Usuń umiejętność");
    expect(JSON.stringify(payload)).not.toContain("itemTargets");
    api.assertHermetic();
  });
}

test("deletes the hovered second skill while its shared field is being edited", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await installMockApi(page);
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  const body = page.locator("#skills-tools-body");
  await body.focus();
  await page.keyboard.press("Enter");
  await expect(body).toHaveAttribute("contenteditable", "true");
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText("Pierwsza  ·  Druga");
  await expect(body).toHaveText("Pierwsza  ·  Druga");
  await body.scrollIntoViewIfNeeded();
  const point = await body.evaluate((node) => {
    const text = node.firstChild;
    const start = text.textContent.indexOf("Druga");
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + 5);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.getByRole("button", { name: "Usuń umiejętność: Druga", exact: true }).click();
  await expect(body).toHaveText("Pierwsza");
  await page.getByRole("status").filter({ hasText: "Usunięto umiejętność „Druga”" })
    .getByRole("button", { name: "Cofnij" }).click();
  await expect(body).toHaveText("Pierwsza  ·  Druga");
  api.assertHermetic();
});
