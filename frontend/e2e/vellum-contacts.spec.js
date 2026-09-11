import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { vellumTemplate } from "../src/templates/vellum.js";
import { materializeElementSpecs } from "../src/utils/materializeElementSpecs.js";
import { installMockApi, login, SAVED_DOCUMENT } from "./support/mockApi.js";

for (const width of [390, 834, 1280, 1920]) {
  test(`Vellum contacts wrap, edit and save together at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let serial = 0;
    const elements = materializeElementSpecs(vellumTemplate, () => `vellum-e2e-${++serial}`);
    const contacts = elements.filter((element) => element.contactChannel && element.category === "textarea");
    const api = await installMockApi(page, {
      savedDocument: { ...SAVED_DOCUMENT, template_id: "vellum", cv_data: null },
      savedElements: elements.map((element) => ({ ...element, extra_properties: { ...element } })),
    });
    await page.route("**/template-assets/**", async (route) => {
      const asset = new URL(route.request().url()).pathname.split("/template-assets/")[1];
      await route.fulfill({ body: await readFile(new URL(`../../backend/template_assets/${asset}`, import.meta.url)), contentType: "image/png" });
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    const email = contacts.find((contact) => contact.contactChannel === "email");
    const field = page.locator(`[id="${email.element_id}"]`);
    await expect(field).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const expectGeometry = async () => {
      const geometry = await page.evaluate((ids) => ids.map((id) => {
        const node = document.getElementById(id);
        const box = node.getBoundingClientRect();
        const scale = box.width / node.offsetWidth;
        // Measure authored glyphs only: editor hover pseudo-elements expand
        // scrollWidth even when the document content fits its own field.
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const rects = [];
        while (walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          rects.push(...range.getClientRects());
        }
        return {
          left: parseFloat(node.style.left), top: parseFloat(node.style.top),
          width: parseFloat(node.style.width), height: parseFloat(node.style.height),
          overflowX: Math.max(0, ...rects.map((rect) => rect.right - box.right)) / scale,
          overflowY: Math.max(0, ...rects.map((rect) => rect.bottom - box.bottom)) / scale,
        };
      }), contacts.map((contact) => contact.element_id));
      for (let index = 0; index < geometry.length; index++) {
        expect(geometry[index].left).toBe(68);
        expect(geometry[index].width).toBe(338);
        expect(geometry[index].overflowX).toBeLessThanOrEqual(1);
        expect(geometry[index].overflowY).toBeLessThanOrEqual(1);
        if (index) expect(geometry[index].top).toBeGreaterThanOrEqual(geometry[index - 1].top + geometry[index - 1].height + 2);
      }
      return geometry;
    };
    await expectGeometry();
    await field.focus();
    await field.press("F2");
    await expect(field).toHaveAttribute("contenteditable", "true");
    const longEmail = `${"long-address".repeat(35)}@example.com`;
    await field.fill(longEmail);
    await field.press("Escape");
    await expect(field).toHaveText(longEmail);
    const grown = await expectGeometry();
    expect(grown[1].height).toBeGreaterThan(20);
    await page.screenshot({ path: testInfo.outputPath("vellum-contact-list.png") });

    // Keyboard editing uses the shared textarea surface even when edit zoom
    // remounts the page. Returning to short text must reclaim the wrapped rows.
    await field.focus();
    await field.press("F2");
    await field.fill("new-address@example.com");
    await field.press("Escape");
    const shortened = await expectGeometry();
    expect(shortened[1].height).toBeLessThan(grown[1].height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const saved = page.waitForRequest((request) => request.method() === "PUT" && new URL(request.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    const payload = (await saved).postDataJSON();
    expect(payload.root.find((element) => element.element_id === email.element_id).content).toBe("new-address@example.com");
    expect(payload.root.find((element) => element.contactBand)?.contactBand.flow.bodyTop).toBeGreaterThan(152);
    for (const contact of contacts) {
      const rendered = payload.render_root.find((element) => element.element_id === contact.element_id);
      expect(rendered.category).toBe("textarea");
      expect(rendered.left + rendered.width).toBe(406);
    }
    api.assertHermetic();
  });
}
