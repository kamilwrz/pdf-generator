import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_ELEMENTS, SAVED_DOCUMENT } from "./support/mockApi.js";

const before = "Projektuję i tworzę czytelne interfejsy użytkownika w React dla 30 klientów.";
const after = "Tworzę czytelne interfejsy React dla 30 klientów.";
const summary = [
  { element_id: "summary-heading", category: "text", content: "PODSUMOWANIE", top: 370, height: 14,
    flowRole: "section-chrome", editorSectionType: "summary", bold: true },
  { element_id: "summary-body", category: "textarea", content: before, top: 400, height: 48,
    flowRole: "content", autoHeight: true, cvDataBindings: [{ path: ["summary"] }] },
].map((element) => ({ ...element, left: 250, width: 280, fontSize: 10, lineHeight: 14, page: 1,
  extra_properties: { ...element, lineHeight: 14 } }));

async function openDocument(page, options = {}) {
  const api = await installMockApi(page, {
    savedElements: [...SAVED_ELEMENTS, ...summary],
    savedDocument: { ...SAVED_DOCUMENT, cv_data: { ...SAVED_DOCUMENT.cv_data, summary: before } },
    assistantResponses: [{ message: "Skrócono opis bez zmiany liczb i technologii.",
      scoped_corrections: [{ fragment_id: "summary-body:0", before, content: after }],
      achievement_templates: [], ...options.response }],
  });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  await expect(page.locator("#summary-body")).toBeVisible();
  return api;
}

async function openMenu(page, headingId = "summary-heading") {
  await page.locator(`#${headingId}`).scrollIntoViewIfNeeded();
  await page.locator(`#${headingId}`).dispatchEvent("pointerenter");
  const toolbar = page.locator(`[data-canvas-toolbar-key="heading:${headingId}"]`);
  await toolbar.getByRole("button", { name: "AI dla wybranego zakresu" }).click();
  await expect(page.getByRole("menu", { name: "Operacje AI" })).toBeVisible();
  return toolbar;
}

for (const width of [390, 834, 1280, 1920]) {
  test(`scoped AI preview, minimal request and undo at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const api = await openDocument(page);
    const toolbar = await openMenu(page);
    expect(api.calls.filter((call) => call.path === "/ai/assistant")).toHaveLength(0);
    await expect(page.getByRole("menuitem")).toHaveCount(3);
    await expect(page.getByRole("menuitem", { name: "Skróć", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Popraw styl" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toolbar.getByRole("button", { name: "AI dla wybranego zakresu" })).toBeFocused();
    await toolbar.getByRole("button", { name: "AI dla wybranego zakresu" }).click();
    await page.getByRole("menuitem", { name: "Skróć", exact: true }).click();
    const panel = page.locator("[data-scoped-ai-panel]");
    await expect(panel.getByRole("button", { name: "Zastosuj wszystkie" })).toBeEnabled();
    await expect(page.locator("[data-canvas-toolbar-key]")).toHaveCount(0);
    await expect(page.locator("#summary-body")).toContainText(before);
    const request = api.calls.find((call) => call.path === "/ai/assistant");
    const payload = JSON.parse(request.body);
    expect(Object.keys(payload).sort()).toEqual(["action", "scoped_content"]);
    expect(payload.scoped_content.fragments).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toMatch(/Kamil Smoke|Figma|fontSize|cv_data|left/);
    expect(request.headers["idempotency-key"]).toBeTruthy();
    const bounds = await panel.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1001);
    await page.screenshot({ path: testInfo.outputPath(`scoped-ai-${width}.png`) });
    await panel.getByRole("button", { name: "Zastosuj wszystkie" }).click();
    await expect(page.locator("#summary-body")).toContainText(after);
    await panel.getByRole("button", { name: "Zamknij", exact: true }).click();
    await page.keyboard.press("Control+z");
    await expect(page.locator("#summary-body")).toContainText(before);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator("#summary-body")).toContainText(after);
    const saveRequest = page.waitForRequest((request) => request.method() === "PUT" && request.url().endsWith("/api/pdf/update_pdf"));
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const saved = (await saveRequest).postDataJSON();
    expect(saved.cv_data.summary).toBe(after);
    expect(saved.render_root.find((element) => element.element_id === "summary-body").content).toBe(after);
    expect(JSON.stringify(saved.render_root)).not.toMatch(/scoped_content|achievement_templates|Zastosuj wszystkie/);
    expect(errors).toEqual([]);
    expect(api.unexpected).toEqual([]);
    expect(api.productionRequests).toEqual([]);
  });
}

test("skills entry targets only its category", async ({ page }) => {
  const api = await openDocument(page, { response: { scoped_corrections: [], achievement_templates: [] } });
  await page.locator("#skills-tools-title").hover();
  const toolbar = page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]');
  await toolbar.getByRole("button", { name: "AI dla wybranego zakresu" }).click();
  await page.getByRole("menuitem", { name: "Polepsz", exact: true }).click();
  await expect(page.getByText("Brak zmian do zastosowania. AI nie znalazło bezpiecznej poprawki.")).toBeVisible();
  const payload = JSON.parse(api.calls.find((call) => call.path === "/ai/assistant").body);
  expect(payload.action).toBe("improve");
  expect(payload.scoped_content.kind).toBe("entry");
  expect(payload.scoped_content.fragments.map((fragment) => fragment.content)).toEqual(["Figma", "Miro"]);
  expect(payload.scoped_content.records[0].context).toEqual(["Narzędzia"]);
});

test("achievement templates stay separate and AI menus fit at 200% canvas zoom", async ({ page }, testInfo) => {
  await openDocument(page, { response: { achievement_templates: [{ fragment_id: "summary-body:0",
    template: "Projektuję interfejsy React; [potwierdzony rezultat].", questions: ["Jak zmierzyłeś rezultat?"] }] } });
  const zoom = page.getByRole("button", { name: "Powiększ", exact: true });
  for (let count = 0; count < 4; count += 1) await zoom.click();
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Polepsz", exact: true }).click();
  const panel = page.locator("[data-scoped-ai-panel]");
  await expect(panel.getByText("Wzór do uzupełnienia")).toBeVisible();
  await panel.getByRole("button", { name: "Zastosuj wszystkie" }).click();
  await expect(page.locator("#summary-body")).toContainText(after);
  await expect(page.locator("#summary-body")).not.toContainText("[potwierdzony rezultat]");
  await page.screenshot({ path: testInfo.outputPath("scoped-ai-200-percent.png") });
});
