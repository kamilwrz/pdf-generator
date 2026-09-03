import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT, SAVED_ELEMENTS } from "./support/mockApi.js";

/** Exercise real Chromium editing rather than synthesizing contentEditable input. */
for (const width of [390, 820, 1366, 1920]) {
test(`edits three independent Experience hints at ${width}px and preserves save/export`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  const bindings = ["company", "city", "period"].map((field) => ({ path: ["experience", 0, field] }));
  const metadata = {
    element_id: "experience-meta", category: "textarea", content: "", left: 62, top: 135,
    width: 470, height: 14, fontSize: 10, lineHeight: 14, fontFamily: "Inter", color: "#161616",
    page: 1, autoHeight: true, placeholder: "Nazwa firmy · Miasto · MM RRRR – obecnie",
    starterPlaceholder: true, cvDataBindings: bindings,
  };
  const savedDocument = {
    ...SAVED_DOCUMENT,
    cv_data: { ...SAVED_DOCUMENT.cv_data, experience: [{ company: "", city: "", period: "", title: "Developer", bullets: [] }] },
  };
  const api = await installMockApi(page, {
    documents: [savedDocument], savedDocument,
    savedElements: [...SAVED_ELEMENTS, { ...metadata, extra_properties: { ...metadata } }],
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  const field = page.locator("#experience-meta");
  await field.locator('[data-metadata-slot="2"]').click();
  await expect(field).toHaveAttribute("contenteditable", "true");
  await expect(field).toBeFocused();
  await expect(field.locator('[data-empty="true"]')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("metadata-hints.png") });
  await page.keyboard.type("2020-2024");
  await expect(field.locator('[data-metadata-slot="2"]')).toHaveText("2020-2024");
  await expect(field.locator('[data-metadata-slot="0"]')).toHaveAttribute("data-empty", "true");
  await expect(field.locator('[data-metadata-slot="1"]')).toHaveAttribute("data-empty", "true");
  await page.screenshot({ path: testInfo.outputPath("metadata-partial.png") });

  await field.locator('[data-metadata-slot="0"]').click();
  await page.keyboard.type("Firma");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Wroclaw");
  await expect(field).toHaveText("Firma · Wroclaw · 2020-2024");
  await page.keyboard.press("Control+z");
  await expect(field).toHaveText("Firma · Wrocla · 2020-2024");
  await page.keyboard.press("Control+Shift+z");
  await expect(field).toHaveText("Firma · Wroclaw · 2020-2024");
  await page.screenshot({ path: testInfo.outputPath("metadata-filled.png") });

  // Backspace at a slot boundary moves to the preceding slot; it cannot erase
  // either dot or merge location with company, including on touch keyboards.
  await field.locator('[data-metadata-slot="1"]').evaluate((slot) => {
    const selection = window.getSelection();
    selection.setPosition(slot.firstChild, 0);
  });
  await page.keyboard.press("Backspace");
  await expect(field).toHaveText("Firma · Wroclaw · 2020-2024");
  await page.keyboard.press("Control+a");
  await field.evaluate((node) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "Nowa firma · Warszawa · 2022–2026");
    node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(field).toHaveText("Nowa firma · Warszawa · 2022–2026");
  await page.keyboard.press("Control+z");
  await expect(field).toHaveText("Firma · Wroclaw · 2020-2024");
  if (width === 1366) {
    const initialHeight = (await field.boundingBox()).height;
    await page.keyboard.press("Control+a");
    await field.evaluate((node) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "Międzynarodowa firma technologiczna ".repeat(6));
      node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
    });
    await expect(field.locator('[data-empty="true"]')).toHaveCount(2);
    await expect.poll(async () => (await field.boundingBox()).height).toBeGreaterThan(initialHeight);
    await page.screenshot({ path: testInfo.outputPath("metadata-wrapped.png") });
  }

  await page.keyboard.press("Home");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await expect(field).toHaveText(" ·  · ");
  await expect(field.locator('[data-empty="true"]')).toHaveCount(3);
  await field.locator('[data-metadata-slot="2"]').click();
  await page.keyboard.type("2025");
  await page.keyboard.press("Escape");
  const request = page.waitForRequest((r) => r.method() === "PUT" && new URL(r.url()).pathname === "/api/pdf/update_pdf");
  await page.getByRole("button", { name: "Zapisz dokument" }).click();
  const payload = (await request).postDataJSON();
  expect(payload.root.find((e) => e.element_id === metadata.element_id).content).toBe(" ·  · 2025");
  expect(payload.render_root.find((e) => e.element_id === metadata.element_id).content).toBe("2025");
  expect(payload.cv_data.experience[0]).toMatchObject({ company: "", city: "", period: "2025" });
  api.assertHermetic();
});
}
