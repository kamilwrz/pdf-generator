import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { TEST_TEMPLATES } from "../src/templates/testTemplatePacks.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

const SHORT_NAME = "Jan Kowalski";
const LONG_NAME = "Kamil Aleksander Wrzochalski-Kowalczyk";
const WRAPPED_NAME = `Kamil ${"Wrzochalski".repeat(28)}`;
const VIEWPORTS = [
  { width: 390, height: 1000 },
  { width: 834, height: 1000 },
  { width: 1280, height: 1000 },
  { width: 1920, height: 1000 },
  // A 1280×1000 display at 200% browser zoom offers this CSS-pixel layout.
  { width: 640, height: 500 },
];

function persistedRows(elements) {
  const columns = new Set([
    "element_id", "category", "page", "left", "top", "width", "height", "content",
    "fontFamily", "fontSize", "color", "src", "backgroundColor", "img_id",
  ]);
  // Match the database response: semantic fields must survive hydration from
  // extras, rather than accidentally riding along as artificial API columns.
  return elements.map((element) => ({
    ...Object.fromEntries(Object.entries(element).filter(([key]) => columns.has(key))),
    extra_properties: Object.fromEntries(Object.entries(element).filter(([key]) => !columns.has(key))),
  }));
}

/**
 * Measure glyphs in authored page units so canvas edit zoom, scrolling and
 * responsive fitting cannot disguise a collision with the photo or margin.
 */
async function nameGeometry(field) {
  return field.evaluate((node) => {
    const canvas = node.closest("[data-page-canvas]");
    const pageBox = canvas.getBoundingClientRect();
    const scale = pageBox.width / canvas.offsetWidth;
    const range = document.createRange();
    range.selectNodeContents(node);
    const glyphs = range.getBoundingClientRect();
    const style = getComputedStyle(node);
    const outline = getComputedStyle(node, "::after");
    const lineTops = [...range.getClientRects()].map((rect) => Math.round(rect.top / scale));
    return {
      fontSize: Number.parseFloat(style.fontSize),
      right: (glyphs.right - pageBox.left) / scale,
      bottom: (glyphs.bottom - pageBox.top) / scale,
      height: glyphs.height / scale,
      lines: new Set(lineTops).size,
      text: node.textContent,
      tag: node.tagName,
      focused: document.activeElement === node,
      editing: node.isContentEditable,
      outlineHeightDifference: Math.abs(Number.parseFloat(outline.height) * scale - glyphs.height),
    };
  });
}

/** Read actual caret position without moving it or changing the edit surface. */
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

