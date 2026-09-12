import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mockApi.js";

// The first direct editor route compiles a large lazy-loaded Vite module.
test.setTimeout(60_000);

const COPY = {
  pl: {
    title: "Styl umiejętności",
    documentName: "Nazwa bieżącego dokumentu",
    trigger: /^Styl umiejętności:/,
    close: /^Zamknij/,
    choices: ["W linii", "Lista", "Owalne z tłem", "Owalne z obrysem",
      "Prostokątne z tłem", "Prostokątne z obrysem", "Zaokrąglone z obrysem",
      "Zaokrąglone z tłem", "Podkreślone"],
  },
  en: {
    title: "Skills style",
    documentName: "Current document name",
    trigger: /^Skills style:/,
    close: /^Close/,
    choices: ["Inline", "List", "Oval with fill", "Oval with outline",
      "Rectangular with fill", "Rectangular with outline", "Rounded with outline",
      "Rounded with fill", "Underlined"],
  },
};

/** Opens a real saved editor fixture with a persisted application language. */
async function openEditor(page, language) {
  await page.addInitScript((choice) => {
    localStorage.setItem("cvstudio.uiLanguage", choice);
    localStorage.setItem("token", "local-playwright-token");
    localStorage.setItem("username", "Kamil");
  }, language);
  const api = await installMockApi(page);
  await page.goto("/app/documents/41");
  await expect(page.getByRole("textbox", { name: COPY[language].documentName }))
    .toHaveValue("CV Smoke", { timeout: 25_000 });
  await expect(page.locator("#skills-tools-body")).toContainText("Figma");
  return api;
}

/**
 * Reach the section action by keyboard after revealing its contextual toolbar.
 * A synthetic pointer entry avoids measuring the zero-height authored heading
 * box; Enter still exercises the production focus and panel-opening path.
 */
async function openStylePanel(page, language) {
  const heading = page.locator("#skills-heading");
  await heading.scrollIntoViewIfNeeded();
  await heading.dispatchEvent("pointerenter");
  const toolbar = page.locator('[data-canvas-toolbar-key="heading:skills-heading"]');
  const trigger = toolbar.getByRole("button", { name: COPY[language].trigger });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: COPY[language].title, exact: true });
  await expect(panel).toBeVisible();
  return { panel, heading };
}

