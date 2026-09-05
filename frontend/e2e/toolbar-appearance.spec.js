import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_ELEMENTS } from "./support/mockApi.js";

const extraElements = [
  { element_id: "contacts-anchor", category: "text", content: "", left: 0, top: 0,
    width: 0, height: 0, flowRole: "masthead-anchor", contactBandId: "contacts",
    contactBand: { id: "contacts", mode: "wrapping", order: ["email", "phone"] } },
  { element_id: "contact-email", category: "text", content: "email@example.com",
    left: 250, top: 140, width: 140, height: 16, fontSize: 10,
    contactBandId: "contacts", contactChannel: "email" },
  { element_id: "languages-heading", category: "text", content: "JĘZYKI",
    left: 250, top: 370, width: 280, height: 16, fontSize: 10, bold: true,
    flowRole: "section-chrome", editorSectionLayout: "grid", gridKind: "languages" },
  { element_id: "language-item", category: "textarea", content: "Polski · C2",
    left: 250, top: 400, width: 136, height: 18, fontSize: 10, lineHeight: 14,
    flowRole: "grid-member", flowGroup: "language-row", gridKind: "languages",
    editorGridEntry: true, editorSectionId: "languages-heading" },
].map((element) => ({ ...element, page: 1, extra_properties: { ...element } }));

