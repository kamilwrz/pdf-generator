import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

const LONG_REPLY = Array.from(
  { length: 24 },
  (_, index) => `Punkt ${index + 1}: szczegółowa rekomendacja do dokumentu.`,
).join("\n");

const JOB_MATCH_REQUIREMENTS = Array.from({ length: 18 }, (_, index) => ({
  id: `requirement-${index + 1}`,
  text: `Wymaganie oferty ${index + 1}`,
  importance: index < 12 ? "required" : "preferred",
  match_status: index % 3 === 0 ? "matched" : index % 3 === 1 ? "partial" : "missing",
  evidence_refs: [],
}));

async function stableElementHeight(locator) {
  let previousHeight = -1;
  let stableHeight = 0;

  await expect.poll(async () => {
    const box = await locator.boundingBox();
    const currentHeight = Math.round(box?.height ?? 0);
    const settledHeight = currentHeight > 0 && currentHeight === previousHeight
      ? currentHeight
      : 0;
    previousHeight = currentHeight;
    stableHeight = settledHeight || stableHeight;
    return settledHeight;
  }, { timeout: 2_000, intervals: [50, 50, 100, 150] }).toBeGreaterThan(0);

  return stableHeight;
}

test("AI assistant uses the wider panel and shifts a single A4 only when space allows", async ({ page }) => {
  // The desktop assertion requires room for A4 plus both 232px toolbar gutters.
  // At the default 1280px viewport, the geometry correctly caps the shift at zero.
  if (page.viewportSize().width > 720) await page.setViewportSize({ width: 1920, height: 1080 });
  const api = await installMockApi(page);
  await login(page);

  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

  const a4 = page.locator("[data-page-canvas]").first();
  const before = await a4.boundingBox();
  expect(before).not.toBeNull();

  await page.getByRole("button", { name: "Otwórz asystenta AI" }).click();
  const assistant = page.getByRole("complementary", { name: "Asystent AI" });
  await expect(assistant).toBeVisible();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  const panelBox = await assistant.boundingBox();
  expect(panelBox).not.toBeNull();
  if (viewportWidth > 720) {
    expect(Math.round(panelBox.width)).toBe(600);
    await expect.poll(async () => {
      const box = await a4.boundingBox();
      return Math.round((before?.x ?? 0) - (box?.x ?? 0));
    }).toBeGreaterThan(0);
    await expect(page.locator(".main-container")).toHaveAttribute("data-ai-assistant-open", "true");
  } else {
    expect(Math.round(panelBox.width)).toBe(viewportWidth - 56);
    const after = await a4.boundingBox();
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  }

  await page.getByRole("button", { name: "Zamknij asystenta AI" }).last().click();
  await expect(assistant).toBeHidden();
  await expect.poll(async () => {
    const box = await a4.boundingBox();
    return Math.abs((box?.x ?? 0) - (before?.x ?? 0));
  }).toBeLessThanOrEqual(1);
  api.assertHermetic();
});

test("edit zoom survives assistant focus and canvas scrolling until the bare A4 is clicked", async ({ page }) => {
  const api = await installMockApi(page);
  await login(page);

  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

  const name = page.locator("#saved-name");
  const canvas = page.locator(".canvas-area");
  const zoomLabel = page.getByText("280%", { exact: true });
  // This fixture's single-line field keeps a zero-height PDF baseline box;
  // dispatch the semantic click directly instead of asking Playwright to aim
  // at its editor-only pseudo hit area.
  await name.dispatchEvent("click");
  await expect(name).toHaveAttribute("contenteditable", "true");
  await expect(zoomLabel).toBeVisible();

  const canvasGutter = canvas.locator(".canvas-single");
  // A scrollbar/gutter interaction starts on canvas chrome. It must not leave
  // a pending exit request that a later assistant-focus blur can consume.
  await canvasGutter.dispatchEvent("pointerdown");
  await page.getByRole("button", { name: "Otwórz asystenta AI" }).click();
  await expect(page.getByRole("complementary", { name: "Asystent AI" })).toBeVisible();
  await expect(zoomLabel).toBeVisible();
  await page.getByRole("button", { name: "Zamknij asystenta AI" }).last().click();

  await canvas.hover();
  await page.mouse.wheel(0, 240);
  await expect(zoomLabel).toBeVisible();

  // Exercise the browser-owned vertical scrollbar itself. DOM-dispatched
  // pointer events do not cover this path because Chromium handles the thumb
  // drag before page event listeners receive it.
  const scrollbar = await canvas.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const trackInset = 10;
    const trackHeight = element.clientHeight - trackInset * 2;
    const thumbHeight = Math.max(48, trackHeight * element.clientHeight / element.scrollHeight);
    const availableTravel = Math.max(0, trackHeight - thumbHeight);
    const scrollRange = Math.max(1, element.scrollHeight - element.clientHeight);
    const thumbTop = bounds.top + trackInset + availableTravel * element.scrollTop / scrollRange;
    return {
      x: bounds.right - 6,
      y: thumbTop + thumbHeight / 2,
      before: element.scrollTop,
    };
  });
  await page.mouse.move(scrollbar.x, scrollbar.y);
  await page.mouse.down();
  await page.mouse.move(scrollbar.x, scrollbar.y + 80, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollbar.before);
  await expect(zoomLabel).toBeVisible();

  await canvasGutter.dispatchEvent("pointerdown");
  await canvasGutter.dispatchEvent("click");
  await expect(zoomLabel).toBeVisible();

  // Dispatch directly on the page node to model a bare A4 location without an
  // authored element or editor overlay becoming the event target.
  const bareA4 = page.locator("[data-page-canvas]").first();
  await bareA4.dispatchEvent("pointerdown");
  await bareA4.dispatchEvent("click");
  await expect(zoomLabel).toBeHidden();
  api.assertHermetic();
});

