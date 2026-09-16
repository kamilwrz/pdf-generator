import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { TEST_TEMPLATES } from "../src/templates/testTemplatePacks.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { installMockApi, SAVED_DOCUMENT } from "./support/mockApi.js";

const SHORT_NAME = "Jan Kowalski";
const SCREENSHOT_NAME = "HUBERT MIKOŁAJ STAWIARCZYK";
const LONG_NAME = "Hubert Mikołaj Aleksander Stawiarczyk-Kowalczyk";
const VIEWPORTS = [
  { width: 390, height: 1000 },
  { width: 834, height: 1000 },
  { width: 1280, height: 1000 },
  { width: 1920, height: 1000 },
  // A 1280 × 1000 display at 200% browser zoom has this CSS-pixel layout.
  { width: 640, height: 500 },
];

for (const templateId of ["vellum", "aurelia", "cadenza"]) {
  test(`${templateId}: empty job-title focus preserves masthead placement`, async ({ page }) => {
    test.setTimeout(120_000);
    const template = TEST_TEMPLATES.find((item) => item.id === templateId);
    let serial = 0;
    const elements = materializeElementSpecs(template.elements, () => `title-entry-${++serial}`);
    const name = elements.find((element) => element.mastheadRole === "name");
    const title = elements.find((element) => element.mastheadRole === "title");
    for (const [element, placeholder] of [[name, "Imię i nazwisko"], [title, "Tytuł zawodowy"]]) {
      Object.assign(element, { content: "", placeholder, starterPlaceholder: true });
    }
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, template_id: templateId, cv_data: null },
      savedElements: persistedRows(elements),
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({ body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)), contentType: "image/png" });
    });
    await page.addInitScript(() => {
      localStorage.setItem("token", "local-playwright-token");
      localStorage.setItem("username", "Kamil");
      localStorage.setItem("cvstudio.uiLanguage", "pl");
    });
    await page.goto(`/app/documents/${SAVED_DOCUMENT.id}`);
    const field = (element) => page.locator(`[id="${element.element_id}"]`);
    await expect(field(name)).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const tracked = elements.filter((element) => element.page === 1 && element !== title);
    const geometry = () => Promise.all(tracked.map((element) => authoredGeometry(field(element))));
    const before = await geometry();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: viewport.width === 1280 ? "no-preference" : "reduce" });
      // Match the wizard's initial name edit followed by a direct title click.
      await field(name).focus();
      await field(name).press("F2");
      await field(title).click();
      await expect(field(title)).toBeFocused();
      await expect.poll(geometry).toEqual(before);
      for (const value of ["Analityk", ""]) {
        await field(title).fill(value);
        await expect.poll(geometry).toEqual(before);
      }
      await field(title).press("Escape");
      await expect.poll(geometry).toEqual(before);
      expect((await authoredGeometry(field(title))).top).toBe(title.top);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath("stable-title-entry.png") });
    api.assertHermetic();
  });
}

function persistedRows(elements) {
  const columns = new Set([
    "element_id", "category", "page", "left", "top", "width", "height", "content",
    "fontFamily", "fontSize", "color", "src", "backgroundColor", "img_id",
  ]);
  return elements.map((element) => ({
    ...Object.fromEntries(Object.entries(element).filter(([key]) => columns.has(key))),
    extra_properties: Object.fromEntries(Object.entries(element).filter(([key]) => !columns.has(key))),
  }));
}

/** Read rendered glyphs in document points, independently of editor zoom. */
async function glyphGeometry(field) {
  return field.evaluate((node) => {
    const canvas = node.closest("[data-page-canvas]");
    const page = canvas.getBoundingClientRect();
    const scale = page.width / canvas.offsetWidth;
    const range = document.createRange();
    const rectangles = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    // pre-wrap allows invisible spaces to hang after a line's right edge.
    // Measure visible characters so those spaces cannot masquerade as glyph
    // overflow when changing case changes the browser's word wrapping.
    while (walker.nextNode()) {
      const text = walker.currentNode;
      for (let index = 0; index < text.length; index += 1) {
        if (/\s/.test(text.textContent[index])) continue;
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        rectangles.push(range.getBoundingClientRect());
      }
    }
    const style = getComputedStyle(node);
    return {
      top: (Math.min(...rectangles.map((rect) => rect.top)) - page.top) / scale,
      bottom: (Math.max(...rectangles.map((rect) => rect.bottom)) - page.top) / scale,
      left: (Math.min(...rectangles.map((rect) => rect.left)) - page.left) / scale,
      right: (Math.max(...rectangles.map((rect) => rect.right)) - page.left) / scale,
      fontSize: Number.parseFloat(style.fontSize),
      lines: new Set(rectangles.map((line) => Math.round(line.top / scale))).size,
    };
  });
}

