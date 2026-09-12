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

// Sample the actual controls through zoom transitions, including reversals.
// Page-local buttons and body portals must both grow without a transient dip.
for (const kind of ["contacts", "skills", "languages", "settings"]) {
  test(`${kind} controls follow toolbar growth during animated zoom`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const api = await installMockApi(page, { savedElements: [...SAVED_ELEMENTS, ...extraElements] });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    let selector;
    if (kind === "contacts") {
      await hoverVisibleText(page, page.locator("#contact-email"));
      selector = '[aria-label="Dodaj kontakt"], [aria-label^="Usuń kontakt:"]';
    } else if (kind === "skills") {
      await page.locator("#skills-tools-body").focus();
      await page.locator("#skills-tools-body").press("Shift+F10");
      selector = '[data-canvas-toolbar-key="skills-entry:skills-heading:skills-tools"] button';
    } else if (kind === "languages") {
      await page.locator("#language-item").focus();
      await page.locator("#language-item").press("Shift+F10");
      selector = '[data-canvas-toolbar-key="grid-entry:language-item"] button';
    } else {
      await page.locator("#skills-tools-title").click();
      selector = '[data-editor-control="element-settings"] > button';
    }
    await expect(page.locator(selector).first()).toBeVisible();
    await page.mouse.move(1, 1);
    const baseline = 36;
    const expected = (zoom) => baseline * (kind === "settings"
      ? (2 + zoom / 140) / 3 : Math.max(1, (2 + zoom / 140) / 3));
    let previous = kind === "settings" ? 280 : 140;
    await expect.poll(async () => (await page.locator(selector).first().boundingBox()).height)
      .toBeCloseTo(expected(previous), 0);

    for (const target of kind === "settings" ? [140, 280, 160] : [280, 140, 200]) {
      const samples = await page.evaluate(async ({ target, selector }) => {
        const canvas = document.querySelector("[data-page-canvas]");
        const current = Math.round(Number(canvas.style.transform.match(/scale\(([^)]+)\)/)[1]) * 100);
        const zoomButton = document.querySelector(`[aria-label="${target > current ? "Powiększ" : "Pomniejsz"}"]`);
        for (let step = 0; step < Math.abs(target - current) / 10; step++) zoomButton.click();
        const result = [];
        const started = performance.now();
        while (performance.now() - started < 400) {
          // Observe after all RAF callbacks commit, rather than sampling between
          // the browser's transform tick and the page's compensation callback.
          await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
          result.push([...document.querySelectorAll(selector)].map((button) => ({
            size: button.getBoundingClientRect().height,
            icon: button.querySelector("svg").getBoundingClientRect().width,
          })));
        }
        return result;
      }, { target, selector });
      expect(samples.length).toBeGreaterThan(2);
      for (const frame of samples) {
        expect(frame.length).toBe(kind === "settings" ? 1 : 2);
        for (const control of frame) {
          expect(control.size).toBeGreaterThanOrEqual(Math.min(expected(previous), expected(target)) - 0.4);
          expect(control.size).toBeLessThanOrEqual(Math.max(expected(previous), expected(target)) + 0.4);
          expect(control.icon / control.size).toBeCloseTo(16 / 36, 1);
        }
      }
      for (const control of samples.at(-1)) expect(control.size).toBeCloseTo(expected(target), 1);
      if (target === 280) await page.screenshot({ path: testInfo.outputPath(`${kind}-280.png`) });
      previous = target;
    }
    api.assertHermetic();
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
      alignedLeft: Math.abs(toolbarBox.x - Math.max(8, Math.min(textBox.x, viewportWidth - toolbarBox.width - 8))) < 0.5,
      fitsViewport: toolbarBox.x + toolbarBox.width <= viewportWidth,
      verticalGap: Math.round(textBox.y - toolbarBox.y - toolbarBox.height),
    };
  }).toEqual({ alignedLeft: true, fitsViewport: true, verticalGap: 0 });
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
          size: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width, radius: style.borderRadius,
          color: style.color, hover: style.backgroundColor,
          border: shell.borderWidth, surface: shell.backgroundColor,
          shellRadius: parseFloat(shell.borderRadius), shellHeight: parseFloat(shell.height),
        };
      });
      expect(appearance.size).toBeCloseTo(size, 0);
      expect(appearance.width).toBeCloseTo(size, 0);
      expect(appearance).toMatchObject({
        radius: "999px", border: "0px",
        surface: "rgb(255, 255, 255)", hover: "rgb(236, 232, 223)",
        color: danger ? "rgb(180, 35, 24)" : "rgb(103, 78, 62)",
      });
      // Chromium rounds inverse-scaled hairline borders to device pixels.
      expect(appearance.shellRadius).toBeCloseTo(appearance.shellHeight / 2, 0);
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
    await checkControl(sectionToolbar.getByRole("button").first(), 36);
    const skillsStyle = sectionToolbar.getByRole("button", { name: "Styl umiejętności: w linii" });
    await checkControl(skillsStyle, 36);
    await expect(skillsStyle).toHaveText("");
    await expect(skillsStyle).toHaveAttribute("data-tooltip", "Styl umiejętności: w linii");
    const disabledMove = sectionToolbar.locator("button:disabled").first();
    await expect(disabledMove).toBeDisabled();
    await expect(disabledMove).toHaveCSS("border-radius", "999px");
    await page.screenshot({ path: testInfo.outputPath("skills-style-toolbar.png") });
    await expectToolbarAboveText(sectionToolbar, page.locator("#skills-heading"));
    await expect(sectionToolbar.getByRole("button", { name: "AI dla wybranego zakresu" })).toBeVisible();
    await page.locator("#skills-tools-title").hover();
    const recordToolbar = page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]');
    await checkControl(recordToolbar.getByRole("button").first(), 36);
    await expectToolbarAboveText(recordToolbar, page.locator("#skills-tools-title"));
    await expect(recordToolbar.getByRole("button", { name: "AI dla wybranego zakresu" })).toBeVisible();
    await reachToolbarFromText(page, "skills-technologies-title", "record:skills-technologies-title");
    await reachToolbarFromText(page, "skills-heading", "heading:skills-heading");
    await hoverVisibleText(page, page.locator("#contact-email"));
    const deleteContact = page.getByRole("button", { name: /Usuń kontakt:/ });
    await checkControl(deleteContact, 36, true);
    const [contactBox, deleteSurfaceBox] = await Promise.all([
      visibleTextBox(page.locator("#contact-email")),
      deleteContact.locator("..").boundingBox(),
    ]);
    expect(deleteSurfaceBox.x + deleteSurfaceBox.width / 2).toBeCloseTo(contactBox.x + contactBox.width / 2, 0);
    expect(deleteSurfaceBox.y + deleteSurfaceBox.height / 2).toBeCloseTo(contactBox.y + contactBox.height / 2, 0);
    await hoverVisibleText(page, page.locator("#contact-email"));
    await checkControl(page.getByRole("button", { name: "Dodaj kontakt", exact: true }), 36);
    await page.locator("#language-item").hover();
    await checkControl(page.locator('[data-canvas-toolbar-key="grid-entry:language-item"] button').first(), 36);
    await expect(page.locator('[data-canvas-toolbar-key="grid-entry:language-item"] button')).toHaveCount(2);

    const body = page.locator("#skills-tools-body");
    await body.focus();
    await body.press("Shift+F10");
    // The skill trash has its own portal with the same lifecycle key. Scope
    // the add form to its portal instead of counting both action surfaces.
    const toolbar = page.locator('[data-canvas-toolbar-key="skills-entry:skills-heading:skills-tools"]:not([data-skill-delete])');
    const add = toolbar.getByRole("button", { name: /Dodaj umiejętność do kategorii/ });
    await expect(add).toBeFocused();
    await expect(toolbar.getByRole("button")).toHaveCount(1);
    await checkControl(add, 36);
    await add.press("Enter");
    const input = toolbar.getByRole("textbox", { name: "Dodaj umiejętność" });
    await expect(input).toBeFocused();
    const submit = toolbar.getByRole("button", { name: "Dodaj umiejętność", exact: true });
    await expect(submit).toBeDisabled();
    const form = toolbar.locator("form");
    await expect(form.locator("..")).toHaveCSS("border-radius", "0px");
    await expect(input).toHaveCSS("border-radius", "2px");
    await expect(submit).toHaveCSS("border-radius", "2px");
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

