import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT, SAVED_ELEMENTS } from "./support/mockApi.js";

const guidance = "Opisz najważniejsze osiągnięcie i pokaż konkretny rezultat swojej pracy.";
const fields = [
  { id: "hint-text", category: "text", placeholder: "Nazwa firmy", top: 180 },
  { id: "hint-plain", category: "textarea", placeholder: guidance, top: 240 },
  { id: "hint-bullet", category: "textarea", placeholder: guidance, top: 350, bulletList: true },
];

// Real contentEditable deletion leaves browser-owned <br>/paragraph wrappers.
// Verify computed pseudo-content and height, not just persisted hint metadata.
for (const width of [390, 768, 1280, 1920]) {
  test(`restores CV advice after clearing fields at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const savedElements = [SAVED_ELEMENTS[0], ...fields.map((field) => ({
      element_id: field.id, category: field.category, content: "", page: 1,
      left: 250, top: field.top, width: 180, height: 60, fontSize: 12, lineHeight: 16,
      extra_properties: {
        placeholder: field.placeholder, starterPlaceholder: true,
        autoHeight: true, bulletList: !!field.bulletList, lineHeight: 16,
      },
    }))];
    const api = await installMockApi(page, { savedElements, savedDocument: SAVED_DOCUMENT });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    for (const field of fields) {
      const node = page.locator(`[id="${field.id}"]`);
      // Include leaving an untouched field and repeated fill/delete cycles.
      for (const text of ["", "Moje osiągnięcie", "Kolejna treść"]) {
        await node.focus();
        await node.press("F2");
        await expect(node).toHaveAttribute("contenteditable", "true");
        if (text) {
          await node.pressSequentially(text);
          await node.press("ControlOrMeta+a");
          await node.press("Backspace");
        }
        await node.press("Escape");
        await expect(node).not.toHaveAttribute("contenteditable", "true");
        await expect.poll(() => node.evaluate((el) => getComputedStyle(el, "::before").content))
          .toBe(JSON.stringify(field.placeholder));
        await expect(node).toHaveText("");
        if (field.category === "textarea") {
          expect(await node.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
        }
      }
    }
    const request = page.waitForRequest((req) => req.method() === "PUT"
      && new URL(req.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const payload = (await request).postDataJSON();
    for (const field of fields) {
      expect(payload.root.find((el) => el.element_id === field.id).content.trim()).toBe("");
      expect((payload.render_root || payload.root).some((el) => el.content?.includes(field.placeholder))).toBe(false);
    }
    api.assertHermetic();
  });
}