for (const templateId of ["slate", "monument"]) {
  test(`${templateId}: long names shrink, wrap and survive save/reload without collisions`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const template = TEST_TEMPLATES.find((item) => item.id === templateId);
    let serial = 0;
    const elements = materializeElementSpecs(template.elements, () => `name-fit-${++serial}`);
    const name = elements.find((element) => element.mastheadRole === "name");
    name.content = SHORT_NAME;
    const title = elements.find((element) => element.mastheadRole === "title");
    const photo = elements.find((element) => element.photoSlot === "frame");
    const contact = elements.find((element) => element.contactChannel && element.category === "text");
    const heading = elements.find((element) => element.flowRole === "section-chrome" && element.category === "text");
    const sidebar = elements.find((element) => element.flowLane === "sidebar" && element.category === "textarea");
    const tracked = [title, contact, heading, photo, ...(sidebar ? [sidebar] : [])];
    const savedElements = persistedRows(elements);
    const savedDocument = { ...SAVED_DOCUMENT, template_id: templateId, cv_data: null };
    const api = await installMockApi(page, {
      savedDocument,
      savedElements,
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({
        body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)),
        contentType: "image/png",
      });
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    const field = page.locator(`[id="${name.element_id}"]`);
    const elementField = (element) => page.locator(`[id="${element.element_id}"]`);
    await expect(field).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Repairing a legacy unfitted name during hydration is a clean load, not a
    // user edit. Returning to the library must not demand an unnecessary save.
    await page.getByRole("link", { name: "Moje dokumenty", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/documents$/);
    await expect(page.getByRole("alertdialog", { name: "Niezapisane zmiany" })).toHaveCount(0);
    await page.goto(`/app/documents/${savedDocument.id}`);
    await expect(field).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = () => Promise.all(tracked.map((element) => elementField(element).evaluate((node) => ({
      top: Number.parseFloat(node.style.top), left: node.style.left,
      width: node.style.width, height: node.style.height,
    }))));
    const original = await geometry();
    const originalName = await nameGeometry(field);
    const originalNode = await field.elementHandle();
    const rightLimit = templateId === "slate" ? SAVED_DOCUMENT.page_width - 48 : 405;

    const assertBounded = async (text, wrapped = false) => {
      await expect.poll(async () => (await nameGeometry(field)).text).toBe(text);
      await expect.poll(async () => (await nameGeometry(field)).right).toBeLessThanOrEqual(rightLimit + 0.5);
      const actual = await nameGeometry(field);
      expect(actual.tag).toBe("P");
      expect(actual.fontSize).toBeGreaterThanOrEqual(14);
      expect(actual.fontSize).toBeLessThanOrEqual(originalName.fontSize);
      if (wrapped) {
        expect(actual.fontSize).toBe(14);
        expect(actual.lines).toBeGreaterThan(1);
        expect(actual.height).toBeGreaterThan(originalName.height);
      }
      if (actual.editing) {
        // Hover's inverse-scale dimensions must never override the active
        // outline and make it cover the title, contacts or subsequent sections.
        await expect.poll(async () => (await nameGeometry(field)).outlineHeightDifference).toBeLessThanOrEqual(8);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    await field.focus();
    await field.press("F2");
    await field.press("ControlOrMeta+A");
    // insertText follows the browser's plain-text insertion path, as pasting a
    // whole name does; subsequent real key events exercise continuous refits.
    await page.keyboard.insertText(LONG_NAME);
    await assertBounded(LONG_NAME);
    expect((await nameGeometry(field)).fontSize).toBeLessThan(originalName.fontSize);
    await expect(field).toBeFocused();
    expect(await originalNode.evaluate((node) => node.isConnected && document.activeElement === node)).toBe(true);
    expect(await caretOffset(field)).toBe(LONG_NAME.length);
    await field.pressSequentially("-Nowak");
    await assertBounded(`${LONG_NAME}-Nowak`);
    expect(await caretOffset(field)).toBe(LONG_NAME.length + 6);

    await field.fill(WRAPPED_NAME);
    await assertBounded(WRAPPED_NAME, true);
    await expect(field).toBeFocused();
    const wrappedGeometry = await geometry();
    for (const index of [0, 1, 2]) expect(wrappedGeometry[index].top).toBeGreaterThan(original[index].top);
    expect(wrappedGeometry[3]).toEqual(original[3]);
    if (sidebar) expect(wrappedGeometry[4]).toEqual(original[4]);
    // Text may continue below the photo, but its horizontal lane and the
    // following title must always remain separate from all name glyphs.
    expect(await elementField(title).evaluate((node) => {
      const canvas = node.closest("[data-page-canvas]");
      const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth;
      const range = document.createRange();
      range.selectNodeContents(node);
      return (range.getBoundingClientRect().top - canvas.getBoundingClientRect().top) / scale;
    })).toBeGreaterThan((await nameGeometry(field)).bottom);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await assertBounded(WRAPPED_NAME, true);
      await expect(field).toBeFocused();
      expect(await geometry()).toEqual(wrappedGeometry);
      if (viewport.width === 1920) {
        await page.screenshot({ path: test.info().outputPath(`${templateId}-wrapped-name.png`) });
      }
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await field.fill(SHORT_NAME);
    await expect.poll(async () => (await nameGeometry(field)).fontSize).toBe(originalName.fontSize);
    await expect.poll(geometry).toEqual(original);

    // Changing case also changes measured glyph widths, so both directions
    // must refit without rewriting a mixed-case source name.
    await field.fill(LONG_NAME);
    await field.press("Escape");
    await field.dispatchEvent("pointerenter");
    const toggle = page.getByRole("button", { name: /^(Włącz|Wyłącz) wielkie litery$/ });
    await toggle.focus();
    await toggle.press("Enter");
    await assertBounded(LONG_NAME);
    await toggle.press("Enter");
    await assertBounded(LONG_NAME);

    await field.focus();
    await field.press("F2");
    await field.fill(WRAPPED_NAME);
    await field.press("Escape");
    await assertBounded(WRAPPED_NAME, true);
    const beforeSave = await geometry();
    const request = page.waitForRequest((item) => item.method() === "PUT"
      && new URL(item.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    const payload = (await request).postDataJSON();
    const savedName = payload.root.find((element) => element.element_id === name.element_id);
    expect(savedName.content).toBe(WRAPPED_NAME);
    expect(savedName.fontSize).toBe(14);
    expect(savedName.left + savedName.width).toBeLessThanOrEqual(rightLimit);
    const renderName = payload.render_root.find((element) => element.element_id === name.element_id);
    expect(renderName.content).toBe(WRAPPED_NAME);
    expect(renderName.fontSize).toBe(14);
    for (const element of payload.root.filter((item) => !item.deleted && !item.fixedToPage
      && ["content", "grid-member", "section-chrome"].includes(item.flowRole))) {
      const bottom = Number(element.top) + (element.category === "text"
        ? Number(element.fontSize) / 2 : Number(element.height) || 0);
      expect(bottom, `Authored element ${element.element_id} must remain inside its page`).toBeLessThanOrEqual(842);
    }
    expect(payload.render_root.some((element) => element["data-editor-control"])).toBe(false);
    // Model the server's next read using exactly the saved rows, including
    // extras, so restoring the original font cannot rely on in-memory state.
    savedElements.splice(0, savedElements.length, ...persistedRows(payload.root));
    savedDocument.pages = payload.pages;
    savedDocument.cv_data = payload.cv_data;
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    await page.reload();
    await expect(field).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await assertBounded(WRAPPED_NAME, true);
    await expect.poll(geometry).toEqual(beforeSave);
    await field.focus();
    await field.press("F2");
    await field.fill(SHORT_NAME);
    await expect.poll(async () => (await nameGeometry(field)).fontSize).toBe(originalName.fontSize);
    await expect.poll(geometry).toEqual(original);
    await field.press("Escape");
    api.assertHermetic();
  });
}
