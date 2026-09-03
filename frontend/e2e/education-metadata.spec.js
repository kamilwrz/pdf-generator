import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT, SAVED_ELEMENTS } from "./support/mockApi.js";

for (const width of [390, 820, 1366, 1920]) {
  test(`edits two Education hints at ${width}px without changing separate fields`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const row = {
      element_id: "education-meta", category: "textarea", content: "", left: 62, top: 220,
      width: 300, height: 14, fontSize: 10, lineHeight: 14, fontFamily: "Inter", color: "#161616",
      page: 1, autoHeight: true, placeholder: "Miasto · RRRR – RRRR", starterPlaceholder: true,
      cvDataBindings: ["city", "period"].map((field) => ({ path: ["education", 0, field] })),
    };
    const separate = [
      { ...row, element_id: "education-degree", content: "Informatyka", top: 170, placeholder: "Kierunek lub dyplom", cvDataBindings: [{ path: ["education", 0, "degree"] }] },
      { ...row, element_id: "education-school", content: "Politechnika", top: 195, placeholder: "Nazwa uczelni lub szkoły", cvDataBindings: [{ path: ["education", 0, "school"] }] },
      { ...row, element_id: "rail-period", top: 270, placeholder: "RRRR – RRRR", flowRole: "record-overlay", cvDataBindings: [{ path: ["education", 1, "period"] }] },
    ];
    const savedDocument = {
      ...SAVED_DOCUMENT,
      cv_data: { ...SAVED_DOCUMENT.cv_data, education: [{ degree: "Informatyka", school: "Politechnika", city: "", period: "", description: "" }] },
    };
    const api = await installMockApi(page, {
      documents: [savedDocument], savedDocument,
      savedElements: [SAVED_ELEMENTS[0], ...[row, ...separate].map((element) => ({ ...element, extra_properties: { ...element } }))],
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
    for (const element of separate) {
      await expect(page.locator(`#${element.element_id} [data-metadata-slot]`)).toHaveCount(0);
    }
    const field = page.locator("#education-meta");
    await expect(field.locator("[data-metadata-slot]")).toHaveCount(2);
    await field.locator('[data-metadata-slot="1"]').click();
    await expect(field).toHaveAccessibleName("Wykształcenie: miasto i okres");
    await expect(field.locator('[data-empty="true"]')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("education-hints.png") });
    await page.keyboard.type("2019-2022");
    await expect(field.locator('[data-metadata-slot="1"]')).toHaveText("2019-2022");
    await expect(field.locator('[data-metadata-slot="0"]')).toHaveAttribute("data-empty", "true");
    await page.screenshot({ path: testInfo.outputPath("education-period-only.png") });
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.type("Wroclaw");
    await expect(field).toHaveText("Wroclaw · 2019-2022");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Backspace");
    await expect(field).toHaveText("Wroclaw · 2019-2022");
    await page.keyboard.press("Control+a");
    await field.evaluate((node) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "Warszawa · 2020–2024");
      node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
    });
    await expect(field).toHaveText("Warszawa · 2020–2024");
    await page.keyboard.press("Control+z");
    await expect(field).toHaveText("Wroclaw · 2019-2022");
    await page.keyboard.press("Control+Shift+z");
    await expect(field).toHaveText("Warszawa · 2020–2024");
    if (width === 1366) {
      const initialHeight = (await field.boundingBox()).height;
      await page.keyboard.press("Control+a");
      await page.keyboard.insertText("Bardzo długa nazwa lokalizacji ".repeat(5));
      await expect(field.locator('[data-empty="true"]')).toHaveCount(1);
      await expect.poll(async () => (await field.boundingBox()).height).toBeGreaterThan(initialHeight);
      await page.screenshot({ path: testInfo.outputPath("education-wrapped.png") });
    }
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await expect(field).toHaveText(" · ");
    await expect(field.locator('[data-empty="true"]')).toHaveCount(2);
    await field.locator('[data-metadata-slot="1"]').click();
    await page.keyboard.type("2025");
    await page.keyboard.press("Tab");
    await expect(field).not.toBeFocused();
    const request = page.waitForRequest((r) => r.method() === "PUT" && new URL(r.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const payload = (await request).postDataJSON();
    expect(payload.root.find((element) => element.element_id === row.element_id).content).toBe(" · 2025");
    expect(payload.render_root.find((element) => element.element_id === row.element_id).content).toBe("2025");
    expect(payload.cv_data.education[0]).toMatchObject({ city: "", period: "2025", degree: "Informatyka", school: "Politechnika" });
    api.assertHermetic();
  });
}