test("toolbar geometry and menu text grow monotonically through animated canvas zoom", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 1000 });
  const api = await installMockApi(page, { savedElements: [...SAVED_ELEMENTS, ...extraElements] });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.locator("#skills-heading").dispatchEvent("pointerenter");
  const toolbar = page.locator('[data-canvas-toolbar-key="heading:skills-heading"]');
  const more = toolbar.getByRole("button", { name: "Więcej działań" });
  await more.click();
  await expect(toolbar.getByRole("menu")).toBeVisible();
  await expect(more).toHaveCSS("border-radius", "999px");
  await expect(more).toHaveCSS("background-color", "rgb(236, 232, 223)");
  await expect(toolbar.getByRole("menu")).toHaveCSS("border-radius", "0px");
  // The synthetic zoom buttons below do not move a real pointer. Park the
  // pointer over application chrome so an animated page cannot slide another
  // authored hover target underneath it and legitimately claim the toolbar.
  await page.mouse.move(1, 1);

  let previousHeight = 36;
  for (const targetZoom of [280, 140, 100, 50, 200, 300, 160]) {
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
      const finalHeight = 36 * Math.max(1, (2 + targetZoom / 140) / 3);
      expect(sample.height).toBeGreaterThanOrEqual(Math.min(previousHeight, finalHeight) - 0.1);
      expect(sample.height).toBeLessThanOrEqual(Math.max(previousHeight, finalHeight) + 0.1);
      expect(sample.width / sample.height).toBeCloseTo(76 / 36, 1);
      expect(sample.icon / sample.height).toBeCloseTo(16 / 36, 1);
      expect(parseFloat(sample.font)).toBeGreaterThanOrEqual(12);
      expect(sample.menuFont).toBe(sample.font);
      expect(sample.menuWeight).toBe("400");
      previousHeight = sample.height;
    }
    expect(samples.at(-1).height).toBeCloseTo(36 * Math.max(1, (2 + targetZoom / 140) / 3), 1);
    if ([140, 280].includes(targetZoom)) {
      await page.screenshot({ path: testInfo.outputPath(`toolbar-${targetZoom}.png`) });
    }
  }

  for (const trigger of [more, toolbar.getByRole("button", { name: "AI dla wybranego zakresu" })]) {
    await toolbar.getByRole("menuitem").first().press("Escape");
    await expect(more).toBeFocused();
    await trigger.press("Enter");
    const items = toolbar.getByRole("menuitem");
    await expect(items.first()).toHaveCSS("border-radius", "0px");
    await expect(items.first()).toBeFocused();
    await items.first().press("End");
    await expect(items.last()).toBeFocused();
    for (const item of await items.all()) {
      expect(parseFloat(await item.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
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

/** Exercise a real pointer path, so neighbouring records can expose hover theft. */
async function reachToolbarFromText(page, elementId, toolbarKey) {
  const text = page.locator(`[id="${elementId}"]`);
  await text.evaluate((node) => node.scrollIntoView({ block: "center", inline: "start" }));
  const textBox = await visibleTextBox(text);
  const pointerX = textBox.x + Math.min(12, textBox.width / 2);
  await page.mouse.move(pointerX, textBox.y + textBox.height / 2);
  const toolbar = page.locator(`[data-canvas-toolbar-key="${toolbarKey}"]`);
  await expect(toolbar.getByRole("button").first()).toBeVisible();
  await expectToolbarAboveText(toolbar, text);
  const surface = await toolbar.locator(":scope > div").first().boundingBox();
  // Travel upwards through the text edge before moving across the toolbar.
  // A detached surface forces this path through the preceding record's body.
  await page.mouse.move(pointerX, surface.y + surface.height - 2, { steps: 20 });
  await expect(toolbar.getByRole("button").first()).toBeVisible();
  const more = toolbar.getByRole("button", { name: "Więcej działań" });
  const button = await more.boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 20 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(toolbar.getByRole("menu")).toBeVisible();
  await toolbar.getByRole("menuitem").first().press("Escape");
  await expect(more).toBeFocused();
}

// 640px also covers the CSS viewport available to a 1280px display at 200%
// browser zoom. Reduced motion must apply the final dimensions immediately.
for (const width of [390, 640]) {
  test(`enlarged record toolbar stays usable at ${width}px and 280%`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Powiększ", exact: true })).toBeVisible();
    await page.evaluate(() => {
      const zoomIn = document.querySelector('[aria-label="Powiększ"]');
      for (let step = 0; step < 14; step += 1) zoomIn.click();
    });
    await page.locator("#skills-tools-title").evaluate((node) => node.scrollIntoView({ block: "center" }));
    await page.locator("#skills-tools-title").dispatchEvent("pointerenter");
    const toolbar = page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]');
    const more = toolbar.getByRole("button", { name: "Więcej działań" });
    await expect(more).toBeVisible();
    await expect.poll(async () => (await more.boundingBox()).height).toBeCloseTo(48, 1);
    for (const button of await toolbar.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
    }
    await more.focus();
    await more.press("Enter");
    const menu = toolbar.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(toolbar.getByRole("menuitem").first()).toBeFocused();
    await toolbar.getByRole("menuitem").first().press("Escape");
    await expect(more).toBeFocused();
    await expect(more).toHaveCSS("border-radius", "999px");
    await expect(more).toHaveCSS("outline-style", "solid");
    await expect(more).toHaveCSS("outline-color", "rgb(21, 94, 239)");
    await page.screenshot({ path: testInfo.outputPath("record-280.png") });
    api.assertHermetic();
  });
}
