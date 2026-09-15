import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { installMockApi, SAVED_DOCUMENT } from "./support/mockApi.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/interview-fit.json", import.meta.url), "utf8"));
const templateFixture = JSON.parse(readFileSync(new URL("./fixtures/interview-templates.json", import.meta.url), "utf8"));

test.setTimeout(90_000);

/** Read authored CSS units so temporary edit zoom cannot conceal geometry drift. */
async function geometry(node) {
  return node.evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: parseFloat(style.height), top: parseFloat(style.top),
      lineHeight: parseFloat(style.lineHeight) };
  });
}

/** Generation hides the canvas while fonts load; compare the revealed layout. */
async function waitForGeneratedCanvas(page, node) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(async () => {
    const { isCanvasEnterReflowSuppressed } = await import("/src/utils/canvasEnter.js");
    return isCanvasEnterReflowSuppressed();
  })).toBe(false);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(node).toHaveCSS("opacity", "1");
}

for (const width of [390, 834, 1280, 1920]) {
  test(`generated textarea geometry remains stable after typing at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: width === 1280 ? "no-preference" : "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("token", "local-playwright-token");
      localStorage.setItem("cvstudio.uiLanguage", "pl");
    });
    await installMockApi(page);
    await page.goto("/");
    // Use the real generation/fitting transaction with real loaded browser
    // fonts, then reopen its exact persisted elements in the production editor.
    const fitted = await page.evaluate(async (data) => {
      const { prepareInterviewFit } = await import("/src/utils/interviewFit.js");
      // Styled spans participate in real wrapping, including long bullets;
      // switches between display spans and editable spans must agree too.
      for (const element of data.elements) if (["fit-fixture-21", "fit-fixture-26"].includes(element.element_id)) {
        element.runs = [{ start: 0, end: 12, bold: true }, { start: 14, end: 31, italic: true }];
      }
      return prepareInterviewFit({ template_id: "linden", spacing_px: {},
        preview: { ...data, fit: { allow_shorten: false } } });
    }, fixture);
    const savedDocument = { ...SAVED_DOCUMENT, template_id: "linden", cv_data: fixture.cv_data,
      spacing_px: fitted.spacing_px, pages: Math.max(...fitted.elements.map((element) => element.page || 1)) };
    const api = await installMockApi(page, { savedDocument,
      savedElements: fitted.elements.map((element) => ({ ...element, extra_properties: element })) });
    await page.goto("/app/documents/41");
    if (width === 834) await page.addStyleTag({ content: "html { font-size: 200%; }" });
    const initial = page.locator('[id="fit-fixture-24"]');
    await expect(initial).toBeAttached({ timeout: 25_000 });
    await waitForGeneratedCanvas(page, initial);
    const measurements = [];
    // Fractional sidebar line heights, ordinary paragraphs, metadata and bullet
    // grids must all retain the generation contract on the first keystroke.
    for (const id of ["fit-fixture-10", "fit-fixture-24", "fit-fixture-25", "fit-fixture-21", "fit-fixture-26"]) {
      const node = page.locator(`[id="${id}"]`);
      const before = await geometry(node);
      const next = page.locator('[id="fit-fixture-27"]');
      const downstreamBefore = await geometry(next);
      const legacyMeasurement = await node.evaluate((element) => {
        const previous = element.style.height;
        element.style.height = "auto";
        const measured = { naturalHeight: parseFloat(getComputedStyle(element).height),
          legacyScrollHeight: element.scrollHeight };
        element.style.height = previous;
        return measured;
      });
      await node.focus();
      await node.press("F2");
      await expect(node).toHaveAttribute("contenteditable", "true");
      expect(await geometry(node), `${id}: focus preserves generated geometry`).toEqual(before);
      await node.press("ControlOrMeta+End");
      await node.pressSequentially("x");
      await expect.poll(() => geometry(node), { message: `${id}: unchanged wraps preserve height after typing` }).toEqual(before);
      expect(await geometry(next), `${id}: unchanged wraps preserve downstream geometry`).toEqual(downstreamBefore);
      await node.press("Escape");
      await expect(node).not.toHaveAttribute("contenteditable", "true");
      expect(await geometry(node), `${id}: blur preserves generated height`).toEqual(before);
      for (let repeat = 0; repeat < 2; repeat += 1) {
        await node.focus();
        await node.press("F2");
        await expect(node).toHaveAttribute("contenteditable", "true");
        if (repeat === 0) {
          await node.press("ControlOrMeta+End");
          await node.press("Backspace");
        }
        await node.press("Escape");
        await expect(node).not.toHaveAttribute("contenteditable", "true");
        expect(await geometry(node), `${id}: repeat focus/blur cannot accumulate rounding`).toEqual(before);
      }
      measurements.push({ id, generatedHeight: before.height, ...legacyMeasurement });
    }
    await testInfo.attach("generation-and-browser-measurements", {
      body: JSON.stringify({ width, measurements }, null, 2), contentType: "application/json",
    });
    // A trailing empty line is real editable content. It must survive blur;
    // deleting that line must restore both the field and the following record.
    for (const id of ["fit-fixture-21", "fit-fixture-26"]) {
      const node = page.locator(`[id="${id}"]`);
      const next = page.locator('[id="fit-fixture-27"]');
      const before = await geometry(node);
      const downstreamBefore = await geometry(next);
      await node.focus();
      await node.press("F2");
      await expect(node).toHaveAttribute("contenteditable", "true");
      await node.press("ControlOrMeta+End");
      await node.press("Enter");
      // Enter twice exits a bullet list into an authored blank paragraph. A
      // single bare bullet is intentionally discarded by the existing editor.
      if (id === "fit-fixture-26") await node.press("Enter");
      await expect.poll(async () => (await geometry(node)).height).toBeGreaterThan(before.height);
      const grown = await geometry(node);
      expect(grown.height - before.height).toBeGreaterThanOrEqual(Math.floor(before.lineHeight));
      expect(grown.height - before.height).toBeLessThanOrEqual(Math.ceil(before.lineHeight));
      if (id === "fit-fixture-21" && [390, 1280].includes(width)) {
        await page.screenshot({ path: testInfo.outputPath(`edited-textarea-${width}.png`) });
      }
      await node.press("Escape");
      await expect(node).not.toHaveAttribute("contenteditable", "true");
      await expect.poll(() => geometry(node), { message: `${id}: trailing empty line survives blur` }).toEqual(grown);
      await node.focus();
      await node.press("F2");
      await expect(node).toHaveAttribute("contenteditable", "true");
      await node.press("ControlOrMeta+End");
      await node.press("Backspace");
      await node.press("Escape");
      await expect(node).not.toHaveAttribute("contenteditable", "true");
      await expect.poll(() => geometry(node), { message: `${id}: deleting newline shrinks to generated height` }).toEqual(before);
      expect(await geometry(next), `${id}: deleting newline restores downstream position`).toEqual(downstreamBefore);
    }
    // Clearing all content is different from authoring blank paragraphs. The
    // latter must retain their insertion lines instead of becoming guidance.
    const blank = page.locator('[id="fit-fixture-21"]');
    await blank.focus();
    await blank.press("F2");
    await expect(blank).toHaveAttribute("contenteditable", "true");
    await blank.press("ControlOrMeta+a");
    await blank.press("Backspace");
    await blank.press("Enter");
    await blank.press("Enter");
    await expect.poll(async () => {
      const current = await geometry(blank);
      return current.height === Math.ceil(current.lineHeight * 3);
    }).toBe(true);
    const blankHeight = await geometry(blank);
    await blank.pressSequentially(" ");
    await expect.poll(() => geometry(blank), { message: "A space inside authored blank rows must retain their measured height" }).toEqual(blankHeight);
    await blank.press("Escape");
    await expect(blank).not.toHaveAttribute("contenteditable", "true");
    expect(await geometry(blank)).toEqual(blankHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    api.assertHermetic();
  });
}

test("natural measurement excludes real hover CSS and rounds fractional lines upwards at every zoom", async ({ page }, testInfo) => {
  const api = await installMockApi(page);
  await page.goto("/");
  const measurements = await page.evaluate(async () => {
    const { measureNaturalTextHeight } = await import("/src/utils/textareaHeight.js");
    const { default: classes } = await import("/src/components/canvas/Textarea/Textarea.module.css");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const rows = [];
    try {
      for (const zoom of [1, 1.4, 2.8]) {
        host.style.transform = `scale(${zoom})`;
        for (const mode of ["display", "hover", "edit"]) {
          const element = document.createElement("div");
          element.className = mode === "edit" ? classes.editing
            : `${classes.block} ${mode === "hover" ? classes.editorHoverOutline : ""}`;
          element.style.cssText = `position:relative;width:240px;height:37px;min-height:0;font:9px/12.04px Arial;--canvas-hover-padding:${4 / zoom}px;--canvas-hover-scale:${zoom};--canvas-hover-inverse-scale:${1 / zoom};`;
          element.textContent = "Administrative documentation";
          host.appendChild(element);
          const measured = measureNaturalTextHeight(element);
          const restored = element.style.height;
          element.style.height = "auto";
          rows.push({ zoom, mode, measured, restored, legacyScrollHeight: element.scrollHeight,
            naturalHeight: parseFloat(getComputedStyle(element).height) });
          element.remove();
        }
      }
      for (const lines of [25, 50]) for (const bullet of [false, true]) {
        const element = document.createElement("div");
        element.className = classes.editing;
        element.style.cssText = "position:relative;width:240px;height:37px;font:9px/12.04px Arial;";
        if (bullet) {
          const { bulletRunsToEditableHtml } = await import("/src/utils/editableSerialize.js");
          element.innerHTML = bulletRunsToEditableHtml(Array(lines).fill("• One line").join("\n"));
        } else element.textContent = Array(lines).fill("One line").join("\n");
        host.appendChild(element);
        rows.push({ zoom: 2.8, mode: bullet ? "long bullets" : "long plain", lines,
          measured: measureNaturalTextHeight(element), restored: element.style.height });
        element.remove();
      }
    } finally {
      host.remove();
    }
    return rows;
  });
  for (const row of measurements) {
    expect(row.measured, `${row.mode} at ${row.zoom}`).toBe(Math.ceil((row.lines || 1) * 12.04));
    expect(row.restored).toBe("37px");
  }
  expect(measurements.find((row) => row.zoom === 1 && row.mode === "display").legacyScrollHeight).toBe(12);
  expect(measurements.find((row) => row.zoom === 1 && row.mode === "hover").legacyScrollHeight).toBeGreaterThan(13);
  await testInfo.attach("fractional-height-and-hover-proof", {
    body: JSON.stringify(measurements, null, 2), contentType: "application/json",
  });
  api.assertHermetic();
});

test("switching the template preserves freshly generated heights through typing and saving", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("token", "local-playwright-token");
    localStorage.setItem("cvstudio.uiLanguage", "pl");
  });
  const source = templateFixture.response.candidates.find((candidate) => candidate.template_id === "sterling");
  const target = templateFixture.response.candidates.find((candidate) => candidate.template_id === "regent");
  const api = await installMockApi(page, {
    savedDocument: { ...SAVED_DOCUMENT, cv_data: templateFixture.cv_data },
    savedElements: source.elements.map((element) => ({ ...element, extra_properties: element })),
  });
  await page.route("**/api/ai/fill_template", async (route) => {
    expect(route.request().postDataJSON().template_id).toBe("regent");
    await route.fulfill({ json: { elements: target.elements } });
  });
  await page.goto("/app/documents/41");
  const filling = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/ai/fill_template");
  await page.getByRole("button", { name: "Następny szablon: Regent", exact: true }).click();
  await filling;
  await expect(page.getByRole("button", { name: "Następny szablon: Regent", exact: true })).toHaveCount(0);
  const sample = target.elements.find((element) => element.category === "textarea"
    && element.content === "Specjalistka");
  expect(sample).toBeTruthy();
  const displayed = page.locator("[data-page-canvas]").getByText(sample.content, { exact: true }).first();
  await expect(displayed).toBeAttached({ timeout: 25_000 });
  const generatedId = await displayed.getAttribute("id");
  const node = page.locator(`[id="${generatedId}"]`);
  await waitForGeneratedCanvas(page, node);
  const before = await geometry(node);
  await node.focus();
  await node.press("F2");
  await expect(node).toHaveAttribute("contenteditable", "true");
  await node.press("ControlOrMeta+End");
  await node.pressSequentially("x");
  await expect.poll(() => geometry(node)).toEqual(before);
  await node.press("Escape");
  await expect(node).not.toHaveAttribute("contenteditable", "true");
  expect(await geometry(node)).toEqual(before);
  const saving = page.waitForRequest((request) => request.method() === "PUT"
    && new URL(request.url()).pathname === "/api/pdf/update_pdf");
  await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
  const payload = (await saving).postDataJSON();
  expect(payload.template_id).toBe("regent");
  expect(payload.root.find((element) => element.element_id === generatedId).height).toBe(before.height);
  expect(JSON.stringify(payload)).not.toContain("canvas-hover");
  api.assertHermetic();
});

for (const { name, lineHeight, storedHeight, bulletList = true } of [
  { name: "rounded-down", lineHeight: 12.04, storedHeight: 24 },
  { name: "fractional", lineHeight: 12.04, storedHeight: 24.08 },
  { name: "fractional-short-leading", lineHeight: 11.8, storedHeight: 23.6 },
  { name: "rounded-down-plain", lineHeight: 12.04, storedHeight: 24, bulletList: false },
]) {
  test(`legacy saved ${name} textarea stays stable after space and letter input`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("token", "local-playwright-token");
      localStorage.setItem("cvstudio.uiLanguage", "pl");
    });
    const bodyId = "fit-fixture-26";
    const originalContent = `${bulletList ? "• " : ""}Prowadzenie dokumentacji administracyjnej, kontrola terminów i przygotowywanie raportów dla zespołu.`;
    let elements = fixture.elements.map((element) => ({ ...element,
      ...(element.element_id === bodyId ? {
        content: originalContent, lineHeight, height: storedHeight, fontSize: 9.5, width: 310, bulletList,
      } : {}),
    }));
    let savedDocument = { ...SAVED_DOCUMENT, template_id: "linden", cv_data: null,
      pages: Math.max(...elements.map((element) => element.page || 1)) };
    const api = await installMockApi(page, { savedDocument, savedElements: elements });
    await page.route("**/api/pdf/show_pdf", (route) => route.fulfill({ json: {
      document: savedDocument, elements: elements.map((element) => ({ ...element, extra_properties: element })),
    } }));
    await page.route("**/api/pdf/update_pdf", async (route) => {
      const body = route.request().postDataJSON();
      elements = body.root;
      savedDocument = { ...savedDocument, revision: savedDocument.revision + 1 };
      await route.fulfill({ json: { updated: true, pdf_id: savedDocument.id, revision: savedDocument.revision } });
    });
    await page.goto("/app/documents/41");
    const node = page.locator(`[id="${bodyId}"]`);
    const next = page.locator('[id="fit-fixture-27"]');
    await expect(node).toBeAttached({ timeout: 25_000 });
    await waitForGeneratedCanvas(page, node);
    const countRows = () => node.evaluate((element) => {
      const originalHeight = element.style.height;
      element.style.height = "auto";
      const style = getComputedStyle(element);
      const count = Math.round(parseFloat(style.height) / parseFloat(style.lineHeight));
      element.style.height = originalHeight;
      return count;
    });
    expect(await countRows(), "The legacy fixture must contain exactly two actual browser rows").toBe(2);
    const before = await geometry(node);
    const downstreamBefore = await geometry(next);
    expect(before.height).toBeCloseTo(storedHeight, 1);
    for (const value of [" ", "x"]) {
      await node.focus();
      await node.press("F2");
      await expect(node).toHaveAttribute("contenteditable", "true");
      await expect(page.locator('[data-anchor="topbar-zoom"]')).toContainText("280%");
      expect(await geometry(node)).toEqual(before);
      if (value === " ") await page.screenshot({ path: testInfo.outputPath(`legacy-${name}-before-space.png`) });
      await node.press("ControlOrMeta+End");
      await node.pressSequentially(value);
      expect(await countRows(), "A space or a short suffix must not introduce a new visual line").toBe(2);
      await page.screenshot({ path: testInfo.outputPath(`legacy-${name}-after-${value.trim() ? "letter" : "space"}.png`) });
      await expect.poll(() => geometry(node), { message: "An unchanged line count must preserve the saved fractional geometry" }).toEqual(before);
      expect(await geometry(next)).toEqual(downstreamBefore);
      await node.press("Escape");
      await expect(node).not.toHaveAttribute("contenteditable", "true");
      expect(await geometry(node)).toEqual(before);
    }
    // A long token must genuinely soft-wrap. Removing the token restores the
    // original two rows, including the saved fractional rounding baseline.
    await node.focus();
    await node.press("F2");
    await expect(node).toHaveAttribute("contenteditable", "true");
    await node.press("ControlOrMeta+End");
    await node.pressSequentially(` ${"a".repeat(120)}`);
    expect(await countRows()).toBeGreaterThan(2);
    await expect.poll(async () => (await geometry(node)).height).toBeGreaterThan(before.height + 10);
    await node.press("ControlOrMeta+Backspace");
    await node.press("Backspace");
    expect(await countRows()).toBe(2);
    await expect.poll(() => geometry(node)).toEqual(before);
    await node.press("Escape");
    await expect(node).not.toHaveAttribute("contenteditable", "true");
    await node.focus();
    await node.press("F2");
    await expect(node).toHaveAttribute("contenteditable", "true");
    await node.press("ControlOrMeta+End");
    await node.press("Enter");
    if (bulletList) await node.press("Enter");
    await expect.poll(async () => (await geometry(node)).height).toBeGreaterThan(before.height + 10);
    const grown = await geometry(node);
    await node.press("Escape");
    await expect(node).not.toHaveAttribute("contenteditable", "true");
    expect(await geometry(node)).toEqual(grown);
    await node.focus();
    await node.press("F2");
    await expect(node).toHaveAttribute("contenteditable", "true");
    await node.press("ControlOrMeta+End");
    await node.press("Backspace");
    await node.press("Escape");
    await expect(node).not.toHaveAttribute("contenteditable", "true");
    await expect.poll(() => geometry(node)).toEqual(before);
    expect(await geometry(next)).toEqual(downstreamBefore);
    await page.getByRole("button", { name: "Zapisz dokument", exact: true }).click();
    await expect(page.getByText("Zapisano w Moich dokumentach", { exact: true })).toBeVisible();
    const saved = elements.find((element) => element.element_id === bodyId);
    expect(saved.content).toBe(`${originalContent} x`);
    expect(saved.height).toBeCloseTo(storedHeight, 10);
    await page.reload();
    await expect(node).toBeAttached({ timeout: 25_000 });
    await waitForGeneratedCanvas(page, node);
    expect(await geometry(node)).toEqual(before);
    expect(await geometry(next)).toEqual(downstreamBefore);
    await node.focus();
    await node.press("F2");
    await expect(node).toHaveAttribute("contenteditable", "true");
    await node.press("ControlOrMeta+End");
    await node.pressSequentially(" ");
    await node.press("Escape");
    await expect(node).not.toHaveAttribute("contenteditable", "true");
    expect(await geometry(node)).toEqual(before);
    api.assertHermetic();
  });
}