async function authoredGeometry(field) {
  return field.evaluate((node) => ({
    top: Number.parseFloat(node.style.top),
    left: Number.parseFloat(node.style.left),
    width: Number.parseFloat(node.style.width),
    height: Number.parseFloat(node.style.height),
  }));
}

/** Observe the native caret without normalizing or replacing its text nodes. */
async function caretOffset(field) {
  return field.evaluate((node) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !node.contains(selection.anchorNode)) return -1;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  });
}

for (const templateId of ["vellum", "aurelia", "cadenza"]) {
  test(`${templateId}: long editorial names preserve type and move the full masthead flow`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const template = TEST_TEMPLATES.find((item) => item.id === templateId);
    let serial = 0;
    const elements = materializeElementSpecs(template.elements, () => `editorial-wrap-${++serial}`);
    const name = elements.find((element) => element.mastheadRole === "name");
    // Reproduce existing saved documents from before automatic fitting. The
    // source name has two visible lines but still owns a one-line saved box.
    name.content = SCREENSHOT_NAME;
    delete name.nameFit;
    const title = elements.find((element) => element.mastheadRole === "title");
    const contact = elements.find((element) => element.contactChannel && ["text", "textarea"].includes(element.category));
    const heading = elements.find((element) => element.flowRole === "section-chrome" && element.category === "text");
    const frame = elements.find((element) => element.mastheadFrame);
    const photo = elements.find((element) => element.photoSlot === "frame");
    const savedElements = persistedRows(elements);
    const savedDocument = { ...SAVED_DOCUMENT, template_id: templateId, cv_data: null };
    const api = await installMockApi(page, { savedDocument, savedElements });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({
        body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)),
        contentType: "image/png",
      });
    });
    // Authentication is outside this layout regression. Enter the owned CV
    // directly so a cold Vite compilation cannot exhaust the login helper's
    // shorter onboarding timeout before any document layout is exercised.
    await page.addInitScript(() => {
      localStorage.setItem("token", "local-playwright-token");
      localStorage.setItem("username", "Kamil");
      localStorage.setItem("cvstudio.uiLanguage", "pl");
    });
    await page.goto(`/app/documents/${savedDocument.id}`);
    const field = (element) => page.locator(`[id="${element.element_id}"]`);
    const nameField = field(name);
    let titleField = field(title);
    await expect(nameField).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const positions = () => Promise.all([
      authoredGeometry(titleField), authoredGeometry(field(contact)), authoredGeometry(field(heading)),
      ...(frame ? [authoredGeometry(field(frame))] : []),
      ...(photo ? [authoredGeometry(field(photo))] : []),
    ]);
    const assertClear = async (text, expectedFontSize = name.fontSize) => {
      await expect(nameField).toHaveText(text);
      await expect.poll(async () => {
        const [nameBox, titleBox, contactBox] = await Promise.all([
          glyphGeometry(nameField), glyphGeometry(titleField), glyphGeometry(field(contact)),
        ]);
        return Math.min(titleBox.top - nameBox.bottom, contactBox.top - titleBox.bottom);
      }).toBeGreaterThan(0);
      const actual = await glyphGeometry(nameField);
      if (expectedFontSize !== null) expect(actual.fontSize).toBe(expectedFontSize);
      expect(actual.left).toBeGreaterThanOrEqual(name.left - 0.5);
      expect(actual.right).toBeLessThanOrEqual(name.left + name.width + 0.5);
      if (frame) {
        const boundary = await authoredGeometry(field(frame));
        expect((await glyphGeometry(titleField)).bottom).toBeLessThan(boundary.top + boundary.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await assertClear(SCREENSHOT_NAME);
    expect((await glyphGeometry(nameField)).lines).toBeGreaterThan(1);
    await page.screenshot({ path: test.info().outputPath(`${templateId}-legacy-name.png`) });
    // Automatic legacy repair must be part of the clean loaded snapshot.
    await page.getByRole("link", { name: "Moje dokumenty", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/documents$/);
    await expect(page.getByRole("alertdialog", { name: "Niezapisane zmiany" })).toHaveCount(0);
    await page.goto(`/app/documents/${savedDocument.id}`);
    await expect(nameField).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await assertClear(SCREENSHOT_NAME);

    await nameField.focus();
    await nameField.press("F2");
    await nameField.fill(SHORT_NAME);
    await assertClear(SHORT_NAME);
    const compact = await positions();
    const originalNode = await nameField.elementHandle();
    await nameField.press("ControlOrMeta+A");
    await page.keyboard.insertText(LONG_NAME);
    await assertClear(LONG_NAME);
    await expect(nameField).toBeFocused();
    expect(await originalNode.evaluate((node) => node.isConnected && document.activeElement === node)).toBe(true);
    expect(await caretOffset(nameField)).toBe(LONG_NAME.length);
    await nameField.pressSequentially("-Nowak");
    await assertClear(`${LONG_NAME}-Nowak`);
    expect(await caretOffset(nameField)).toBe(LONG_NAME.length + 6);
    const expanded = await positions();
    for (const index of [0, 1, 2]) expect(expanded[index].top).toBeGreaterThan(compact[index].top);
    if (frame) expect(expanded[3].height).toBeGreaterThan(compact[3].height);
    if (photo) expect(expanded.at(-1)).toEqual(compact.at(-1));

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await assertClear(`${LONG_NAME}-Nowak`);
      await expect(nameField).toBeFocused();
      expect(await positions()).toEqual(expanded);
      if (viewport.width === 1920) await page.screenshot({ path: test.info().outputPath(`${templateId}-long-name.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await nameField.fill(SHORT_NAME);
    await assertClear(SHORT_NAME);
    await expect.poll(positions).toEqual(compact);

    // Refit using each case's actual glyph widths, without changing the source
    // mixed-case spelling or leaving the title at the previous line count.
    await nameField.fill(LONG_NAME);
    await nameField.press("Escape");
    await nameField.dispatchEvent("pointerenter");
    const caseToggle = page.getByRole("button", { name: /^(Włącz|Wyłącz) wielkie litery$/ });
    await caseToggle.focus();
    await caseToggle.press("Enter");
    await assertClear(LONG_NAME);
    await caseToggle.press("Enter");
    await assertClear(LONG_NAME);

    const beforeTitleToggle = await positions();
    await titleField.dispatchEvent("pointerenter");
    await page.getByRole("button", { name: "Ukryj stanowisko", exact: true }).click();
    await expect(titleField).toHaveCount(0);
    await nameField.focus();
    await nameField.press("F2");
    await nameField.fill(SHORT_NAME);
    await nameField.fill(LONG_NAME);
    await nameField.press("Escape");
    const addTitle = page.getByRole("button", { name: "Dodaj stanowisko", exact: true });
    await addTitle.focus();
    await addTitle.press("Enter");
    titleField = page.locator("[data-page-canvas]").getByText(title.content, { exact: true });
    await assertClear(LONG_NAME);
    await expect.poll(positions).toEqual(beforeTitleToggle);

    const beforeSave = await positions();
    const request = page.waitForRequest((item) => item.method() === "PUT"
      && new URL(item.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    const payload = (await request).postDataJSON();
    const savedName = payload.root.find((element) => element.element_id === name.element_id);
    const renderName = payload.render_root.find((element) => element.element_id === name.element_id);
    expect(savedName.content).toBe(LONG_NAME);
    expect(savedName.fontSize).toBe(name.fontSize);
    expect(renderName.content).toBe(LONG_NAME);
    expect(renderName.fontSize).toBe(savedName.fontSize);
    expect(renderName.height).toBe(savedName.height);
    expect(savedName.height).toBeGreaterThan(name.height);
    expect(payload.render_root.some((element) => element["data-editor-control"])).toBe(false);
    savedElements.splice(0, savedElements.length, ...persistedRows(payload.root));
    savedDocument.pages = payload.pages;
    savedDocument.cv_data = payload.cv_data;
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    await page.reload();
    await expect(nameField).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await assertClear(LONG_NAME);
    await expect.poll(positions).toEqual(beforeSave);
    await nameField.focus();
    await nameField.press("F2");
    await nameField.fill(SHORT_NAME);
    await assertClear(SHORT_NAME);
    await expect.poll(positions).toEqual(compact);
    await nameField.press("Escape");

    // Appearance presets deliberately change type size. They must recompute
    // wrapped height before laying out the title, contacts and identity frame.
    await nameField.focus();
    await nameField.press("F2");
    await nameField.fill(LONG_NAME);
    await nameField.press("Escape");
    await page.getByRole("button", { name: "Dostosuj CV", exact: true }).click();
    await page.getByRole("tab", { name: "Wygląd", exact: true }).click();
    const sizes = page.getByRole("radiogroup", { name: "Rozmiar tekstu", exact: true });
    for (const size of ["S", "XL", "M"]) {
      const choice = sizes.getByRole("radio", { name: size, exact: true });
      await choice.focus();
      await choice.press("Enter");
      await expect(choice).toHaveAttribute("aria-checked", "true");
      await assertClear(LONG_NAME, size === "M" ? name.fontSize : null);
    }
    api.assertHermetic();
  });
}