async function visibleTextBox(locator) {
  return locator.evaluate((node) => {
    if (node.tagName === "TEXTAREA" || node.tagName === "INPUT") {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function hoverVisibleText(page, locator) {
  await locator.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
  const box = await visibleTextBox(locator);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function expectToolbarAboveText(toolbar, text) {
  await expect.poll(async () => {
    const [toolbarBox, textBox, viewportWidth] = await Promise.all([
      toolbar.locator(":scope > div").first().boundingBox(),
      visibleTextBox(text),
      text.evaluate(() => window.innerWidth),
    ]);
    return {
      alignedLeft: Math.abs(toolbarBox.x - textBox.x) < 0.5,
      fitsViewport: toolbarBox.x + toolbarBox.width <= viewportWidth,
      verticalGap: Math.round(textBox.y - toolbarBox.y - toolbarBox.height),
    };
  }).toEqual({ alignedLeft: true, fitsViewport: true, verticalGap: 24 });
}

// Compare computed appearance across both toolbar implementations. Screenshots
// capture the actual open form, including its canvas context and viewport fit.
for (const width of [390, 834, 1280, 1920]) {
  test(`canvas toolbar appearance and skill form at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page, { savedElements: [...SAVED_ELEMENTS, ...extraElements] });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    const checkControl = async (control, size, danger = false) => {
      await expect(control).toBeVisible();
      await control.hover();
      await expect(control).not.toHaveAttribute("title");
      expect(await control.evaluate((el) => getComputedStyle(el, "::after").backgroundColor)).toBe("rgb(103, 78, 62)");
      expect(await control.evaluate((el) => getComputedStyle(el, "::after").color)).toBe("rgb(255, 255, 255)");
      const appearance = await control.evaluate((el) => {
        const style = getComputedStyle(el);
        const shell = getComputedStyle(el.parentElement);
        return {
          size: el.getBoundingClientRect().height, radius: style.borderRadius,
          color: style.color, hover: style.backgroundColor,
          border: shell.borderColor, surface: shell.backgroundColor,
          shellRadius: shell.borderRadius,
        };
      });
      expect(appearance.size).toBeCloseTo(size, 0);
      expect(appearance).toMatchObject({
        radius: "0px", shellRadius: "0px", border: "rgb(201, 197, 188)",
        surface: "rgb(255, 255, 255)", hover: "rgb(236, 232, 223)",
        color: danger ? "rgb(180, 35, 24)" : "rgb(103, 78, 62)",
      });
    };

    // Authored single-line text has a zero-height baseline box for PDF parity.
    // Dispatch its normal hover event; measure/click the actual toolbar DOM.
    await page.locator("#skills-heading").scrollIntoViewIfNeeded();
    await page.locator("#skills-heading").dispatchEvent("pointerenter");
    const sectionHoverPlate = page.locator('[data-canvas-highlight-level="section"]');
    await expect(sectionHoverPlate).toBeVisible();
    const hoverAppearance = await sectionHoverPlate.evaluate((element) => {
      const plate = getComputedStyle(element, "::before");
      const pageCanvas = element.closest("[data-page-canvas]");
      const transform = new DOMMatrixReadOnly(getComputedStyle(pageCanvas).transform);
      return {
        screenPadding: Math.abs(parseFloat(plate.top)) * transform.a,
        screenRadius: parseFloat(plate.borderTopLeftRadius) * transform.a,
        background: plate.backgroundColor,
        pointerEvents: plate.pointerEvents,
      };
    });
    expect(hoverAppearance.screenPadding).toBeCloseTo(4, 1);
    expect(hoverAppearance.screenRadius).toBeCloseTo(2, 1);
    expect(hoverAppearance.background).toBe("rgba(0, 0, 0, 0)");
    expect(hoverAppearance.pointerEvents).toBe("none");
    const sectionToolbar = page.locator('[data-canvas-toolbar-key="heading:skills-heading"]');
    await checkControl(sectionToolbar.getByRole("button").first(), 28.8);
    await expectToolbarAboveText(sectionToolbar, page.locator("#skills-heading"));
    await expect(sectionToolbar.getByRole("button", { name: "AI dla wybranego zakresu" })).toBeVisible();
    await page.locator("#skills-tools-title").hover();
    const recordToolbar = page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]');
    await checkControl(recordToolbar.getByRole("button").first(), 28.8);
    await expectToolbarAboveText(recordToolbar, page.locator("#skills-tools-title"));
    await expect(recordToolbar.getByRole("button", { name: "AI dla wybranego zakresu" })).toBeVisible();
    await hoverVisibleText(page, page.locator("#contact-email"));
    const deleteContact = page.getByRole("button", { name: /Usuń kontakt:/ });
    await checkControl(deleteContact, 24, true);
    const [contactBox, deleteSurfaceBox] = await Promise.all([
      visibleTextBox(page.locator("#contact-email")),
      deleteContact.locator("..").boundingBox(),
    ]);
    expect(deleteSurfaceBox.y - contactBox.y - contactBox.height).toBeCloseTo(8, 0);
    await hoverVisibleText(page, page.locator("#contact-email"));
    await checkControl(page.getByRole("button", { name: "Dodaj kontakt", exact: true }), 24);
    await page.locator("#language-item").hover();
    await checkControl(page.locator('[data-canvas-toolbar-key="grid-entry:language-item"] button').first(), 24);
    await expect(page.locator('[data-canvas-toolbar-key="grid-entry:language-item"] button')).toHaveCount(2);

    const body = page.locator("#skills-tools-body");
    await body.focus();
    await body.press("Shift+F10");
    const toolbar = page.locator('[data-canvas-toolbar-key="skills-entry:skills-heading:skills-tools"]');
    const add = toolbar.getByRole("button", { name: /Dodaj umiejętność do kategorii/ });
    await expect(add).toBeFocused();
    await expect(toolbar.getByRole("button")).toHaveCount(1);
    await checkControl(add, 24);
    await add.press("Enter");
    const input = toolbar.getByRole("textbox", { name: "Dodaj umiejętność" });
    await expect(input).toBeFocused();
    const submit = toolbar.getByRole("button", { name: "Dodaj umiejętność", exact: true });
    await expect(submit).toBeDisabled();
    const form = toolbar.locator("form");
    await expect.poll(async () => {
      const box = await form.boundingBox();
      return box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 1000;
    }).toBe(true);
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
    expect(await input.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Arial");
    await input.fill("figma");
    await input.press("Enter");
    await expect(toolbar.getByRole("alert")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await input.fill("Analiza danych");
    await expect(toolbar.getByRole("alert")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("skills-form.png") });
    await input.press("Escape");
    await expect(add).toBeFocused();
    await add.press("Enter");
    await input.fill("Analiza danych");
    await input.press("Enter");
    await expect(body).toContainText("Analiza danych");
    api.assertHermetic();
  });
}

test("toolbar geometry and menu text stay constant through animated canvas zoom", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const api = await installMockApi(page, { savedElements: [...SAVED_ELEMENTS, ...extraElements] });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  await page.locator("#skills-heading").dispatchEvent("pointerenter");
  const toolbar = page.locator('[data-canvas-toolbar-key="heading:skills-heading"]');
  const more = toolbar.getByRole("button", { name: "Więcej działań" });
  await more.click();
  await expect(toolbar.getByRole("menu")).toBeVisible();
  // The synthetic zoom buttons below do not move a real pointer. Park the
  // pointer over application chrome so an animated page cannot slide another
  // authored hover target underneath it and legitimately claim the toolbar.
  await page.mouse.move(1, 1);

  for (const targetZoom of [100, 50, 200, 300, 160]) {
    // Native clicks avoid pointer movement away from the pinned toolbar. Sample
    // every animation frame: final-state checks miss transient rescaling.
    const samples = await page.evaluate(async (target) => {
      const canvas = document.querySelector("[data-page-canvas]");
      const current = Math.round(Number(canvas.style.transform.match(/scale\(([^)]+)\)/)[1]) * 100);
      const button = document.querySelector(`[aria-label="${target > current ? "Powiększ" : "Pomniejsz"}"]`);
      for (let step = 0; step < Math.abs(target - current) / 10; step += 1) button.click();
      const values = [];
      const started = performance.now();
      while (performance.now() - started < 400) {
        await new Promise(requestAnimationFrame);
        const root = document.querySelector('[data-canvas-toolbar-key="heading:skills-heading"]');
        const control = root?.querySelector("button");
        if (!control) throw new Error("The pinned toolbar disappeared during zoom");
        const icon = control.querySelector("svg");
        const menu = root.querySelector('[role="menuitem"]');
        values.push({
          height: control.getBoundingClientRect().height,
          width: control.getBoundingClientRect().width,
          icon: icon.getBoundingClientRect().width,
          font: getComputedStyle(control).fontSize,
          menuFont: getComputedStyle(menu).fontSize,
          menuWeight: getComputedStyle(menu).fontWeight,
        });
      }
      return values;
    }, targetZoom);
    expect(samples.length).toBeGreaterThan(2);
    for (const sample of samples) {
      expect(sample.height).toBeCloseTo(28.8, 1);
      expect(sample.width).toBeCloseTo(60.8, 1);
      expect(sample.icon).toBeCloseTo(12, 1);
      expect(sample.font).toBe("12px");
      expect(sample.menuFont).toBe("12px");
      expect(sample.menuWeight).toBe("400");
    }
  }

  for (const trigger of [more, toolbar.getByRole("button", { name: "AI dla wybranego zakresu" })]) {
    await toolbar.getByRole("menuitem").first().press("Escape");
    await expect(more).toBeFocused();
    await trigger.press("Enter");
    const items = toolbar.getByRole("menuitem");
    await expect(items.first()).toBeFocused();
    await items.first().press("End");
    await expect(items.last()).toBeFocused();
    for (const item of await items.all()) {
      expect(await item.evaluate((el) => getComputedStyle(el).fontSize)).toBe("12px");
      expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(36);
    }
    const box = await toolbar.getByRole("menu").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(box.y + box.height).toBeLessThanOrEqual(1000);
  }
  await page.screenshot({ path: testInfo.outputPath("toolbar-ai-menu.png") });
  await toolbar.getByRole("menuitem").first().press("Escape");
  await expect(toolbar.getByRole("button", { name: "AI dla wybranego zakresu" })).toBeFocused();
  api.assertHermetic();
});
