import { expect, test } from "@playwright/test";
import { installMockApi, login } from "./support/mockApi.js";

const LONG_REPLY = Array.from(
  { length: 24 },
  (_, index) => `Punkt ${index + 1}: szczegółowa rekomendacja do dokumentu.`,
).join("\n");

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
