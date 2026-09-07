import { expect, test } from "@playwright/test";
import { installMockApi, login, SAVED_DOCUMENT, SAVED_ELEMENTS } from "./support/mockApi.js";

const contactElements = [
  {
    element_id: "outline-contacts-anchor", category: "text", content: "", left: 0, top: 0,
    width: 0, height: 0, flowRole: "masthead-anchor", contactBandId: "outline-contacts",
    contactBand: {
      id: "outline-contacts", mode: "centered", order: ["phone", "email", "location"],
      anchor: { centerX: 297.5, startY: 117, maxWidth: 471 },
      text: { fontFamily: "Montserrat", fontSizePt: 8, colorHex: "#657287" },
      icon: { sizePt: 10, theme: "meridian" },
      metrics: { iconGap: 11, itemPad: 16, lineStep: 13.5, charWidth: 5 },
    },
  },
  { element_id: "outline-phone", category: "text", content: "+48 000 000 000", left: 150, top: 117,
    fontSize: 8, fontFamily: "Montserrat", color: "#657287",
    contactBandId: "outline-contacts", contactChannel: "phone" },
  { element_id: "outline-email", category: "text", content: "imie.nazwisko@email.com", left: 250, top: 117,
    fontSize: 8, fontFamily: "Montserrat", color: "#657287",
    contactBandId: "outline-contacts", contactChannel: "email" },
  { element_id: "outline-location", category: "text", content: "Miasto, kraj", left: 390, top: 117,
    fontSize: 8, fontFamily: "Montserrat", color: "#657287",
    contactBandId: "outline-contacts", contactChannel: "location" },
].map((element) => ({ ...element, page: 1, extra_properties: { ...element } }));

async function clickVisibleText(page, locator) {
  const box = await locator.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function selectionFrameError(locator) {
  return locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const ink = range.getBoundingClientRect();
    const frames = [...document.querySelectorAll("div")].filter((candidate) => {
      const style = getComputedStyle(candidate);
      return style.position === "absolute"
        && style.borderTopStyle === "solid"
        && style.borderTopColor === "rgb(21, 94, 239)";
    });
    return frames.reduce((best, frame) => {
      const box = frame.getBoundingClientRect();
      const error = Math.max(
        Math.abs(box.left - (ink.left - 2)),
        Math.abs(box.top - (ink.top - 2)),
        Math.abs(box.width - (ink.width + 4)),
        Math.abs(box.height - (ink.height + 4)),
      );
      return Math.min(best, error);
    }, Infinity);
  });
}

