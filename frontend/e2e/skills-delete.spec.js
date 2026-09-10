import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_ELEMENTS } from "./support/mockApi.js";

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
    const add = page.getByRole("button", { name: "Dodaj umiejętność do kategorii Narzędzia" });
    await expect(add.locator("..").getByRole("button", { name: /^Usuń umiejętność:/ })).toHaveCount(0);
    if (!isMobile) {
      // Move through real intermediate pointer coordinates. The button must
      // remain on this skill, not jump to the adjacent item during approach.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      await expect(trash).toBeVisible();
      const approached = await trash.boundingBox();
      expect(approached.x).toBeCloseTo(box.x, 1);
      expect(approached.y).toBeCloseTo(box.y, 1);
    }
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

test("trash stays on the entered fragment of a wrapped skill during pointer approach", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 950 });
  const skill = "Screening (PEP, Sanctions, Adverse Media) and international transaction monitoring";
  const content = `AML  ·  ${skill}  ·  SQL  ·  LexisNexis`;
  const api = await installMockApi(page, { savedElements: SAVED_ELEMENTS.map((element) => (
    element.element_id === "skills-tools-body" ? { ...element, content, width: 180 } : element
  )) });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  const body = page.locator("#skills-tools-body");
  await body.scrollIntoViewIfNeeded();
  const fragments = await body.evaluate((node, label) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    const start = text.textContent.indexOf(label);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + label.length);
    return [...range.getClientRects()].map((rect) => rect.toJSON());
  }, skill);
  expect(fragments.length).toBeGreaterThan(1);
  const fragment = fragments[1];
  await page.mouse.move(fragment.left + 2, (fragment.top + fragment.bottom) / 2);
  const trash = page.getByRole("button", { name: `Usuń umiejętność: ${skill}`, exact: true });
  await expect(trash).toBeVisible();
  const box = await trash.boundingBox();
  expect(box.x + box.width).toBeCloseTo(fragment.right, 1);
  expect(box.y + box.height / 2).toBeCloseTo((fragment.top + fragment.bottom) / 2, 1);
  await page.mouse.move(box.x + 12, box.y + 12, { steps: 16 });
  const approached = await trash.boundingBox();
  expect(approached.x).toBeCloseTo(box.x, 1);
  expect(approached.y).toBeCloseTo(box.y, 1);
  await page.screenshot({ path: "../tmp/skill-trash-wrapped.png" });
  await trash.click();
  await expect(body).toHaveText("AML  ·  SQL  ·  LexisNexis");
  api.assertHermetic();
});
