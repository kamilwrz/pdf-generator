import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

const accountChooser = (page) => page.getByRole("heading", { name: "Jak chcesz zacząć?" });
const importGate = (page) => page.getByRole("dialog", { name: "Kontynuuj import na swoim koncie" });

for (const width of [390, 834, 1280, 1920]) {
  test(`guest new CV and import account gate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Utwórz nowe CV", exact: true }).click();
    const setup = page.getByRole("dialog", { name: "Skonfiguruj nowe CV" });
    await expect(setup).toBeVisible();
    await expect(accountChooser(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    const trigger = page.getByRole("button", { name: "Importuj PDF", exact: true });
    await trigger.click();
    const gate = importGate(page);
    await expect(gate).toBeVisible();
    await expect(gate.getByText("Na tym etapie nie wybieramy pliku i nie zmieniamy obecnego dokumentu.")).toBeVisible();
    await expect(gate.getByText("1 import")).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(gate.getByRole("button", { name: "Utwórz darmowe konto" })).toBeFocused();
    const box = await gate.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await gate.getByRole("button", { name: "Utwórz darmowe konto", exact: true }).click();
    await expect(page).toHaveURL(/\/register\?start=import$/);
    expect(api.calls.filter((call) => /extract_cv|import-history/.test(call.path))).toEqual([]);
    api.assertHermetic();
  });
}

test("guest authored A4 survives refresh without account onboarding", async ({ page }) => {
  const api = await installMockApi(page);
  await page.goto("/cvstudio/guest?start=new");
  await page.getByRole("button", { name: "Utwórz A4", exact: true }).click();
  const name = page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]');
  await expect(name).toBeFocused();
  await name.fill("Anna Gość");
  const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
  await title.fill("Mój szkic gościa");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("cvstudio.guest.doc") || "null")?.title)).toBe("Mój szkic gościa");
  await page.reload();
  await expect(title).toHaveValue("Mój szkic gościa");
  // Authored single-line text has a zero-height baseline box for PDF parity.
  // Verify the restored content and visibility style rather than its box size.
  await expect(page.getByText("Anna Gość", { exact: true })).toHaveCSS("visibility", "visible");
  await expect(accountChooser(page)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.calls.filter((call) => /extract_cv|create_pdf|update_pdf/.test(call.path))).toEqual([]);
  api.assertHermetic();
});

for (const path of ["/cvstudio/guest?start=import", "/cvstudio/OtherUser?start=import", "/pdfcanvas?start=import"]) {
  test(`guest import deep link is gated: ${path}`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.goto(path);
    await expect(importGate(page)).toBeVisible();
    await expect(page).toHaveURL(/\/cvstudio\/guest$/);
    await expect(accountChooser(page)).toHaveCount(0);
    await importGate(page).getByRole("button", { name: "Zaloguj się", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?start=import$/);
    await page.getByLabel("Nazwa użytkownika").fill("Kamil");
    await page.getByLabel("Hasło").fill("local-test-password");
    await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
    await expect(page).toHaveURL(/\/cvstudio\/Kamil/);
    await expect(importGate(page)).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
    api.assertHermetic();
  });
}

test("fresh guest reload stays in editor while login retains account onboarding", async ({ page }) => {
  const api = await installMockApi(page);
  await page.goto("/cvstudio/guest");
  await page.reload();
  await expect(page.getByRole("button", { name: "Nowe CV", exact: true })).toBeVisible();
  await expect(accountChooser(page)).toHaveCount(0);
  await login(page);
  await expect(accountChooser(page)).toBeVisible();
  api.assertHermetic();
});