// Exercise actual Range geometry in Chromium; jsdom cannot reproduce alignment,
// zero-height PDF baselines, web-font metrics or transformed canvas coordinates.
for (const width of [390, 768, 1280, 1920]) {
  test(`text edit outline follows glyphs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: width === 768 ? "reduce" : "no-preference" });
    const headings = ["left", "center", "right"].map((align, index) => ({
      element_id: `outline-${align}`, category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
      left: 58, top: 200 + index * 60, width: 479, fontSize: 7.5, page: 1,
      extra_properties: { align, fontFamily: "Montserrat", bold: true, letterSpacing: 1.9 },
    }));
    const api = await installMockApi(page, {
      savedElements: [SAVED_ELEMENTS[0], ...headings],
      savedDocument: { ...SAVED_DOCUMENT, template_id: "aurelia", cv_data: null },
    });
    await login(page);
    await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
    await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

    for (const heading of headings) {
      const node = page.locator(`[id="${heading.element_id}"]`);
      await node.focus();
      await node.press("F2");
      await expect(node).toHaveAttribute("contenteditable", "true");
      for (const content of [heading.content, "NOWY NAGŁÓWEK", "X"]) {
        // PDF-baseline paragraphs have zero CSS height even while their glyphs
        // are visible. Use native keyboard editing, as the user does, not fill's
        // rectangular visibility gate.
        if (content !== heading.content) {
          await node.press("ControlOrMeta+a");
          await node.pressSequentially(content);
        }
        await expect.poll(() => node.evaluate((el) => {
          const canvas = el.closest("[data-page-canvas]");
          const scale = canvas.getBoundingClientRect().width / canvas.clientWidth;
          const range = document.createRange();
          range.selectNodeContents(el);
          const ink = range.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          const pseudo = getComputedStyle(el, "::after");
          // The focus frame adds exactly two screen pixels of breathing room
          // on each side, independently of the authored 479-unit frame.
          return Math.max(
            Math.abs(box.left + parseFloat(pseudo.left) * scale - (ink.left - 2)),
            Math.abs(box.top + parseFloat(pseudo.top) * scale - (ink.top - 2)),
            Math.abs(parseFloat(pseudo.width) * scale - (ink.width + 4)),
            Math.abs(parseFloat(pseudo.height) * scale - (ink.height + 4)),
          );
        })).toBeLessThan(1);
        expect(await node.evaluate((el) => getComputedStyle(el).width)).toBe("479px");
      }
      if (width === 1920 && heading.element_id === "outline-center") {
        await node.press("ControlOrMeta+a");
        await node.pressSequentially(heading.content);
        await expect.poll(() => node.evaluate((el) => parseFloat(el.style.getPropertyValue("--text-edit-width"))))
          .toBeGreaterThan(100);
        await page.screenshot({ path: "test-results/text-edit-outline.png" });
      }
      await node.press("ControlOrMeta+a");
      await node.press("Backspace");
      await expect.poll(() => node.evaluate((el) => el.style.getPropertyValue("--text-edit-width"))).toBe("");
      await node.pressSequentially("Nowy tekst");
      await expect.poll(() => node.evaluate((el) => parseFloat(el.style.getPropertyValue("--text-edit-width"))))
        .toBeGreaterThan(0);
      await node.press("Escape");
      await expect(node).not.toHaveAttribute("contenteditable", "true");
      expect(await node.evaluate((el) => el.style.getPropertyValue("--text-edit-width"))).toBe("");
      await expect.poll(() => selectionFrameError(node)).toBeLessThan(1);
    }
    const request = page.waitForRequest((req) => req.method() === "PUT"
      && new URL(req.url()).pathname === "/api/pdf/update_pdf");
    await page.getByRole("button", { name: "Zapisz dokument" }).click();
    const payload = (await request).postDataJSON();
    for (const heading of headings) {
      expect(payload.root.find((el) => el.element_id === heading.element_id))
        .toMatchObject({ width: 479, left: 58, category: "text" });
    }
    expect(JSON.stringify(payload)).not.toContain("--text-edit-");
    api.assertHermetic();
  });
}

test("contact outline stays on the glyphs after delete and add-channel controls", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await installMockApi(page, {
    savedElements: [SAVED_ELEMENTS[0], ...contactElements],
    savedDocument: { ...SAVED_DOCUMENT, template_id: "meridian", cv_data: null },
  });
  await login(page);
  await page.getByText("Kontynuuj ostatnie CV", { exact: true }).click();
  await page.getByRole("button", { name: "Otwórz na płótnie" }).click();

  const phone = page.locator("#outline-phone");
  await clickVisibleText(page, phone);
  await expect(phone).toHaveAttribute("contenteditable", "true");
  await phone.dispatchEvent("pointerenter");
  await page.getByRole("button", { name: "Usuń kontakt: Telefon" }).click();
  await expect(phone).toHaveCount(0);

  const email = page.locator("#outline-email");
  await clickVisibleText(page, email);
  await expect(email).toHaveAttribute("contenteditable", "true");
  await email.dispatchEvent("pointerenter");
  await page.getByRole("button", { name: "Dodaj kontakt", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(email).not.toHaveAttribute("contenteditable", "true");
  await expect.poll(() => selectionFrameError(email)).toBeLessThan(1);
  api.assertHermetic();
});
