import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mockApi.js";

const nameField = (page) => page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]');
const claimDialog = (page) => page.getByRole("dialog", { name: "Czy ten szkic należy do Ciebie?" });

async function prepareDownload(page) {
  await page.goto("/");
  await page.locator("#top").getByRole("link", { name: "Stwórz CV z tym szablonem", exact: true }).click();
  await expect(nameField(page)).toBeFocused();
  await nameField(page).fill("Anna Nowak");
  // Do not wait for autosave: the output action must flush the latest edits.
  await page.getByRole("button", { name: "Pobierz PDF", exact: true }).click();
  await page.getByRole("dialog", { name: "Pobierz CV jako plik PDF" })
    .getByRole("button", { name: "Utwórz darmowe konto", exact: true }).click();
  await expect(page).toHaveURL(/\/register\?start=download$/);
}

async function register(page) {
  await page.getByLabel("Nazwa użytkownika").fill("Kamil");
  await page.getByLabel("E-mail").fill("anna@example.com");
  await page.getByLabel("Hasło", { exact: true }).fill("local-test-password");
  await page.getByRole("button", { name: "Utwórz konto i przejdź do PDF" }).click();
}

for (const width of [390, 834, 1280, 1920, 640]) {
  test(`first CV: landing to one confirmed download at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 640 ? 480 : 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await installMockApi(page);
    await prepareDownload(page);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Nazwa użytkownika").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("E-mail")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Hasło", { exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`registration-${width}.png`), fullPage: true });
    await register(page);
    await expect(claimDialog(page)).toBeVisible();
    const confirm = claimDialog(page).getByRole("button", { name: "To moje CV — pobierz PDF" });
    await expect(confirm).toBeFocused();
    expect(api.calls.filter((call) => /render_pdf|create_pdf|update_pdf/.test(call.path))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`claim-${width}.png`), fullPage: true });
    const download = page.waitForEvent("download");
    await confirm.click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
    await expect(claimDialog(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Jak chcesz zacząć?" })).toHaveCount(0);
    const exports = api.calls.filter((call) => call.path === "/pdf/render_pdf");
    expect(exports).toHaveLength(1);
    expect(exports[0].body).toContain("Anna Nowak");
    expect(exports[0].body).not.toContain("To moje CV");
    expect(api.calls.filter((call) => /create_pdf|update_pdf/.test(call.path))).toEqual([]);
    expect(api.calls.filter((call) => call.path === "/auth/token")).toHaveLength(1);
    expect(JSON.parse(api.calls.find((call) => call.path === "/auth/register").body).plan).toBe("free");
    api.assertHermetic();
  });
}

test("failed automatic login keeps the account and the download intent", async ({ page }) => {
  const api = await installMockApi(page);
  await prepareDownload(page);
  await page.route("**/api/auth/token", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Spróbuj ponownie" }) }));
  await register(page);
  await expect(page).toHaveURL(/\/login\?registered=1&start=download$/);
  await expect(page.getByRole("status")).toContainText("Konto zostało utworzone");
  await page.unroute("**/api/auth/token");
  await page.getByLabel("Nazwa użytkownika").fill("Kamil");
  await page.getByLabel("Hasło", { exact: true }).fill("local-test-password");
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(claimDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(claimDialog(page)).toHaveCount(0);
  expect(api.calls.filter((call) => call.path === "/auth/register")).toHaveLength(1);
  expect(api.calls.filter((call) => call.path === "/pdf/render_pdf")).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("cvstudio.guest.doc"))).toContain("Anna Nowak");
  api.assertHermetic();
});

test("export failure keeps the restored CV and retries only on request", async ({ page }) => {
  const api = await installMockApi(page);
  await prepareDownload(page);
  await register(page);
  let attempts = 0;
  await page.route("**/api/pdf/render_pdf", (route) => {
    attempts++;
    return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: { code: "plan_export_limit", message: "Limit pobrań PDF" } }) });
  });
  await claimDialog(page).getByRole("button", { name: "To moje CV — pobierz PDF" }).click();
  await expect(page.getByText("Limit planu", { exact: true })).toBeVisible();
  expect(attempts).toBe(1);
  await expect(page.getByText("Anna Nowak", { exact: true })).toHaveCSS("visibility", "visible");
  await page.unroute("**/api/pdf/render_pdf");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz PDF", exact: true }).click();
  await download;
  expect(api.calls.filter((call) => call.path === "/pdf/render_pdf")).toHaveLength(1);
  api.assertHermetic();
});

test("a returning guest must confirm replacement and cancellation retains the draft", async ({ page }) => {
  const api = await installMockApi(page);
  await prepareDownload(page);
  await page.goto("/");
  await page.locator("#top").getByRole("link", { name: "Stwórz CV z tym szablonem", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Utworzyć nowe CV?" });
  await expect(confirmation).toBeVisible();
  expect(api.calls.filter((call) => call.path === "/ai/fill_template")).toHaveLength(1);
  await confirmation.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(page).toHaveURL("/");
  expect(await page.evaluate(() => localStorage.getItem("cvstudio.guest.doc"))).toContain("Anna Nowak");
  api.assertHermetic();
});

test("registration failure preserves fields and never starts login or export", async ({ page }) => {
  const api = await installMockApi(page);
  await prepareDownload(page);
  await page.route("**/api/auth/register", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: "Nazwa użytkownika jest zajęta." }) }));
  await register(page);
  await expect(page.getByRole("alert")).toContainText("Nazwa użytkownika jest zajęta");
  await expect(page.getByLabel("E-mail")).toHaveValue("anna@example.com");
  await expect(page.getByRole("button", { name: "Utwórz konto i przejdź do PDF" })).toBeEnabled();
  expect(api.calls.filter((call) => /auth\/token|render_pdf/.test(call.path))).toEqual([]);
  api.assertHermetic();
});

for (const start of ["new", "import"]) {
  test(`ordinary registration auto-login preserves ${start} intent`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.goto(`/register?start=${start}`);
    await expect(page.getByRole("tab", { name: /Darmowy/ })).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("Nazwa użytkownika").fill("Kamil");
    await page.getByLabel("E-mail").fill("anna@example.com");
    await page.getByLabel("Hasło", { exact: true }).fill("local-test-password");
    await page.getByRole("button", { name: "Utwórz konto", exact: true }).click();
    await expect(page).toHaveURL(/\/cvstudio\/Kamil/);
    if (start === "new") await expect(page.getByRole("dialog", { name: "Utwórz CV" })).toBeVisible();
    else await expect(page.locator('input[type="file"]')).toHaveCount(1);
    api.assertHermetic();
  });
}
