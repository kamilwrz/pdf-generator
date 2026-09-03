import { expect, test } from "@playwright/test";
import {
  installMockApi,
  login,
  SAVED_DOCUMENT,
  SAVED_ELEMENTS,
} from "./support/mockApi.js";

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

  test("configures a new A4 CV, edits name and an empty contact, and saves the editor graph", async ({ page }) => {
    const api = await installMockApi(page);
    await login(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: /Utwórz nowe CV/ }).click();
    const setup = page.getByRole("dialog", { name: "Skonfiguruj nowe CV" });
    await expect(setup).toBeVisible();
    await expect(setup.getByRole("radio", { name: /Meridian/ })).toBeChecked();

    // Exercise both accessible reorder paths. The buttons remain the reliable
    // keyboard/touch fallback for native pointer drag-and-drop.
    await setup.getByRole("button", { name: "Przenieś Doświadczenie niżej" }).click();
    await expect(setup.getByText(/Doświadczenie: pozycja 3/)).toBeVisible();
    const projects = setup.locator("li").filter({ hasText: "Projekty" });
    const summary = setup.locator("li").filter({ hasText: "Podsumowanie" });
    await projects.dragTo(summary);

    await setup.getByRole("radio", { name: /Slate/ }).click();
    await setup.getByRole("checkbox", { name: /Zdjęcie/ }).check();
    await setup.getByRole("radio", { name: /Meridian/ }).click();
    await expect(setup.getByText(/nie obsługuje zdjęcia/)).toBeVisible();

    const fillRequest = page.waitForRequest((request) => (
      request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/fill_template"
    ));
    await setup.getByRole("button", { name: "Utwórz A4" }).click();
    const fill = await fillRequest;
    expect(fill.postDataJSON()).toMatchObject({
      template_id: "meridian",
      cv_data: { email: "cvstart-email@example.invalid" },
    });

    const name = page.locator('[contenteditable="true"][data-placeholder="Imię i nazwisko"]');
    await expect(name).toBeFocused();
    await name.evaluate((node) => {
      node.textContent = "Kamil Nowak";
      node.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: "Kamil Nowak",
      }));
    });
    await expect(name).toHaveText("Kamil Nowak");
    const closedInspector = page.locator('[data-editor-inspector-state="closed"]');
    await expect(closedInspector).toBeVisible();
    await expect(page.locator('[data-editor-inspector-state="open"]')).toHaveCount(0);
    const closedInspectorBox = await closedInspector.boundingBox();
    expect(closedInspectorBox?.width).toBeLessThanOrEqual(194);
    expect(closedInspectorBox?.height).toBeLessThanOrEqual(54);

    // Advanced parameters are opt-in on desktop and mobile. Escape collapses
    // the panel without clearing the selected canvas element.
    await page.getByRole("button", { name: /Otwórz parametry elementu:/ }).click();
    const openInspector = page.locator('[data-editor-inspector-state="open"]');
    await expect(openInspector).toBeVisible();
    const openInspectorBox = await openInspector.boundingBox();
    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 720) {
      expect(openInspectorBox?.height).toBeLessThanOrEqual(Math.floor(viewport.height * 0.46) + 2);
    } else {
      expect(openInspectorBox?.width).toBeLessThanOrEqual(274);
      expect(openInspectorBox?.height).toBeLessThanOrEqual(422);
    }
    await page.keyboard.press("Escape");
    await expect(closedInspector).toBeVisible();
    const reopenInspector = page.getByRole("button", {
      name: /Otwórz parametry elementu:/,
    });
    await expect(reopenInspector).toBeFocused();
    await reopenInspector.click();
    await expect(openInspector).toBeVisible();

    const email = page.locator('[data-placeholder="imie.nazwisko@email.com"]');
    await email.click();
    await expect(closedInspector).toBeVisible();
    await expect(email).toHaveAttribute("contenteditable", "true");
    await expect(email).toBeFocused();
    await page.keyboard.type("kamil.nowak@example.com");
    await expect(email).toHaveText("kamil.nowak@example.com");
    const focusColor = "rgb(21, 94, 239)";
    await expect.poll(() => email.evaluate((node) => (
      getComputedStyle(node, "::after").outlineColor
    ))).toBe(focusColor);

    const title = page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" });
    await title.fill("Nowe CV smoke");
    // Leaving inline editing keeps the field selected. Its overlay must stay
    // blue instead of falling back to the editor's brown brand accent.
    const selectionFrame = page.locator('[aria-hidden="true"] > [class*="_frame_"]').first();
    await expect(selectionFrame).toBeVisible();
    await expect(selectionFrame).toHaveCSS("border-top-color", focusColor);

    const createRequest = page.waitForRequest((request) => (
      request.method() === "POST" && new URL(request.url()).pathname === "/api/pdf/create_pdf"
    ));
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const create = await createRequest;
    const idempotencyKey = create.headers()["idempotency-key"];
    expect(idempotencyKey).toBeTruthy();
    expect(idempotencyKey.length).toBeLessThanOrEqual(128);
    expect(create.postDataJSON()).toMatchObject({
      pdf_title: "Nowe CV smoke.pdf",
      editor_mode: "template",
      template_id: "meridian",
    });
    expect(create.postDataJSON().root[0]).toMatchObject({
      content: "Kamil Nowak",
      starterPlaceholder: false,
    });
    expect(create.postDataJSON()).toHaveProperty("render_root");
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    api.assertHermetic();
  });

  test("deletes and restores a skills category through the real editor controls", async ({ page }) => {
    const api = await installMockApi(page);
    await login(page);

    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    const toolsTitle = page.locator("#skills-tools-title");
    await expect(toolsTitle).toHaveText("Narzędzia");
    // The category label owns structural record actions, while its body owns
    // the centred Skills entry action. This keeps both toolbars discoverable
    // without racing for the one shared canvas slot.
    await toolsTitle.hover();

    const recordToolbar = page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]');
    const moreActions = recordToolbar.getByRole("button", { name: "Więcej działań" });
    // The keyed anchor is intentionally zero-sized; the toolbar itself is
    // portalled outside the scaled A4 page and is the visible contract.
    await expect(moreActions).toBeVisible();
    const recordControlBox = await moreActions.boundingBox();
    expect(Math.abs(recordControlBox.height - 28.8)).toBeLessThan(0.2);
    await moreActions.evaluate((button) => button.click());
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
    await page.locator("#skills-tools-title").hover();
    await expect(page.locator('[data-canvas-toolbar-key="record:skills-tools-title"]')
      .getByRole("button", { name: "Więcej działań" }))
      .toBeVisible();
    api.assertHermetic();
  });

  test("creates correctly sized skill chips through the layout modal", async ({ page }) => {
    const placeholderDocument = {
      ...SAVED_DOCUMENT,
      cv_data: {
        ...SAVED_DOCUMENT.cv_data,
        skills: [
          { category: "", items: ["React"] },
          { category: "", items: [] },
        ],
      },
    };
    const placeholderElements = SAVED_ELEMENTS.map((element) => {
      if (["skills-tools-title", "skills-technologies-title"].includes(element.element_id)) {
        return {
          ...element,
          content: "",
          placeholder: "Kategoria umiejętności",
          starterPlaceholder: true,
          extra_properties: {
            ...element.extra_properties,
            placeholder: "Kategoria umiejętności",
            starterPlaceholder: true,
          },
        };
      }
      if (element.element_id === "skills-tools-body") {
        return { ...element, content: "React" };
      }
      if (element.element_id === "skills-technologies-body") {
        return {
          ...element,
          content: "",
          placeholder: "Umiejętność",
          starterPlaceholder: true,
          extra_properties: {
            ...element.extra_properties,
            placeholder: "Umiejętność",
            starterPlaceholder: true,
          },
        };
      }
      return element;
    });
    const api = await installMockApi(page, {
      documents: [placeholderDocument],
      savedDocument: placeholderDocument,
      savedElements: placeholderElements,
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    // Legacy generated headings have no semantic section type. Renaming must
    // stamp it before the visible label stops matching "Umiejętności", so all
    // Skills controls continue to work under a user-defined section name.
    const skillsHeading = page.locator("#skills-heading");
    await skillsHeading.focus();
    await page.keyboard.press("Enter");
    await expect(skillsHeading).toHaveAttribute("contenteditable", "true");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("PROJEKTY");
    await page.keyboard.press("Escape");
    await expect(skillsHeading).toHaveText("PROJEKTY");

    // The authored heading uses cap-height alignment whose DOM box can be
    // reported as zero-height by headless Chromium even though the glyphs are
    // visible. Dispatch the same pointer-enter event observed by the shared
    // canvas toolbar so this regression remains about modal chip geometry.
    await page.locator("#skills-heading").dispatchEvent("pointerenter");
    const sectionToolbar = page.locator('[data-canvas-toolbar-key="heading:skills-heading"]');
    const sectionMoreActions = sectionToolbar.getByRole("button", { name: "Więcej działań" });
    const sectionControlBox = await sectionMoreActions.boundingBox();
    expect(Math.abs(sectionControlBox.height - 28.8)).toBeLessThan(0.2);
    await sectionMoreActions.click();
    await sectionToolbar.getByRole("menuitem", { name: "Styl umiejętności: w linii" }).click();
    const modal = page.getByRole("dialog", { name: "Styl umiejętności" });
    await modal.getByRole("button", { name: /^Chipsy/ }).click();

    await expect(page.locator('[data-placeholder="Kategoria umiejętności"]')).toHaveCount(2);
    const emptyChip = page.locator('[data-placeholder="Umiejętność"]');
    await expect(emptyChip).toHaveCount(1);
    await expect(emptyChip).toBeVisible();
    const reactLabel = page.getByText("React", { exact: true });
    await expect(reactLabel).toHaveCount(1);
    const chipGeometry = await reactLabel.evaluate((label) => {
      const labelRect = label.getBoundingClientRect();
      // Chip labels intentionally use cap-centre positioning and can expose a
      // zero-height DOM box. Locate the visual shape by the invariant 10px
      // authored left inset and the shared vertical centre, independent of
      // generated IDs or portalled toolbar siblings.
      const shapeRect = [...document.querySelectorAll("div[id]")]
        .map((candidate) => candidate.getBoundingClientRect())
        .filter((rect) => (
          rect.width > 0
          && labelRect.left - rect.left > 2
          && labelRect.left - rect.left < 30
          && rect.top <= labelRect.top + 1
          && rect.bottom >= labelRect.top - 1
        ))
        .sort((a, b) => (
          Math.abs(labelRect.left - a.left) - Math.abs(labelRect.left - b.left)
        ))[0];
      return {
        labelRight: labelRect.right,
        shapeRight: shapeRect?.right ?? 0,
        shapeWidth: shapeRect?.width ?? 0,
        shapeBottom: shapeRect?.bottom ?? 0,
      };
    });
    expect(chipGeometry.shapeWidth).toBeGreaterThan(40);
    expect(chipGeometry.shapeRight).toBeGreaterThan(chipGeometry.labelRight);
    // Chip text uses optical cap-centre positioning and can expose a zero DOM
    // height in headless Chromium. Keyboard focus exercises the production
    // focus-in trigger without relying on Playwright's pointer actionability
    // heuristics, keeping this assertion focused on toolbar geometry.
    await reactLabel.focus();
    const chipAddButton = page.locator(
      '[data-canvas-toolbar-key^="skills-entry:skills-heading:"]',
    ).getByRole("button", { name: "Dodaj umiejętność" });
    await expect(chipAddButton).toBeVisible();
    const chipToolbarEdgeDelta = await chipAddButton.evaluate((button, shapeBottom) => {
      const buttonRect = button.getBoundingClientRect();
      return buttonRect.top + buttonRect.height / 2 - shapeBottom;
    }, chipGeometry.shapeBottom);
    expect(Math.abs(chipToolbarEdgeDelta)).toBeLessThan(1);

    await emptyChip.focus();
    const emptyGroupToolbar = page.locator(
      '[data-canvas-toolbar-key^="skills-entry:skills-heading:"]',
    ).filter({ has: page.getByRole("button", { name: "Dodaj umiejętność", exact: true }) }).last();
    await emptyGroupToolbar.getByRole("button", { name: "Dodaj umiejętność", exact: true }).click();
    await emptyGroupToolbar.getByRole("textbox", { name: "Nowa umiejętność" }).fill("TypeScript");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-placeholder="Umiejętność"]')).toHaveCount(0);
    await expect(page.getByText("TypeScript", { exact: true })).toHaveCount(1);

    const firstCategory = page.locator('[data-placeholder="Kategoria umiejętności"]').first();
    await expect(firstCategory).toHaveAttribute("data-skills-field", "true");
    await firstCategory.click();
    await expect(firstCategory).toBeFocused();
    const activeChrome = await firstCategory.evaluate((element) => {
      const style = getComputedStyle(element);
      return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
    });
    expect(activeChrome.boxShadow).not.toBe("none");
    expect(activeChrome.boxShadow).toContain("rgba(21, 94, 239, 0.22)");
    expect(activeChrome.outlineStyle).not.toBe("none");
    await page.keyboard.press("Escape");
    await firstCategory.hover();
    const categoryToolbar = page.locator(
      `[data-canvas-toolbar-key="record:${await firstCategory.getAttribute("id")}"]`,
    );
    await expect(categoryToolbar.getByRole("button", { name: "Dodaj wpis poniżej" })).toBeVisible();
    await expect(categoryToolbar.getByRole("button", { name: "Przenieś wyżej" })).toBeDisabled();
    await expect(categoryToolbar.getByRole("button", { name: "Przenieś niżej" })).toBeEnabled();
    await expect(categoryToolbar.getByRole("button", { name: "Więcej działań" })).toBeVisible();
    await categoryToolbar.getByRole("button", { name: "Dodaj wpis poniżej" }).click();
    await expect(page.locator('[data-placeholder="Kategoria umiejętności"]')).toHaveCount(3);
    await expect(page.locator('[data-placeholder="Umiejętność"]')).toHaveCount(1);
    api.assertHermetic();
  });

  test("adds a skill through a grouped canvas form", async ({ page }) => {
    const api = await installMockApi(page);
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    const toolsBody = page.locator("#skills-tools-body");
    const toolsCategory = page.locator("#skills-tools-title");
    await expect(toolsBody).toHaveAttribute("data-skills-field", "true");
    await expect(toolsCategory).toHaveAttribute("data-skills-field", "true");
    await toolsBody.hover();
    const skillsHighlight = page.locator('[data-canvas-highlight-level="skills"]');
    await expect(skillsHighlight).toBeVisible();
    const skillsHoverShadow = await skillsHighlight.evaluate((element) => (
      getComputedStyle(element).boxShadow
    ));
    expect(skillsHoverShadow).toContain("rgba(22, 22, 22, 0.22)");
    await expect(toolsBody).toHaveAttribute("aria-keyshortcuts", "Shift+F10");
    await toolsBody.hover();
    const groupedToolbar = page.locator(
      '[data-canvas-toolbar-key="skills-entry:skills-heading:skills-tools"]',
    );
    const addButton = groupedToolbar.getByRole("button", {
      name: "Dodaj umiejętność do kategorii Narzędzia",
    });
    await expect(addButton).toBeVisible();
    const inlineGeometry = await Promise.all([
      toolsBody.boundingBox(),
      addButton.boundingBox(),
    ]);
    expect(Math.abs(
      inlineGeometry[0].x + inlineGeometry[0].width / 2
      - (inlineGeometry[1].x + inlineGeometry[1].width / 2),
    )).toBeLessThan(1);
    expect(Math.abs(
      inlineGeometry[0].y + inlineGeometry[0].height
      - (inlineGeometry[1].y + inlineGeometry[1].height / 2),
    )).toBeLessThan(1);
    await addButton.click();
    const groupedInput = groupedToolbar.getByRole("textbox", { name: "Nowa umiejętność" });
    await expect(groupedInput).toBeFocused();
    await expect(groupedToolbar.getByRole("button", { name: "Dodaj umiejętność", exact: true }))
      .toBeDisabled();
    await groupedInput.fill("Anulowany wpis");
    await page.keyboard.press("Escape");
    await expect(groupedInput).toHaveCount(0);
    await expect(addButton).toBeFocused();

    await addButton.click();
    await groupedToolbar.getByRole("textbox", { name: "Nowa umiejętność" })
      .fill("Poza formularzem");
    await page.getByRole("textbox", { name: "Nazwa bieżącego dokumentu" }).click();
    await expect(groupedToolbar).toHaveCount(0);

    await toolsBody.hover();
    await addButton.click();
    const activeInput = groupedToolbar.getByRole("textbox", { name: "Nowa umiejętność" });
    await activeInput.fill("figma");
    await page.keyboard.press("Enter");
    await expect(groupedToolbar.getByRole("alert")).toHaveText(
      "Ta umiejętność już znajduje się w tej kategorii.",
    );
    await activeInput.fill("  Git   Flow  ");
    await page.keyboard.press("Enter");
    await expect(toolsBody).toHaveText("Figma  ·  Miro  ·  Git Flow");

    const updateRequest = page.waitForRequest((request) => (
      request.method() === "PUT" && new URL(request.url()).pathname === "/api/pdf/update_pdf"
    ));
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const update = await updateRequest;
    expect(update.postDataJSON().cv_data.skills[0].items).toEqual(["Figma", "Miro", "Git Flow"]);
    api.assertHermetic();
  });

  test("adds a skill to a category-free section", async ({ page }) => {
    const flatDocument = {
      ...SAVED_DOCUMENT,
      id: 42,
      title: "CV Flat Skills.pdf",
      cv_data: { ...SAVED_DOCUMENT.cv_data, skills: ["React", "TypeScript"] },
    };
    const flatElements = [
      {
        element_id: "flat-name",
        category: "text",
        content: "Kamil Smoke",
        left: 250,
        top: 90,
        width: 280,
        height: 28,
        fontSize: 22,
        page: 1,
      },
      {
        element_id: "flat-skills-heading",
        category: "text",
        content: "UMIEJĘTNOŚCI",
        flowRole: "section-chrome",
        left: 250,
        top: 180,
        width: 280,
        height: 14,
        fontSize: 10,
        page: 1,
        bold: true,
        extra_properties: {
          bold: true,
          lineHeight: 12,
          flowRole: "section-chrome",
        },
      },
      {
        element_id: "flat-skills-rule",
        category: "line",
        flowRole: "section-chrome",
        left: 250,
        top: 198,
        width: 280,
        height: 1,
        page: 1,
        extra_properties: { flowRole: "section-chrome" },
      },
      {
        element_id: "flat-skills-body",
        category: "textarea",
        content: "React  ·  TypeScript",
        flowRole: "content",
        left: 250,
        top: 210,
        width: 280,
        height: 14,
        fontSize: 9,
        lineHeight: 12,
        autoHeight: true,
        page: 1,
        extra_properties: {
          autoHeight: true,
          lineHeight: 12,
          flowRole: "content",
        },
      },
    ];
    const api = await installMockApi(page, {
      documents: [flatDocument],
      savedDocument: flatDocument,
      savedElements: flatElements,
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
    await page.getByRole("button", { name: "Powiększ" }).click();
    await page.getByRole("button", { name: "Powiększ" }).click();
    await page.getByRole("button", { name: "Powiększ" }).click();
    await page.getByRole("button", { name: "Powiększ" }).click();
    await expect(page.getByText("200%", { exact: true })).toBeVisible();

    const body = page.locator("#flat-skills-body");
    await expect(body).toHaveAttribute("aria-keyshortcuts", "Shift+F10");
    await body.focus();
    await page.keyboard.press("Shift+F10");
    const toolbar = page.locator(
      '[data-canvas-toolbar-key="skills-entry:flat-skills-heading:flat:flat-skills-body"]',
    );
    await toolbar.getByRole("button", { name: "Dodaj umiejętność", exact: true }).click();
    await toolbar.getByRole("textbox", { name: "Nowa umiejętność" }).fill("Node.js");
    await page.keyboard.press("Enter");
    await expect(body).toHaveText("React  ·  TypeScript  ·  Node.js");
    api.assertHermetic();
  });
});
