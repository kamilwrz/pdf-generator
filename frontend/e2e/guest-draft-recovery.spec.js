import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mockApi.js";

const titleField = (page) => page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
const confirmation = (page) => page.getByRole("dialog", { name: "Utworzyć nowe CV?" });
const storedDraft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cvstudio.guest.doc") || "null"));

async function authorDraft(page) {
  await page.goto("/cvstudio/guest?start=new&template=linden");
  await page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]').fill("Anna Zachowana");
  await titleField(page).fill("Szkic Anny");
  await expect.poll(async () => (await storedDraft(page))?.title).toBe("Szkic Anny");
}

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 950 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 640, height: 400 }]) {
  test(`guest draft can resume from confirmation and landing at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await authorDraft(page);
    const original = await storedDraft(page);
    const trigger = page.getByRole("button", { name: "Nowe CV", exact: true });
    for (const action of ["resume", "escape", "close", "cancel-setup"]) {
      await trigger.click();
      const dialog = confirmation(page);
      await expect(dialog).toContainText("Rozpoczęcie edycji nowego CV zastąpi obecny szkic.");
      await expect(dialog.getByRole("button", { name: "Wróć do obecnego CV" })).toBeFocused();
      const bounds = await dialog.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      if (action === "resume") {
        await page.screenshot({ path: `../tmp/guest-recovery-${viewport.width}.png` });
        await dialog.getByRole("button", { name: "Wróć do obecnego CV" }).click();
      } else if (action === "escape") {
        await page.keyboard.press("Escape");
      } else if (action === "close") {
        await dialog.getByRole("button", { name: "Zamknij: Utworzyć nowe CV?" }).click();
      } else {
        await dialog.getByRole("button", { name: "Utwórz nowe CV" }).click();
        await page.getByRole("button", { name: "Anuluj", exact: true }).click();
      }
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(titleField(page)).toHaveValue("Szkic Anny");
      expect((await storedDraft(page)).elements).toEqual(original.elements);
    }
    await page.goto("/");
    await page.getByRole("link", { name: "Wróć do szkicu CV" }).click();
    await expect(titleField(page)).toHaveValue("Szkic Anny");
    await expect(page.getByText("Anna Zachowana", { exact: true })).toHaveCSS("visibility", "visible");
    await page.goto("/cvstudio/guest?start=new&template=sterling");
    await confirmation(page).getByRole("button", { name: "Wróć do obecnego CV" }).click();
    await expect(titleField(page)).toHaveValue("Szkic Anny");
    await page.reload();
    await expect(titleField(page)).toHaveValue("Szkic Anny");
    expect(api.calls.filter((call) => /fill_template/.test(call.path))).toHaveLength(1);
    api.assertHermetic();
  });
}

test("guest draft is replaced only after successful explicit creation", async ({ page }) => {
  const api = await installMockApi(page);
  await authorDraft(page);
  const original = await storedDraft(page);
  await page.getByRole("button", { name: "Nowe CV", exact: true }).click();
  await confirmation(page).getByRole("button", { name: "Utwórz nowe CV" }).click();
  await page.route("**/api/ai/fill_template", (route) => route.fulfill({ status: 500, json: { detail: "Błąd tworzenia" } }), { times: 1 });
  await page.getByRole("button", { name: "Rozpocznij edycję" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  expect((await storedDraft(page)).elements).toEqual(original.elements);
  await page.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await storedDraft(page))?.templateId).toBe("meridian");
  await page.reload();
  await expect(page.getByText("Anna Zachowana", { exact: true })).toHaveCount(0);
  expect((await storedDraft(page)).templateId).toBe("meridian");
  api.assertHermetic();
});
