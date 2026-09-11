import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { regentTemplate } from "../src/templates/regent.js";
import { meridianTemplate } from "../src/templates/meridian.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

for (const [id, template] of [["regent", regentTemplate], ["meridian", meridianTemplate]]) {
 for (const empty of [false, true]) {
  test(`${id} ${empty ? "empty starter" : "filled"}: editing a wrapped identity keeps the contact floor and body in sync`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let serial = 0;
    const elements = materializeElementSpecs(template, () => `identity-${++serial}`).map((element) =>
      empty && element.mastheadRole ? { ...element, content: "", placeholder: element.mastheadRole === "name" ? "Imię i nazwisko" : "Tytuł zawodowy", starterPlaceholder: true } : element);
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, template_id: id, cv_data: null },
      savedElements: elements.map((element) => ({ ...element, extra_properties: { ...element } })),
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({ body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)), contentType: "image/png" });
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    const name = elements.find((element) => element.mastheadRole === "name");
    const title = elements.find((element) => element.mastheadRole === "title");
    const phone = elements.find((element) => element.contactChannel === "phone" && element.category === "textarea");
    const field = (element) => page.locator(`[id="${element.element_id}"]`);
    await expect(field(name)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (empty) {
      const body = elements.filter((element) => ["content", "section-chrome"].includes(element.flowRole) && element.page === 1);
      expect(body.length).toBeGreaterThan(0);
      const geometry = () => Promise.all(body.map((element) => field(element).evaluate((node) => ({
        top: node.style.top, left: node.style.left, height: node.style.height,
      }))));
      const before = await geometry();
      // Reproduce the wizard's initial name focus followed by a title click.
      await field(name).focus();
      await field(name).press("F2");
      await field(title).click();
      await field(title).press("F2");
      await field(title).press("Escape");
      await expect.poll(geometry).toEqual(before);
      await page.screenshot({ path: testInfo.outputPath("empty-title-entry.png") });
      api.assertHermetic();
      return;
    }
    for (const element of [name, title]) {
      await field(element).focus();
      await field(element).press("F2");
      await field(element).fill(`${element.content || "Long professional identity"} `.repeat(3));
      await field(element).press("Escape");
      await expect.poll(async () => {
        const [nameBox, titleBox, phoneBox] = await Promise.all([field(name).boundingBox(), field(title).boundingBox(), field(phone).boundingBox()]);
        return titleBox.y > nameBox.y + nameBox.height && phoneBox.y > titleBox.y + titleBox.height;
      }).toBe(true);
      await field(phone).hover({ position: { x: 140, y: 5 } });
      const add = page.getByRole("button", { name: "Dodaj kontakt", exact: true });
      await add.click();
      await page.getByRole("menuitem", { name: "GitHub", exact: true }).click();
      const githubIcon = page.locator('[data-page-canvas] img[src$="/github.png"]');
      await expect(githubIcon).toBeVisible();
      const github = page.locator('[data-page-canvas] [data-placeholder="github.com/profil"]');
      await github.hover({ position: { x: 140, y: 5 } });
      await page.getByRole("button", { name: "Usuń kontakt: GitHub", exact: true }).click();
      await field(element).focus();
      await field(element).press("F2");
      await field(element).fill(element.content);
      await field(element).press("Escape");
    }
    await page.screenshot({ path: testInfo.outputPath("compact-masthead-restored.png") });
    const saving = page.waitForRequest((request) => request.method() === "PUT"
      && new URL(request.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    const payload = (await saving).postDataJSON();
    const band = payload.root.find((element) => element.contactBand).contactBand;
    const first = payload.root.find((element) => element.element_id === phone.element_id);
    expect(band.anchor.startY).toBeCloseTo(first.top, 3);
    expect(payload.root.find((element) => element.element_id === name.element_id).top).toBe(24);
    api.assertHermetic();
  });
}
}
