import { applyStarterElementStructure } from "../src/utils/starterElementStructure.js";
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
    // Backend-generated wizard payload, not a demo with only its name cleared.
    const starter = JSON.parse(await readFile(new URL("./fixtures/editorial-starters.json", import.meta.url), "utf8"));
    const elements = empty
      ? applyStarterElementStructure(materializeElementSpecs(starter.templates[id], () => `identity-${++serial}`), starter.cvData, id)
      : materializeElementSpecs(template, () => `identity-${++serial}`);
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
      const divider = elements.find((element) => element.id === `${id}-masthead-divider`);
      const headings = elements.filter((element) => element.flowRole === "section-chrome" && element.category === "text");
      const assertFloor = async () => {
        const floor = await field(divider).evaluate((node) => Number.parseFloat(node.style.top) + 14);
        for (const heading of headings) {
          expect(await field(heading).evaluate((node) => Number.parseFloat(node.style.top))).toBeGreaterThanOrEqual(floor - 0.1);
        }
      };
      for (const element of [name, title, phone]) {
        await field(element).focus();
        await field(element).press("F2");
        for (const value of ["Jan", "Jan Kowalski", "Very long professional identity ".repeat(8), ""]) {
          await field(element).fill(value);
          await assertFloor();
        }
        await field(element).press("Escape");
        await assertFloor();
      }
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

for (const id of ["regent", "meridian"]) {
  test(`${id}: freshly created wizard document keeps sections below contacts while typing`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    const starter = JSON.parse(await readFile(new URL("./fixtures/editorial-starters.json", import.meta.url), "utf8"));
    await page.route("**/api/ai/fill_template", (route) => route.fulfill({ json: { elements: starter.templates[id] } }));
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({ body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)), contentType: "image/png" });
    });
    await login(page);
    await page.getByRole("button", { name: /Utwórz nowe CV/ }).click();
    const setup = page.getByRole("dialog", { name: "Utwórz CV" });
    if (id === "regent") await setup.getByRole("button", { name: "Więcej szablonów" }).click();
    await setup.getByRole("radio", { name: new RegExp(id, "i") }).check();
    await setup.getByRole("button", { name: "Rozpocznij edycję" }).click();
    const name = page.locator('[data-page-canvas] [data-placeholder="Imię i nazwisko"]');
    await expect(name).toBeVisible();
    const summary = page.getByText("PODSUMOWANIE ZAWODOWE", { exact: true });
    const location = page.locator('[data-page-canvas] img[src$="/location.png"]');
    for (const value of ["J", "Jan Kowalski", "Very long professional name ".repeat(8), "", "Jan Kowalski"]) {
      await name.fill(value);
      await expect.poll(async () => {
        const [heading, contact] = await Promise.all([summary.boundingBox(), location.boundingBox()]);
        return heading.y - (contact.y + contact.height);
      }).toBeGreaterThan(0);
    }
    await name.press("Escape");
    api.assertHermetic();
  });
}