/** Uses the same dirty-state boundary as real navigation and browser exit. */
function hasUnsavedChanges(page) {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

for (const language of ["pl", "en"]) {
  test(`skills styles apply through arrow keys and restore section focus (${language})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 960 });
    const api = await openEditor(page, language);
    const { panel, heading } = await openStylePanel(page, language);
    const copy = COPY[language];
    const radios = panel.getByRole("radio");
    await expect(radios).toHaveCount(9);
    await expect(panel.getByRole("radio", { name: copy.choices[0], exact: true })).toBeFocused();
    await expect(panel.locator('[aria-modal="true"]')).toHaveCount(0);

    // Native arrow-key selection must commit to the document immediately.
    // Reopening verifies that the checked value is derived from saved editor
    // elements rather than an uncommitted local selection inside the panel.
    await page.keyboard.press("ArrowRight");
    await expect(panel.getByRole("radio", { name: copy.choices[1], exact: true })).toBeChecked();
    await expect(panel).toBeVisible();
    await expect.poll(() => hasUnsavedChanges(page)).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(panel.getByRole("radio", { name: copy.choices[2], exact: true })).toBeChecked();
    await expect(panel.getByRole("status")).toContainText(copy.choices[2]);
    await expect(panel.locator('input[type="radio"]:checked')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(heading).toBeFocused();

    const reopened = (await openStylePanel(page, language)).panel;
    await expect(reopened.getByRole("radio", { name: copy.choices[2], exact: true })).toBeChecked();
    await expect(reopened.getByRole("radio", { name: copy.choices[2], exact: true })).toBeFocused();
    await reopened.getByRole("button", { name: copy.close }).click();
    await expect(reopened).toHaveCount(0);
    await expect(heading).toBeFocused();
    api.assertHermetic();
  });

  test(`opening and selecting the current skills style preserves a clean document (${language})`, async ({ page }) => {
    const api = await openEditor(page, language);
    await expect.poll(() => hasUnsavedChanges(page)).toBe(false);
    const original = await page.locator("#skills-tools-body").textContent();
    const { panel, heading } = await openStylePanel(page, language);
    await expect(panel.getByRole("radio", { name: COPY[language].choices[0], exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(panel.getByRole("radio", { name: COPY[language].choices[0], exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(heading).toBeFocused();
    expect(await hasUnsavedChanges(page)).toBe(false);
    await expect(page.locator("#skills-tools-body")).toHaveText(original);
    expect(api.calls.filter((call) => call.path === "/pdf/update_pdf")).toHaveLength(0);
    api.assertHermetic();
  });

  for (const width of [390, 640, 834, 1280, 1920]) {
    test(`skills style panel stays readable and reachable at ${width}px (${language})`, async ({ page }, testInfo) => {
      // A 640×480 CSS viewport covers the reflow available at 200% browser
      // zoom on a 1280×960 screen; other sizes cover compact through wide UI.
      const height = width === 640 ? 480 : 960;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const api = await openEditor(page, language);
      const { panel } = await openStylePanel(page, language);
      const copy = COPY[language];
      const assistantLauncher = page.locator('button[aria-controls="ai-assistant-panel"]');
      await expect(assistantLauncher).toBeHidden();
      await expect(panel.getByRole("radio")).toHaveCount(9);
      for (const name of copy.choices) {
        await expect(panel.getByRole("radio", { name, exact: true })).toHaveCount(1);
      }

      const bounds = await panel.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

      // Measure clickable labels, not their intentionally visually-hidden
      // native radio inputs. Each remains a useful editor-sized touch target.
      const choices = await panel.getByRole("radio").evaluateAll((inputs) => inputs.map((input) => {
        const label = input.closest("label");
        const rect = label.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }));
      const columns = choices.filter((choice) => Math.abs(choice.y - choices[0].y) < 1).length;
      expect(columns).toBe(width <= 480 ? 2 : 3);
      for (const choice of choices) {
        expect(choice.width).toBeGreaterThanOrEqual(36);
        expect(choice.height).toBeGreaterThanOrEqual(36);
      }
      const close = panel.getByRole("button", { name: copy.close });
      await expect(close).toBeInViewport();
      const closeBounds = await close.boundingBox();
      expect(closeBounds.width).toBeGreaterThanOrEqual(36);
      expect(closeBounds.height).toBeGreaterThanOrEqual(36);
      await page.screenshot({ path: testInfo.outputPath(`skills-style-${language}-${width}.png`) });
      if (language === "pl" && width === 1920) {
        const guidance = page.getByRole("status").filter({ hasText: "Edytuj bezpośrednio na CV" });
        await guidance.getByRole("button").click();
        await expect(guidance).toBeHidden();
        await panel.getByRole("radio", { name: copy.choices[0], exact: true }).focus();
        await panel.screenshot({ path: testInfo.outputPath("skills-style-panel-preview.png") });
      }
      // Settings are screen-only application chrome and must never print.
      await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
      await expect(panel).toBeHidden();
      await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
      await expect(panel).toBeVisible();

      // The last option must scroll into the one panel body without moving
      // its persistent close control out of reach, even at the zoom viewport.
      const last = panel.getByRole("radio", { name: copy.choices[8], exact: true });
      await last.focus();
      await page.keyboard.press("Space");
      await expect(last).toBeChecked();
      await expect(last.locator("..")).toBeInViewport();
      await expect(close).toBeInViewport();
      await expect(panel).toHaveCSS("opacity", "1");
      expect(await panel.evaluate((node) => node.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running").length)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`skills-style-${language}-${width}-last.png`) });
      await close.click();
      await expect(panel).toHaveCount(0);
      await expect(assistantLauncher).toBeVisible();
      const reopened = (await openStylePanel(page, language)).panel;
      const selected = reopened.getByRole("radio", { name: copy.choices[8], exact: true });
      await expect(selected).toBeFocused();
      await expect(selected.locator("..")).toBeInViewport();
      await reopened.getByRole("button", { name: copy.close }).click();
      await expect(reopened).toHaveCount(0);
      await expect(assistantLauncher).toBeVisible();
      api.assertHermetic();
    });
  }
}
