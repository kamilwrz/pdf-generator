import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { regentTemplate } from "../src/templates/regent.js";
import { meridianTemplate } from "../src/templates/meridian.js";
import { applyRegentPalette, REGENT_PALETTES } from "../src/utils/regentAppearance.js";
import { applyMeridianPalette, MERIDIAN_PALETTES } from "../src/utils/meridianAppearance.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { applyChannelRelayout } from "../src/utils/contactBandOps.js";
import { CHANNEL_NAMES, contactChannelPlaceholder } from "../src/utils/contactChannelNames.js";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

for (const [templateId, template, palettes, applyPalette] of [
  ["regent", regentTemplate, REGENT_PALETTES, applyRegentPalette],
  ["meridian", meridianTemplate, MERIDIAN_PALETTES, applyMeridianPalette],
]) {
for (const [index, palette] of palettes.entries()) {
  test(`${templateId} ${palette.id}: compact masthead, centred icons and reachable contact trash`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: [390, 834, 1280, 1920, 1280, 1280][index], height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let serial = 0;
    const createId = () => `editorial-add-${++serial}`;
    const initialChannels = ["phone", "email", "location"];
    let elements = materializeElementSpecs(applyPalette(template, palette.id), createId)
      .filter((element) => !element.contactChannel || initialChannels.includes(element.contactChannel))
      .map((element) => element.contactChannel && element.category === "textarea" ? {
        ...element, content: "", placeholder: contactChannelPlaceholder(element.contactChannel),
        starterPlaceholder: true,
        cvDataBindings: [{ path: [element.contactChannel], placeholder: contactChannelPlaceholder(element.contactChannel) }],
      } : element);
    elements = applyChannelRelayout(elements, `${templateId}-contact`, null, createId).elements;
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, template_id: templateId, cv_data: null },
      savedElements: elements.map((element) => ({ ...element, extra_properties: { ...element } })),
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({ body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)), contentType: "image/png" });
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    const field = (channel) => page.locator(`[data-page-canvas] [data-placeholder="${contactChannelPlaceholder(channel)}"]`);
    await expect(field("location")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const identity = elements.find((element) => element.mastheadRole === "name");
    const position = elements.find((element) => element.mastheadRole === "title");
    const nameField = page.locator(`[id="${identity.element_id}"]`);
    const jobField = page.locator(`[id="${position.element_id}"]`);
    expect(await nameField.evaluate((node) => Number.parseFloat(node.style.top))).toBe(24);
    const nameBox = await nameField.boundingBox();
    const jobBox = await jobField.boundingBox();
    expect(jobBox.y).toBeGreaterThan(nameBox.y + nameBox.height);

    const assertCentred = async (channels) => {
      for (const channel of channels) {
        const box = await field(channel).evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const canvas = node.closest("[data-page-canvas]");
          const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth;
          return { centre: rect.top + rect.height / 2, scale, height: rect.height / scale };
        });
        const icon = page.locator(`[data-page-canvas] img[src$="/${channel}.png"]`);
        await expect(icon).toBeVisible();
        const bounds = await icon.boundingBox();
        expect(Math.abs(bounds.y + bounds.height / 2 - box.centre) / box.scale, channel).toBeLessThan(0.05);
        expect(bounds.height / box.scale).toBeCloseTo(11, 2);
        await expect(icon).toHaveAttribute("src", new RegExp(`/iconic/${palette.iconTheme}/`));
      }
    };
    const channels = [...initialChannels];
    const reachDelete = async (channel) => {
      const label = field(channel);
      await label.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
      const bounds = await label.boundingBox();
      // Approach horizontally through the same field, as a person would. A
      // button below the row instead crosses and activates its neighbour.
      await page.mouse.move(0, 0);
      await page.mouse.move(bounds.x + bounds.width / 2 - 40, bounds.y + bounds.height / 2);
      const remove = page.getByRole("button", {
        name: `Usuń kontakt: ${CHANNEL_NAMES[channel]}`, exact: true,
      });
      await expect(remove).toBeVisible();
      const target = await remove.boundingBox();
      expect(target.x + target.width / 2).toBeCloseTo(bounds.x + bounds.width / 2, 0);
      expect(target.y + target.height / 2).toBeCloseTo(bounds.y + bounds.height / 2, 0);
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
      await expect.poll(() => remove.evaluate((node) => node.matches(":hover"))).toBe(true);
      return remove;
    };
    await assertCentred(channels);
    for (const channel of channels) await reachDelete(channel);
    // Exercise the same path at the real 280% edit zoom shown in the report.
    await field("email").focus();
    await field("email").press("F2");
    await field("email").press("Escape");
    await assertCentred(channels);
    for (const channel of channels) await reachDelete(channel);
    for (const [channel, name] of [["linkedin", "LinkedIn"], ["github", "GitHub"], ["website", "Strona WWW"]]) {
      await field("location").hover();
      await page.getByRole("button", { name: "Dodaj kontakt", exact: true }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
      channels.push(channel);
      await page.screenshot({ path: testInfo.outputPath(`added-${channel}.png`) });
      await assertCentred(channels);
      // Empty, entered and cleared values must retain the same icon contract.
      await field(channel).focus();
      await field(channel).press("F2");
      await field(channel).fill(channel === "website" ? "profile.example.com/".repeat(8) : "profile.example.com");
      await assertCentred(channels);
      await reachDelete(channel);
      await field(channel).press("ControlOrMeta+a");
      await field(channel).press("Backspace");
      await field(channel).press("Escape");
      await assertCentred(channels);
    }
    const deleteEmail = await reachDelete("email");
    await page.screenshot({ path: testInfo.outputPath("centred-contact-delete.png") });
    // Click at the reached position without locator auto-hover masking a
    // changed deletion target. Only this channel and its icon may disappear.
    const deleteBox = await deleteEmail.boundingBox();
    await page.mouse.click(deleteBox.x + deleteBox.width / 2, deleteBox.y + deleteBox.height / 2);
    await expect(field("email")).toHaveCount(0);
    channels.splice(channels.indexOf("email"), 1);
    await assertCentred(channels);
    const deleteWebsite = await reachDelete("website");
    await deleteWebsite.focus();
    await page.mouse.move(0, 0);
    // Wait beyond the 600ms pointer-leave timeout: keyboard focus owns the
    // action until activation or blur, even after the pointer leaves A4.
    await page.waitForTimeout(700);
    await expect(deleteWebsite).toBeFocused();
    await deleteWebsite.press("Enter");
    await expect(field("website")).toHaveCount(0);
    channels.splice(channels.indexOf("website"), 1);
    const saved = page.waitForRequest((request) => request.method() === "PUT"
      && new URL(request.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    const payload = (await saved).postDataJSON();
    for (const channel of channels) {
      const icon = payload.root.find((element) => element.category === "image" && element.contactChannel === channel);
      const label = payload.root.find((element) => element.category === "textarea" && element.contactChannel === channel);
      expect(icon.alignWithText).toBe(false);
      expect(icon.top + icon.height / 2).toBeCloseTo(label.top + label.height / 2, 5);
      expect(payload.render_root.some((element) => element.contactChannel === channel)).toBe(false);
    }
    api.assertHermetic();
  });
}
}
