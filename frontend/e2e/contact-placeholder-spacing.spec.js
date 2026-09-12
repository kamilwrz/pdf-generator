import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { TEST_TEMPLATES } from "../src/templates/testTemplatePacks.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { applyChannelRelayout } from "../src/utils/contactBandOps.js";
import { contactChannelPlaceholder } from "../src/utils/contactChannelNames.js";
import { installMockApi, SAVED_DOCUMENT } from "./support/mockApi.js";

const cases = [
  ...[390, 834, 1280, 1920].map((width) => ({ templateId: "meridian", width })),
  { templateId: "monument", width: 1280 },
  { templateId: "linden", width: 1280 },
  ...["cadenza", "aurelia"].flatMap((templateId) => [390, 834, 1280, 1920].map((width) => ({ templateId, width, language: "en" }))),
];

for (const { templateId, width, language = "pl" } of cases) {
  test(`${templateId} ${language}: clearing contacts restores non-overlapping hints at ${width}px`, async ({ page }, testInfo) => {
    // Allow two full edit/clear cycles per contact and a save.
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((value) => localStorage.setItem("cvstudio.uiLanguage", value), language);
    const template = TEST_TEMPLATES.find((item) => item.id === templateId);
    let nextId = 0;
    let elements = materializeElementSpecs(template.elements, () => `contacts-${++nextId}`)
      .filter((element) => !element.contactChannel || ["phone", "email", "website", "location"].includes(element.contactChannel))
      .map((element) => element.contactChannel && ["text", "textarea"].includes(element.category) ? {
        ...element, content: "", placeholder: contactChannelPlaceholder(element.contactChannel),
        starterPlaceholder: true,
        cvDataBindings: [{ path: [element.contactChannel], placeholder: contactChannelPlaceholder(element.contactChannel) }],
      } : element);
    for (const anchor of elements.filter((element) => element.contactBand)) {
      elements = applyChannelRelayout(elements, anchor.contactBandId, null, () => `contacts-${++nextId}`).elements;
    }
    const contacts = elements.filter((element) => element.contactChannel && ["text", "textarea"].includes(element.category));
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, template_id: templateId },
      savedElements: elements.map((element) => ({ ...element, extra_properties: { ...element } })),
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({ body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)), contentType: "image/png" });
    });
    await page.addInitScript(() => {
      localStorage.setItem("token", "local-playwright-token");
      localStorage.setItem("username", "Kamil");
    });
    await page.goto("/app/documents/41");
    const fieldFor = (contact) => page.locator(`[id="${contact.element_id}"]`);
    await expect(fieldFor(contacts[0])).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const positions = () => Promise.all(contacts.map((contact) => fieldFor(contact).evaluate((node) => ({
      left: Number.parseFloat(node.style.left), top: Number.parseFloat(node.style.top),
    }))));
    const expectNoOverlap = async () => {
      const bounds = await Promise.all(contacts.map((contact) => fieldFor(contact).evaluate((node) => {
        const box = node.getBoundingClientRect();
        const canvas = node.closest("[data-page-canvas]");
        const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth;
        return { left: Number.parseFloat(node.style.left), top: Number.parseFloat(node.style.top), width: box.width / scale };
      })));
      bounds.sort((a, b) => a.top - b.top || a.left - b.left);
      for (let index = 1; index < bounds.length; index += 1) {
        const previous = bounds[index - 1];
        const current = bounds[index];
        if (Math.abs(previous.top - current.top) < 1) {
          // Include the following icon, which starts before its text label.
          const iconGap = elements.find((element) => element.contactBand)?.contactBand.metrics.iconGap || 0;
          expect(previous.left + previous.width).toBeLessThan(current.left - iconGap);
        }
      }
    };

    // Saved coordinates were computed from canonical metadata and must fit the
    // selected landing-page locale before any edit triggers a reflow.
    await expectNoOverlap();
    const savedPositions = await positions();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.getByRole("combobox", { name: language === "en" ? "Application language" : "Język aplikacji" })).toHaveCount(0);
    expect(await positions()).toEqual(savedPositions);
    await expectNoOverlap();

    // Enter/leave an untouched field once to replace the initial deterministic
    // font estimate with the same browser metrics used by live editing.
    await fieldFor(contacts[0]).focus();
    await fieldFor(contacts[0]).press("F2");
    await fieldFor(contacts[0]).press("Escape");
    const baseline = await positions();
    await expectNoOverlap();
    for (const contact of contacts) {
      const field = fieldFor(contact);
      for (const deleteKey of ["Backspace", "Delete"]) {
        await field.focus();
        await field.press("F2");
        await field.pressSequentially("test@example.com");
        await field.press("ControlOrMeta+a");
        await field.press(deleteKey);
        // Check before blur as well: leftover <br> must not hide the advice or
        // shrink the band while the empty field still owns the caret.
        await expect(field).toBeFocused();
        await expect(field).toHaveText("");
        await expect.poll(() => field.evaluate((node) => node.innerHTML)).toBe("");
        await expect.poll(() => field.evaluate((node) => getComputedStyle(node, "::before").content))
          .toBe(JSON.stringify(language === "en" ? ({ email: "name@example.com", location: "City, country" }[contact.contactChannel] || contact.placeholder) : contact.placeholder));
        await expect.poll(positions).toEqual(baseline);
        await expectNoOverlap();
        await field.press("Escape");
        await expect.poll(positions).toEqual(baseline);
        await expectNoOverlap();
      }
    }
    await page.screenshot({ path: testInfo.outputPath("cleared-contacts.png") });
    const save = page.waitForRequest((request) => request.method() === "PUT" && new URL(request.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: language === "en" ? "Save document" : "Zapisz dokument", exact: true }).click();
    const payload = (await save).postDataJSON();
    for (const contact of contacts) {
      const saved = payload.root.find((element) => element.element_id === contact.element_id);
      expect(saved.content).toBe("");
      expect(payload.render_root.some((element) => element.element_id === contact.element_id)).toBe(false);
    }
    api.assertHermetic();
  });
}