test("AI assistant keeps the conversation visible after a follow-up question", async ({ page }) => {
  const api = await installMockApi(page, {
    assistantResponses: [
      { message: LONG_REPLY, tips: [], corrections: [] },
      { message: "Druga odpowiedź pozostaje widoczna.", tips: [], corrections: [] },
    ],
  });
  await login(page);

  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  await page.getByRole("button", { name: "Otwórz asystenta AI" }).click();

  const input = page.getByPlaceholder("Zadaj pytanie lub wydaj polecenie…");
  await input.fill("Pierwsze pytanie");
  await page.getByRole("button", { name: "Wyślij" }).click();
  await expect(page.getByText("Punkt 24: szczegółowa rekomendacja do dokumentu.")).toBeVisible();

  await input.fill("Drugie pytanie");
  await page.getByRole("button", { name: "Wyślij" }).click();
  await expect(page.getByText("Druga odpowiedź pozostaje widoczna.")).toBeVisible();
  await expect(input).toBeEnabled();

  const conversation = page.getByRole("log", { name: "Rozmowa z asystentem AI" });
  const scrollState = await conversation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    lastMessageBottom: element.lastElementChild?.getBoundingClientRect().bottom ?? 0,
    viewportBottom: element.getBoundingClientRect().bottom,
  }));

  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(Math.abs(
    scrollState.scrollTop - (scrollState.scrollHeight - scrollState.clientHeight),
  )).toBeLessThanOrEqual(1);
  expect(scrollState.lastMessageBottom).toBeLessThanOrEqual(scrollState.viewportBottom + 1);
  await expect(page.getByText("Pierwsze pytanie", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Drugie pytanie", { exact: true })).toHaveCount(1);
  api.assertHermetic();
});

test("job-offer form restores its height after a long tailoring result", async ({ page }) => {
  const api = await installMockApi(page, {
    assistantResponses: [{
      message: "Analiza dopasowania została zakończona.",
      tips: [],
      corrections: [],
      job_offer: {
        title: "Analityk KYC",
        company: "Firma testowa",
        location: "Warszawa",
        source: "manual",
      },
      job_requirements: JOB_MATCH_REQUIREMENTS,
      evidence_gaps: [],
    }],
  });
  await login(page);

  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();
  await page.getByRole("button", { name: "Otwórz asystenta AI" }).click();

  const matchJobButton = page.getByRole("button", { name: "Dopasuj do oferty", exact: true });
  await matchJobButton.click();

  const jobOfferUrl = page.getByLabel("Link do oferty", { exact: true });
  const jobForm = jobOfferUrl.locator("..");
  const analyseButton = page.getByRole("button", { name: "Analizuj i przygotuj poprawki" });
  await jobOfferUrl.fill("https://example.com/oferty/analityk-kyc");
  const firstOpenHeight = await stableElementHeight(jobForm);

  await analyseButton.scrollIntoViewIfNeeded();
  await analyseButton.click();
  await expect(page.getByText("Wymaganie oferty 18", { exact: true })).toHaveCount(1);

  await matchJobButton.click();
  await expect(jobOfferUrl).toHaveValue("https://example.com/oferty/analityk-kyc");
  const secondOpenHeight = await stableElementHeight(jobForm);
  const formScrollState = await jobForm.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));

  expect(Math.abs(secondOpenHeight - firstOpenHeight)).toBeLessThanOrEqual(1);
  expect(formScrollState.clientHeight).toBeGreaterThan(0);
  expect(formScrollState.scrollHeight).toBeGreaterThanOrEqual(formScrollState.clientHeight);
  await analyseButton.scrollIntoViewIfNeeded();
  await expect(analyseButton).toBeVisible();
  api.assertHermetic();
});
