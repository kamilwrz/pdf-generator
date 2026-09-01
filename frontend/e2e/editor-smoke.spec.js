import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

test.describe("CV Studio editor smoke", () => {
  test("logs in, opens a document, saves its revision, downloads, and guards dirty work", async ({ page }) => {
    const api = await installMockApi(page);
    await login(page);

    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Moje dokumenty" })).toBeVisible();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
    await expect(title).toHaveValue("CV Smoke");

    const updateRequest = page.waitForRequest((request) => (
      request.method() === "PUT" && new URL(request.url()).pathname === "/api/pdf/update_pdf"
    ));
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const update = await updateRequest;
    expect(update.postDataJSON()).toMatchObject({
      pdf_id: 41,
      expected_revision: 3,
      pdf_title: "CV Smoke.pdf",
    });
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();

    const renderRequest = page.waitForRequest((request) => (
      request.method() === "POST" && new URL(request.url()).pathname === "/api/pdf/render_pdf"
    ));
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Pobierz PDF" }).click();
    const [render, download] = await Promise.all([renderRequest, downloadEvent]);
    expect(render.postDataJSON()).toMatchObject({ pdf_id: 41, pdf_title: "CV Smoke.pdf" });
    expect(download.suggestedFilename()).toBe("CV Smoke.pdf");

    await title.fill("CV Smoke zmienione");
    await page.getByRole("button", { name: "Wyloguj się" }).click();
    const dirtyDialog = page.getByRole("alertdialog", { name: "Niezapisane zmiany" });
    await expect(dirtyDialog).toBeVisible();
    await dirtyDialog.getByRole("button", { name: "Wróć do edycji" }).click();
    await expect(title).toHaveValue("CV Smoke zmienione");
    await expect(page).toHaveURL(/\/cvstudio\/Kamil/);

    await page.getByRole("button", { name: "Wyloguj się" }).click();
    await page.getByRole("alertdialog", { name: "Niezapisane zmiany" })
      .getByRole("button", { name: "Odrzuć zmiany" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    api.assertHermetic();
  });

  test("creates a blank document with a request-scoped idempotency key", async ({ page }) => {
    const api = await installMockApi(page);
    await login(page);

    await page.getByRole("button", { name: /Otwórz pusty canvas/ }).click();
    const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
    await title.fill("Nowy dokument smoke");

    const createRequest = page.waitForRequest((request) => (
      request.method() === "POST" && new URL(request.url()).pathname === "/api/pdf/create_pdf"
    ));
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const create = await createRequest;
    const idempotencyKey = create.headers()["idempotency-key"];
    expect(idempotencyKey).toBeTruthy();
    expect(idempotencyKey.length).toBeLessThanOrEqual(128);
    expect(create.postDataJSON()).toMatchObject({
      pdf_title: "Nowy dokument smoke.pdf",
      editor_mode: "freeform",
      template_id: null,
    });
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    api.assertHermetic();
  });

  test("deletes and restores a skills category through the real editor controls", async ({ page }) => {
    const api = await installMockApi(page);
    await login(page);

    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    const toolsTitle = page.locator("#skills-tools-title");
    const toolsBody = page.locator("#skills-tools-body");
    await expect(toolsTitle).toHaveText("Narzędzia");
    // The category title is both a section and record trigger in legacy
    // subcategory graphs. Hover the body member so the test exercises the
    // record toolbar without intentionally competing for the single shared
    // structural-toolbar slot.
    await toolsBody.hover();

    const recordToolbar = page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]');
    const moreActions = recordToolbar.getByRole("button", { name: "Więcej działań" });
    // The keyed anchor is intentionally zero-sized; the toolbar itself is
    // portalled outside the scaled A4 page and is the visible contract.
    await expect(moreActions).toBeVisible();
    await moreActions.click();
    await recordToolbar.getByRole("menuitem", { name: "Usuń wpis" }).click();

    await expect(toolsTitle).toHaveCount(0);
    const deletionToast = page.getByRole("status").filter({
      hasText: "Usunięto wpis „Narzędzia”",
    });
    await expect(deletionToast).toBeVisible();
    await deletionToast.getByRole("button", { name: "Cofnij" }).click();

    const restoredToolsTitle = page.locator("#skills-tools-title");
    await expect(restoredToolsTitle).toHaveText("Narzędzia");
    // The historical maximum-depth loop appeared one effect turn after a
    // category returned while its tombstones were still present. Re-focusing
    // the production control proves the editor remains responsive after sync.
    await page.waitForTimeout(250);
    await page.locator("#skills-tools-body").hover();
    await expect(page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]')
      .getByRole("button", { name: "Więcej działań" }))
      .toBeVisible();
    api.assertHermetic();
  });
});
