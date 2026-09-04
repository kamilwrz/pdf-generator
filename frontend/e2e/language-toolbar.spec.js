import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_ELEMENTS } from "./support/mockApi.js";

// Reopen both persisted representations. The Add Section preset deliberately
// uses custom-grid storage, while generated languages belong to cv_data.
for (const gridKind of ["languages", "entries"]) {
  test(`${gridKind}: language actions follow every cell through editing and insertion`, async ({ page }) => {
    const languageElements = [
      {
        element_id: "language-heading", category: "text", content: "Języki",
        left: 250, top: 380, width: 280, height: 14, fontSize: 10,
        bold: true, flowRole: "section-chrome", editorSectionLayout: "grid",
        editorSectionType: "languages", gridKind, editorGridColumns: 2,
        editorGridRecordWidth: 280, editorGridBodyLeft: 250,
      },
      ...["Polski", "Angielski"].map((content, index) => ({
        element_id: `language-${index}`, category: "textarea", content,
        left: 250 + index * 144, top: 408, width: 136, height: 18,
        fontSize: 10, lineHeight: 14, autoHeight: true,
        flowRole: "grid-member", flowGroup: "language-row", gridKind,
        editorGridEntry: true, editorSectionId: "language-heading",
      })),
    ].map((element) => ({ ...element, page: 1, extra_properties: { ...element } }));
    const api = await installMockApi(page, { savedElements: [...SAVED_ELEMENTS, ...languageElements] });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    // Measure actual screen coordinates: CSS source assertions alone cannot
    // catch a Languages preset being routed into the generic gutter branch.
    const expectBelowCell = async (cell) => {
      const id = await cell.getAttribute("id");
      const actions = page.locator(`[data-canvas-toolbar-key="grid-entry:${id}"]`);
      const add = actions.getByRole("button", { name: "Dodaj wpis" });
      const remove = actions.getByRole("button", { name: "Usuń wpis" });
      await expect(add).toBeVisible();
      await expect.poll(async () => {
        const [box, toolbarBox] = await Promise.all([
          cell.boundingBox(), actions.locator(":scope > div").boundingBox(),
        ]);
        if (!box || !toolbarBox) return 999;
        const centre = toolbarBox.x + toolbarBox.width / 2;
        return Math.max(Math.abs(centre - box.x - box.width / 2),
          Math.abs(toolbarBox.y - box.y - box.height - 18));
      }).toBeLessThan(3);
      return { add, remove };
    };

    for (const id of ["language-0", "language-1"]) {
      const cell = page.locator(`[id="${id}"]`);
      await cell.hover();
      await expectBelowCell(cell);
      await cell.click();
      await expect(cell).toHaveAttribute("contenteditable", "true");
      await expectBelowCell(cell);
    }
    const cell = page.locator('[id="language-1"]');
    const originalViewport = page.viewportSize();
    for (const width of [834, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await cell.hover();
      await expectBelowCell(cell);
    }
    await page.setViewportSize(originalViewport);
    await cell.click();
    await cell.press("Shift+F10");
    const { add } = await expectBelowCell(cell);
    await expect(add).toBeFocused();
    await add.click();
    const inserted = page.locator('[data-placeholder="Język · Poziom"]');
    await expect(inserted).toHaveCount(1);
    await inserted.hover();
    const { remove } = await expectBelowCell(inserted);
    await remove.click();
    await expect(inserted).toHaveCount(0);
    api.assertHermetic();
  });
}
