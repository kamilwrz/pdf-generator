import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { lindenTemplate } from "../src/templates/linden.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

// The old API dropped the hidden header coordinates on persistence. Start
// from that real legacy shape so a pristine, unsaved starter cannot mask it.
function persistedRows(elements, omitHiddenCoordinates = false) {
  return elements.map((element) => {
    const row = structuredClone(element);
    if (omitHiddenCoordinates) delete row.profilePhotoHiddenTop;
    return { ...row, extra_properties: { ...row } };
  });
}

for (const width of [390, 834, 1280, 1920]) {
  test(`Linden saved photo hide/show preserves its contact heading at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let serial = 0;
    const elements = materializeElementSpecs(lindenTemplate, () => `linden-photo-${++serial}`);
    const heading = elements.find((element) => element.content === "DANE KONTAKTOWE");
    const rule = elements.find((element) => element.category === "line" && element.profilePhotoHiddenTop != null);
    const photo = elements.find((element) => element.photoSlot === "frame");
    const contacts = elements.filter((element) => element.contactChannel && element.category === "text");
    const sections = elements.filter((element) => element.flowRole === "sidebar-chrome" && element.category === "text");
    // Model an already saved editor layout with its authored 32pt contact
    // gap. The static generator preview rounds its original start to 304pt;
    // that separate 1.5pt normalization must not obscure round-trip drift.
    const initialContactBottom = Math.max(...elements.filter((element) => element.contactChannel)
      .map((element) => element.top + Math.max(element.height || 0, element.lineHeight || 0, element.fontSize || 0)));
    const initialSidebarShift = initialContactBottom + 32 - Math.min(...sections.map((element) => element.top));
    elements.filter((element) => element.flowLane === "sidebar").forEach((element) => {
      element.top += initialSidebarShift;
    });
    const visibleElements = elements.filter((element) => element.flowRole !== "masthead-anchor" && !element.fixedToPage);
    const savedElements = persistedRows(elements, true);
    const savedDocument = { ...SAVED_DOCUMENT, template_id: "linden", cv_data: null };
    const api = await installMockApi(page, { savedDocument, savedElements });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({
        body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)),
        contentType: "image/png",
      });
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    const elementNode = (element) => page.locator(`[id="${element.element_id}"]`);
    await expect(elementNode(heading)).toBeAttached();
    await page.evaluate(() => document.fonts.ready);

    const top = (element) => elementNode(element).evaluate((node) => Number.parseFloat(node.style.top));
    const glyphBounds = (element) => elementNode(element).evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const bounds = range.getBoundingClientRect();
      return { y: bounds.y, height: bounds.height };
    });
    const geometry = () => Promise.all(visibleElements.map((element) => elementNode(element).evaluate((node) => ({
      top: node.style.top, left: node.style.left, width: node.style.width, height: node.style.height,
    }))));
    const original = await geometry();
    const originalContactTops = await Promise.all(contacts.map(top));
    const show = page.getByRole("button", { name: "Pokaż slot zdjęcia profilowego", exact: true });
    const hide = async () => {
      await elementNode(photo).dispatchEvent("pointerenter");
      const control = page.getByRole("button", { name: "Ukryj slot zdjęcia profilowego", exact: true });
      await control.focus();
      await expect(control).toBeFocused();
      await control.press("Enter");
      await expect(show).toBeVisible();
    };
    const assertHidden = async () => {
      await expect.poll(() => top(heading)).toBe(heading.profilePhotoHiddenTop);
      expect(await top(rule)).toBe(rule.profilePhotoHiddenTop);
      const hiddenContactTops = await Promise.all(contacts.map(top));
      expect(hiddenContactTops.map((value, index) => value - originalContactTops[index])).toEqual(
        contacts.map(() => heading.profilePhotoHiddenTop - heading.top),
      );
      // Inspect rendered glyphs too: a header stranded in its old location can
      // cross an education/skills record even when contacts themselves moved.
      const headingBounds = await glyphBounds(heading);
      const sectionBounds = await Promise.all(sections.map(glyphBounds));
      expect(headingBounds.y + headingBounds.height).toBeLessThan(Math.min(...sectionBounds.map((box) => box.y)));
      const controlBounds = await show.boundingBox();
      expect(controlBounds.width).toBeGreaterThanOrEqual(35.9);
      expect(controlBounds.height).toBeGreaterThanOrEqual(35.9);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await hide();
      await assertHidden();
      await show.focus();
      await show.press("Enter");
      await expect(show).toHaveCount(0);
      await expect.poll(geometry).toEqual(original);
    }

    // Save the hidden state through the actual UI, then reopen that server
    // snapshot. Dropping metadata only during hydration is caught here too.
    await hide();
    await assertHidden();
    const request = page.waitForRequest((item) => item.method() === "PUT"
      && new URL(item.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    const payload = (await request).postDataJSON();
    for (const chrome of [heading, rule]) {
      expect(payload.root.find((element) => element.element_id === chrome.element_id).profilePhotoHiddenTop)
        .toBe(chrome.profilePhotoHiddenTop);
    }
    const persistedContacts = payload.root.filter((element) => element.contactChannel);
    const contactBottom = Math.max(...persistedContacts.map((element) => element.top
      + Math.max(element.height || 0, element.lineHeight || 0, element.fontSize || 0)));
    const firstSection = Math.min(...payload.root.filter((element) => element.flowRole === "sidebar-chrome")
      .map((element) => element.top));
    expect(firstSection - contactBottom).toBeCloseTo(32, 5);
    // The renderer receives hidden slot members and omits them server-side.
    expect(payload.render_root.filter((element) => element.photoSlot)
      .every((element) => element.photoSlotHidden === true)).toBe(true);
    expect(payload.render_root.some((element) => element["data-editor-control"])).toBe(false);
    savedElements.splice(0, savedElements.length, ...persistedRows(payload.root));
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    await page.reload();
    await expect(show).toBeVisible();
    await assertHidden();
    await page.screenshot({ path: test.info().outputPath("linden-hidden-reopened.png") });
    await show.focus();
    await show.press("Enter");
    await expect.poll(geometry).toEqual(original);

    // Text zoom changes application controls without altering document units.
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await hide();
    await assertHidden();
    await show.focus();
    await show.press("Enter");
    await expect.poll(geometry).toEqual(original);
    api.assertHermetic();
  });
}
